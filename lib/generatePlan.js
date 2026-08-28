// lib/generatePlan.js
//
// HERB — the weekly plan allocation engine (v1, dinner-first).
//
// PURE FUNCTION. No DB access, no clock, no I/O. Everything it needs is passed in;
// everything it decides comes back in the return value. That is what makes it
// deterministic (same inputs + seed -> same plan) and unit-testable with hand-built
// inventory fixtures. The DB-facing read/apply RPCs live separately.
//
// Implements the locked plan model (HERB_Weekly_Plan_Model.md §2):
//   - Freezer is a BUFFER held in a 4-6 band, not a bucket.
//   - Fill order: existing FREEZER stock (soonest-expiry first, anti-waste)
//       -> existing FRIDGE stock -> BATCH COOKS on batch days -> EMPTY (stated).
//   - Each batch = 4 portions by default: 2 fresh (land within batch_day+3) + 2 freeze.
//   - Cook TO THE GAP: number of batches derived from shortfall, then adjusted by
//       projected end-of-week freezer level (>6 cut a batch, <4 add one, 4-6 leave).
//   - Variety: a recipe appears at most 2x/week (3 at a push) for lunch/dinner.
//
// v1 SCOPE (honest): dinner only (recipes.section is course, not meal-type, so
// breakfast/lunch need a meal_type tag first). Household defaults to 1. Guests scale
// a slot's portions up and are cooked fresh (never frozen). Newly-frozen batch surplus
// refills the buffer and is NOT re-pulled the same week — only PRE-EXISTING freezer
// stock fills this week's gaps.

const FRESH_SHELF_DAYS = 3;       // a batch's fresh portions must land within [batch_day, +3]
const BATCH_SIZE = 4;             // default portions per cook
const BATCH_FRESH = 2;            // default fresh split
const BATCH_FREEZE = 2;           // default freeze split
const FREEZER_BAND_LOW = 4;
const FREEZER_BAND_HIGH = 6;
const VARIETY_CAP = 2;            // max times a recipe is CHOSEN for a fresh batch this week
const SLOTS_PER_RECIPE_CAP = 2;   // max SLOTS one recipe may fill in a lunch/dinner week

// ---- MACRO TARGETING (bridge items 4 + 5) ------------------------------------
// The four design calls, settled 28 Aug 2026, and the reasoning that decided
// each one — because the next person to read this will want to change one of
// them and should know what it costs.
//
// 1. DAILY vs WEEKLY is not one answer, it is one per macro.
//    Weight change follows the WEEK's calorie total, so forcing every day onto
//    the number buys nothing physiological and fights the batch machinery — a
//    pot covers two days at whatever it covers them at. But a carb ceiling
//    AVERAGED over a week is meaningless: 20 g Monday and 50 g Tuesday is not a
//    low-carb week, it is a low-carb Monday. Protein is the same — banking it
//    and slamming it on Sunday does not protect lean mass in a deficit.
//    So: carbs and protein bind DAILY, calories are a WEEKLY budget with a
//    daily band.
//
// 2. SWAP, never SCALE. `expand()` below breaks stock into whole portions and
//    pulls them one at a time; you cannot pull 0.7 of a frozen portion. And
//    `slot.portions` already means HOW MANY PEOPLE (household + guests) —
//    overloading it as a scale factor is a collision, not a style objection.
//    Scaling could therefore only ever work on fresh cooks, a minority of the
//    week. So the engine corrects by choosing a different dish.
//
// 3. TIE-BREAK: safety -> carb ceiling -> anti-waste -> protein floor -> kcal
//    band -> cost. Anti-waste beats the macro BAND because expiring food is
//    real money and a 10 g protein miss on a Tuesday is not. Nothing beats the
//    carb ceiling except safety, because the ceiling is the difference between
//    this being THE plan and A plan. Cost stays a reported number and never
//    selects — that is a bigger change and does not ride in on this one.
//    Consequence in code: the ceiling is a HARD gate on every fill path,
//    including stock pulls; the kcal band and protein floor are SOFT scoring
//    used only where the engine is choosing freely, so they can never reorder
//    an anti-waste pull.
//
// 4. THE BAND. Fat gets none, by design: lib/targets.js computes fat as the
//    RESIDUAL, (kcal - protein*4 - carbs*4) / 9. Band kcal, protein and carbs
//    and fat is already fully determined — a fat band would add nothing and
//    could make a week unsolvable. Protein gets a floor and no ceiling: never
//    reject a dish for having too much protein.
//
// 5. THE CARB CEILING IS DATA, NOT A CONSTANT (Karum, 28 Aug 2026).
//    35 g/day is a property of KETO, not of HERB. On a calorie-deficit diet the
//    number moves; on a bulk it may not exist at all. A constant here would make
//    the engine keto-only forever and fork the rule out of the database — the
//    same mistake as the off-meat vocabulary testing for values the column was
//    forbidden to hold. So the ceiling arrives on `constraints.diet` and this
//    file knows nothing about any particular diet.
//
//    There is deliberately NO DEFAULT CEILING. A missing ceiling means no
//    ceiling, never 35 — silently applying keto's rule to a bulk would be worse
//    than applying none. What is NOT allowed is for that to be quiet: the
//    rationale states the ceiling and where it came from on every single week,
//    so "this diet has no ceiling" can never be confused with "somebody
//    misconfigured the diet row".
const KCAL_DAY_BAND = 0.10;       // default: a day may sit within +/-10% of target
const KCAL_WEEK_BAND = 0.05;      // default: the week's average within +/-5%
//
// 6. PROTEIN IS DRIVEN, NOT PREFERRED (Karum, 28 Aug 2026).
//    The first cut scored protein softly and gated carbs hard, so on a tight day
//    the engine would quietly under-shoot protein to protect the ceiling. The
//    grade proved it: only 60% of days reached a 152 g floor, with the ceiling
//    on OR off. Karum called the same gap from his own logged weeks before
//    seeing the number.
//    So when a day falls behind its protein pace, protein's weight rises sharply
//    AND protein-type variety yields to it. Variety is a nicety; the floor is the
//    point. It still never blanks a slot to chase protein — a missed day is
//    reported, not punished.
//
// 7. FAT IS THE LEVER, AND IT IS WHAT MAKES THE ORDER SOLVABLE.
//    Karum's sequence is protein -> carbs -> calories -> fat. Follow it through:
//    pin protein, cap carbs, band calories, and fat is the ONLY degree of
//    freedom left. Without a lever the engine's only move on a day that will not
//    balance is to leave the slot empty, which is why calories came out ~10%
//    under target in the grade. With one, it closes the gap instead.
//    Fat is the right lever on keto specifically because oil carries no carbs:
//    it can add calories without touching the constraint that binds.
const W_PROTEIN = 2;              // when the day is on pace for protein
const W_PROTEIN_BEHIND = 6;       // when it is behind, protein dominates the choice
const W_CARB_PRESSURE = 1;
const W_KCAL = 1;                 // when nothing else can close the calorie gap
const W_KCAL_WITH_LEVER = 0.25;   // when fat closes it afterwards, calories step back
const FAT_LEVER_MIN_G = 3;        // below this it is noise, not a decision
// Reporting tolerance on the protein FLOOR. Not a change to how hard the engine
// drives protein — only to when it calls a day short.
//
// The first live week read "6 days fall short of the 183 g protein floor" for
// days of 179, 180, 169, 150, 180 and 177. Five of those are within 6 g of the
// number and one is 33 g under, and reporting them identically buries the only
// one worth acting on. A floor reported as a binary throws away the magnitude,
// which is the whole of the information.
const PROTEIN_FLOOR_TOLERANCE = 0.05;

// ---- small deterministic RNG (mulberry32) -------------------------------------
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- date helpers (string-date arithmetic, UTC-safe, no locale drift) ----------
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round(
    (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000
  );
}

/**
 * @param {object} constraints  the plan_weeks.constraints jsonb
 * @param {Array}  inventory     cooked-portion stock: {recipe_id, location, quantity, expiry_date}
 *                               (already filtered to expiry_date >= today by the caller)
 * @param {Array}  recipes       full recipe pool: {id, name, protein_type, meal_types,
 *                               freezes, batch_portions, fresh_portions, fresh_shelf_days}.
 *                               Eligibility per slot is by meal_types; breakfast is its
 *                               own pool, lunch+dinner share one.
 * @param {object} opts          { weekStart: 'YYYY-MM-DD', seed: int }
 * @returns {object} { slots, batches, rationale, projectedFreezerEnd }
 */
function generatePlan(constraints, inventory, recipes, opts) {
  const weekStart = opts.weekStart;
  const seed = opts.seed || 1;
  const rng = makeRng(seed);
  const rationale = [];

  // Meals in DAY ORDER. snack_am / snack_pm are two distinct slots so a morning
  // and an afternoon snack can both exist on one date (plan_slots is unique on
  // user+date+meal, so they cannot share the key 'snack').
  const ALL_MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner'];
  // Which recipe tag a slot needs. Both snack slots draw the SAME 'snack' tag —
  // a recipe is tagged for what it IS, not for when you happen to eat it.
  const TAG_FOR_MEAL = { breakfast: 'breakfast', snack_am: 'snack', snack_pm: 'snack', lunch: 'lunch', dinner: 'dinner' };
  // Light meals: fresh-cover only, never batched, never frozen, no variety cap.
  const LIGHT_MEALS = new Set(['breakfast', 'snack_am', 'snack_pm']);
  const mealsToPlan = (constraints.meals_to_plan || ['dinner'])
    .filter((m) => ALL_MEALS.includes(m));

  // A recipe can serve a meal if its meal_types lists it. Breakfast is its own pool;
  // lunch and dinner share one interchangeable pool. Legacy rows with no tag fall
  // back to lunch/dinner (never breakfast) so untagged data can't put a dinner dish
  // at breakfast.
  const canServe = (r, meal) => {
    const need = TAG_FOR_MEAL[meal] || meal;
    const types = Array.isArray(r.meal_types) && r.meal_types.length
      ? r.meal_types
      : ['lunch', 'dinner'];
    return types.includes(need);
  };
  const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const household = constraints.household || 1;
  const outs = constraints.outs || [];
  const batchDays = (constraints.batch_days || []).slice().sort();
  const guests = constraints.guests || [];

  // ---- TARGETS (bridge item 4) -------------------------------------------------
  // constraints.targets arrives from get_plan_inputs v4, which reads profiles
  // LIVE on every call. That is the whole of bridge item 6: commit_targets
  // writes profiles, get_plan_inputs reads profiles, so the next plan after a
  // commit uses the new numbers. There is no cached second copy to go stale,
  // which is why nothing here needs invalidating.
  //
  // `source` is carried in the DATA rather than inferred from a null, so the
  // engine can tell "you have no profile" from "your profile has no targets"
  // and say the right one out loud. A setting written and never read back looks
  // like a bug; a setting read back as null and never mentioned is worse.
  const targets = constraints.targets || null;
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const targetKcal = num(targets && targets.kcal);
  const targetProteinG = num(targets && targets.protein_g);
  // The AIM is profiles.target_carbs_g — a number the user's own targets carry.
  // The CEILING belongs to the DIET and arrives on constraints.diet, because it
  // is a property of keto rather than of this user or of HERB.
  const targetCarbsAimG = num(targets && targets.carbs_g);
  const diet = constraints.diet || null;
  const dietKey = (diet && diet.key) || null;
  // null is a legitimate value meaning "this diet has no carb ceiling". It is
  // NOT a fallback to 35, and it is never silent — see the rationale below.
  const carbCeilingG = num(diet && diet.carb_ceiling_g);
  const dietSource = (diet && diet.source) || (diet ? 'diet' : 'absent');
  // Bands may be overridden per diet; the constants above are the defaults.
  const kcalDayBand = num(diet && diet.kcal_day_band) ?? KCAL_DAY_BAND;
  const kcalWeekBand = num(diet && diet.kcal_week_band) ?? KCAL_WEEK_BAND;
  // Declared here because the SELECTION needs to know a lever exists long before
  // the lever itself runs — see the weight note in fitScore.
  const hasFatLever = !!(diet && diet.fat_lever && num(diet.fat_lever.kcal_per_g) > 0);
  // Targeting needs BOTH numbers. kcal alone cannot place a protein floor and
  // protein alone cannot band a day, so a half-populated profile turns it off
  // rather than half-applying it.
  const targetingOn = targetKcal != null && targetProteinG != null;

  // Per-portion macros off the recipe row. `== null` and NOT falsiness: a dish
  // with 0 g carbs is a real dish and must not read as "no data". This is the
  // same trap as `coalesce` rescuing null and not zero.
  const macrosOf = (r) => {
    if (!r) return { kcal: null, protein_g: null, carbs_g: null, fat_g: null };
    return {
      kcal: num(r.kcal),
      protein_g: num(r.protein_g),
      carbs_g: num(r.carbs_g),
      fat_g: num(r.fat_g),
    };
  };
  const macrosById = (id) => macrosOf(recipeById[id]);
  // A recipe whose macros are unknown cannot be judged against the ceiling. It
  // is NOT silently allowed through as if it passed — it is allowed through and
  // COUNTED, and the count is reported. SOP v13 rule 3 in the mirror: a filter
  // is inert wherever its column is null, and the only defence is to say so.
  const hasMacros = (id) => macrosById(id).carbs_g != null && macrosById(id).kcal != null;
  const unknownMacroIds = new Set();

  // ---- 0. POOL FILTERS — safety first, then this week's appetite ---------------
  // Order matters, and the first two are NOT optional.
  //
  // Allergens were a live correctness hole: the dashboard's Swap chooser filtered
  // by profiles.allergens against recipe_allergens.contains, and the PLANNER did
  // not — so the automatic path could put a declared allergen on the calendar
  // while the manual path refused to. Permanent exclusions now bind the planner
  // too, and they bind existing stock as well: an allergen in the freezer is
  // still an allergen.
  //
  // Everything under `appetite` is THIS WEEK ONLY and resets next week.
  const appetite = constraints.appetite || {};
  const userAllergens = new Set(constraints.allergens || []);        // permanent
  const weekAllergens = new Set(appetite.avoid_allergens || []);     // this week only
  const dislikedIds = new Set(constraints.exclude_recipe_ids || []); // permanent
  const includeIds = (appetite.include_recipe_ids || []).filter(Boolean);
  // "Off meat" drops the land meats and keeps fish, seafood and vegetarian.
  //
  // These MUST be values recipes.protein_type can actually hold. Its CHECK
  // constraint allows exactly five: red_meat, poultry, fish, seafood,
  // vegetarian. The previous default was ['beef','pork','lamb','chicken'] —
  // none of which the column is permitted to store — so this filter could never
  // have matched a legal row. Off meat was dead twice over: no data in the
  // column, AND a test for values it is forbidden to hold.
  //
  // red_meat + poultry is exactly the locked rule ("drops beef, pork, lamb and
  // chicken; fish and vegetarian stay"), and it settles venison for free —
  // there is no venison value, venison is red_meat, so it drops with the rest.
  //
  // Override per-week by passing appetite.meat_types.
  const MEAT = new Set(appetite.meat_types || ['red_meat', 'poultry']);
  // ---- TASTE STEERS: cuisine + dish type ---------------------------------------
  // recipes.cuisine and recipes.dish_type are single-valued tags on the recipe
  // ("Indian", "curry"). appetite.cuisines / appetite.dish_types are ARRAYS of
  // the tags the user picked this week; empty means "no preference", which is
  // NOT the same as "match nothing".
  //
  // These are TASTE steers, not safety filters, and they are deliberately NOT in
  // blockReason. Two reasons:
  //
  //   1. They must not bind LIGHT MEALS. Breakfasts, shakes and snacks carry the
  //      'Anytime' cuisine because they have none, so a global "Indian" filter
  //      would empty the breakfast pool and silently blank seven breakfasts and
  //      fourteen snacks. Light meals are already exempt from the slot cap; they
  //      are exempt from taste for the same reason — you steer DINNER towards
  //      Thai, not your morning shake.
  //   2. Safety exclusions (allergens, dislikes) bind every path and every pool.
  //      A preference must never be able to sit in the same list as those and be
  //      mistaken for one.
  //
  // Legacy: appetite.cuisine was a free-text keyword matched against the recipe's
  // name/blurb. Weeks saved before the tags existed still carry it, so it keeps
  // working as a substring match rather than silently doing nothing.
  const wantCuisines = (appetite.cuisines || []).filter(Boolean);
  const wantDishTypes = (appetite.dish_types || []).filter(Boolean);
  const legacyTerm = (appetite.cuisine || '').trim().toLowerCase();
  const matchesTaste = (r) => {
    if (wantCuisines.length && !wantCuisines.includes(r.cuisine)) return false;
    if (wantDishTypes.length && !wantDishTypes.includes(r.dish_type)) return false;
    if (legacyTerm && ![r.cuisine, r.dish_type, r.tag, r.section, r.name, r.blurb]
      .some((v) => typeof v === 'string' && v.toLowerCase().includes(legacyTerm))) return false;
    return true;
  };
  // Light meals ignore the steer entirely; lunch/dinner obey it.
  const tasteOK = (r, meal) => LIGHT_MEALS.has(meal) || matchesTaste(r);

  const blockReason = (r) => {
    const has = Array.isArray(r.allergens) ? r.allergens : [];
    if (has.some((a) => userAllergens.has(a))) return 'allergens';
    if (has.some((a) => weekAllergens.has(a))) return 'avoided this week';
    if (dislikedIds.has(r.id)) return 'dislikes';
    if (appetite.avoid_meat && MEAT.has(r.protein_type)) return 'off meat';
    if (includeIds.length && !includeIds.includes(r.id)) return 'not chosen this week';
    return null;
  };
  const blockedCounts = {};
  const allowedRecipes = recipes.filter((r) => {
    const why = blockReason(r);
    if (why) { blockedCounts[why] = (blockedCounts[why] || 0) + 1; return false; }
    return true;
  });
  const allowedIds = new Set(allowedRecipes.map((r) => r.id));
  const isAllowed = (id) => allowedIds.has(id);
  for (const [why, n] of Object.entries(blockedCounts)) {
    rationale.push(`${n} recipe${n > 1 ? 's' : ''} excluded by ${why}.`);
  }
  if (allowedRecipes.length === 0) {
    rationale.push('No recipes left after your filters — nothing could be planned. Loosen one of them.');
  }

  const isOut = (date, meal) =>
    outs.some((o) => o.date === date && o.meal === meal);
  const guestCount = (date, meal) => {
    const g = guests.find((x) => x.date === date && x.meal === meal);
    return g ? g.count : 0;
  };

  // ---- 1. DEMAND: the IN-slots to fill --------------------------------------
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const slots = [];       // final output rows
  const inSlots = [];     // slots that need a portion (not outs)
  for (const date of days) {
    for (const meal of mealsToPlan) {
      if (isOut(date, meal)) {
        // portions:1, not 0. An out-slot feeds nobody from the kitchen, but
        // plan_slots carries CHECK (portions > 0) and a single zero aborts the
        // whole apply_generated_plan insert — one out-day killed the entire
        // week's plan. The value is inert: every consumer below skips a slot
        // whose source is not 'empty', and demand totals run over inSlots,
        // which never contains an out.
        slots.push({ slot_date: date, meal, source: 'out', recipe_id: null, portions: 1 });
        continue;
      }
      const g = guestCount(date, meal);
      const portions = household + g; // guests add on top; household=1 default
      const slot = { slot_date: date, meal, source: 'empty', recipe_id: null, portions, guest: g > 0 };
      slots.push(slot);
      inSlots.push(slot);
    }
  }

  // ---- 1b. THE DAY LEDGER (bridge item 5) --------------------------------------
  // What the day has accumulated so far, updated the moment a slot is filled,
  // because the carb ceiling is a RUNNING budget and not a per-dish test.
  //
  // That distinction is the whole design, and the live data settles it: no
  // recipe in the book exceeds 19 g of carbs, so a per-dish carb filter would
  // never once fire — it would be dead code of exactly the protein_type shape.
  // Five meals averaging 8.7 g, though, is ~43 g and over the ceiling. The
  // ceiling can only ever bind across a DAY, so that is where it is applied.
  //
  // ONE PORTION PER SLOT, never slot.portions. `portions` is household + guests
  // — it is how many mouths the cook feeds. The macro budget belongs to the
  // profile owner, who eats one of them however many people sit down.
  const dayLedger = {};       // date -> { kcal, protein_g, carbs_g, filled }
  const dayPlanCount = {};    // date -> how many non-out slots this day has
  for (const s of inSlots) {
    dayPlanCount[s.slot_date] = (dayPlanCount[s.slot_date] || 0) + 1;
    dayLedger[s.slot_date] ||= { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, filled: 0, unknown: 0, fat_added_g: 0 };
  }
  const recordMacros = (recipeId, slot) => {
    const led = dayLedger[slot.slot_date];
    if (!led) return;
    led.filled += 1;
    const m = macrosById(recipeId);
    if (m.kcal == null || m.carbs_g == null) {
      led.unknown += 1;
      unknownMacroIds.add(recipeId);
      return;
    }
    led.kcal += m.kcal;
    led.protein_g += m.protein_g == null ? 0 : m.protein_g;
    led.carbs_g += m.carbs_g;
    led.fat_g += m.fat_g == null ? 0 : m.fat_g;
  };
  // HARD gate, every fill path including stock pulls — the tie-break puts the
  // carb ceiling above anti-waste. A dish whose macros are unknown cannot be
  // judged, so it passes here and is counted instead; the rationale reports the
  // count rather than letting the gate be quietly inert.
  const carbsFit = (recipeId, slot) => {
    if (!targetingOn) return true;
    // No ceiling on this diet is a real answer, not a missing one. A bulk or a
    // plain calorie deficit has no carb rule and the gate simply opens.
    if (carbCeilingG == null) return true;
    const m = macrosById(recipeId);
    if (m.carbs_g == null) return true;
    const led = dayLedger[slot.slot_date];
    const sofar = led ? led.carbs_g : 0;
    return sofar + m.carbs_g <= carbCeilingG;
  };
  let carbBlockedSlots = 0;   // slots that stayed empty with the ceiling as the reason
  // SOFT score, lower is better. Used ONLY where the engine chooses freely
  // (fresh cooks, light meals, and as a last tiebreak on a batch pick). It is
  // never allowed to reorder a stock pull, because anti-waste beats the band.
  // Is this day behind the pace it needs to reach the protein floor? Pace is
  // pro-rata: after 2 of 5 slots you should be 2/5 of the way there. Being
  // behind is what promotes protein from a preference to the thing that decides.
  // FORWARD-looking, and the first version was not, which is why it barely fired.
  // Comparing what you have against a pro-rata share of what you have ALREADY
  // eaten can only notice a shortfall after it is too late to fix: two big
  // dinners keep you "on pace" right up until three small light meals leave the
  // day 40 g short. This asks the useful question instead — do the slots that
  // are LEFT each have to carry more than an even share? If they do, the day is
  // behind and protein decides from here.
  const proteinBehind = (slot) => {
    if (!targetingOn) return false;
    const led = dayLedger[slot.slot_date];
    if (!led) return false;
    const total = dayPlanCount[slot.slot_date] || 1;
    const slotsLeft = Math.max(1, total - led.filled);
    const needed = targetProteinG - led.protein_g;
    if (needed <= 0) return false;                 // floor already cleared
    return needed / slotsLeft > targetProteinG / total;
  };
  const fitScore = (r, slot) => {
    if (!targetingOn) return 0;
    const m = macrosOf(r);
    if (m.kcal == null) return 1;              // unknown sorts mid-field, not first
    const led = dayLedger[slot.slot_date] || { kcal: 0, protein_g: 0, carbs_g: 0, filled: 0 };
    const total = dayPlanCount[slot.slot_date] || 1;
    const slotsLeft = Math.max(1, total - led.filled);
    // Even share of what the day has left to eat.
    const idealKcal = Math.max(1, (targetKcal - led.kcal) / slotsLeft);
    const kcalPenalty = Math.abs(m.kcal - idealKcal) / idealKcal;
    // Protein is a FLOOR: only being under the pace is penalised, never over.
    const proteinLeft = Math.max(0, targetProteinG - led.protein_g);
    const idealProtein = proteinLeft / slotsLeft;
    const proteinPenalty = idealProtein <= 0
      ? 0
      : Math.max(0, idealProtein - (m.protein_g || 0)) / idealProtein;
    // How much of the day's REMAINING carb room this dish eats. Fitting is not
    // enough — a 19 g dish that fits today still crowds out the rest of the day.
    // With no ceiling there is no carb room to compete for, so carbs exert no
    // pressure on the choice at all — they still count toward calories.
    const carbPenalty = carbCeilingG == null
      ? 0
      : (m.carbs_g == null ? 0 : m.carbs_g) / Math.max(1, carbCeilingG - led.carbs_g);
    const wProtein = proteinBehind(slot) ? W_PROTEIN_BEHIND : W_PROTEIN;
    // Karum's ordering is protein -> carbs -> calories -> FAT, and that last
    // step changes how hard the third one should push here. When a fat lever
    // exists, calories are closed AFTER the week is placed, so selecting for
    // calories as well is double-counting — and it actively fights protein:
    // 2000 kcal over five slots wants ~400 a slot, while the protein-dense
    // mains are ~536, so a strong kcal term penalises exactly the dishes that
    // carry the protein. With a lever, calories step back and let protein
    // choose; without one, they have to pull their weight.
    const wKcal = hasFatLever ? W_KCAL_WITH_LEVER : W_KCAL;
    return wKcal * kcalPenalty + wProtein * proteinPenalty + W_CARB_PRESSURE * carbPenalty;
  };
  // Order a candidate list by macro fit without disturbing it when targeting is
  // off — a stable no-op, so an untargeted week plans exactly as it did before.
  const byFit = (pool, slot) =>
    targetingOn
      ? pool
        .map((r, i) => ({ r, i, s: fitScore(r, slot) }))
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((x) => x.r)
      : pool;

  // Two streams. Lunch+dinner share the freezer-buffered machinery below (batches,
  // band regulation, cross-meal forward-cover). Breakfast is filled separately in
  // step 6d: fresh-cover only, no freezer, no batch, no variety cap.
  const ldSlots = inSlots.filter((s) => !LIGHT_MEALS.has(s.meal));
  const bSlots = inSlots.filter((s) => LIGHT_MEALS.has(s.meal));

  // ---- The 2-and-2 rule --------------------------------------------------------
  // A recipe may fill at most SLOTS_PER_RECIPE_CAP slots in a lunch/dinner week,
  // however it got there: a batch's fresh split, a freezer or fridge pull, cold-start
  // freeze surplus, a fresh cook, or that cook's forward cover.
  //
  // VARIETY_CAP counts COOKS, not slots — one pot legitimately covered five days,
  // because a batch's 2 fresh portions AND its 2 freeze portions were all eaten in
  // the same week. This counts SLOTS: two portions get eaten this week, the rest
  // stay banked for later weeks. Breakfast is exempt by design (see 6d).
  //
  // Second rule, same mechanism: NEVER the same dish twice in one day. Lunch and
  // dinner on the same date must differ, whatever their sources.
  const slotUse = {};
  const dayUse = new Set();
  // The per-day guard alone — light meals use this WITHOUT the slot cap, so a
  // shake every morning is fine but a shake at breakfast AND as the morning snack
  // on the same day is not.
  const canTakeDay = (recipeId, slot) => !dayUse.has(`${slot.slot_date}|${recipeId}`);
  const takeDay = (recipeId, slot) => { dayUse.add(`${slot.slot_date}|${recipeId}`); };
  const canTake = (recipeId, slot) =>
    (slotUse[recipeId] || 0) < SLOTS_PER_RECIPE_CAP && canTakeDay(recipeId, slot);
  const take = (recipeId, slot) => {
    slotUse[recipeId] = (slotUse[recipeId] || 0) + 1;
    dayUse.add(`${slot.slot_date}|${recipeId}`);
  };

  // ---- 2. INVENTORY pools (existing stock only) ------------------------------
  // Expand into single-portion units so we can pull one at a time, soonest-expiry first.
  const expand = (loc) =>
    inventory
      .filter((r) => r.location === loc && r.quantity > 0)
      .flatMap((r) =>
        Array.from({ length: Math.floor(r.quantity) }, () => ({
          recipe_id: r.recipe_id,
          expiry_date: r.expiry_date,
        }))
      )
      .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : 0));

  const freezerPool = expand('freezer');   // soonest-expiry first — anti-waste
  const fridgePool = expand('fridge');
  const startingFreezerCount = freezerPool.length;

  // COLD START: an empty (or below-band) freezer has no buffer to lean on, so week 1
  // is legitimately different from steady state. When cold, we let a batch's FREEZE
  // portions also fill same-week gaps ("cook forward") — you cook a bit more up front,
  // eat across the week, and whatever freeze isn't eaten seeds the buffer. This
  // self-disables the moment a real buffer exists (freezer >= band low).
  const coldStart = startingFreezerCount < FREEZER_BAND_LOW;
  if (coldStart) {
    rationale.push('Cold start — freezer below target, so batch surplus fills this week and begins building the buffer.');
  }

  // ---- 3. COOK TO THE GAP: how many batches? ---------------------------------
  const demandPortions = ldSlots.reduce((s, x) => s + x.portions, 0);
  const stockPortions = freezerPool.length + fridgePool.length;
  const shortfall = Math.max(0, demandPortions - stockPortions);

  // Steady state: only a batch's FRESH portions (2) count toward this week.
  // Cold start: the whole batch (4) is usable this week (fresh + cook-forward freeze).
  const usablePerBatch = coldStart ? BATCH_SIZE : BATCH_FRESH;
  let nBatches = Math.min(batchDays.length, Math.ceil(shortfall / usablePerBatch));

  // Band regulation on PROJECTED end-of-week freezer level.
  // Projected = starting freezer - freezer pulls we expect to use + freeze banked by batches.
  const projectedPulls = Math.min(freezerPool.length, demandPortions);
  const projFreezerEnd = () => startingFreezerCount - projectedPulls + nBatches * BATCH_FREEZE;

  // In cold start we're building UP, never drawing down, so the "cut a batch on
  // overflow" arm is disabled — only the "add a batch to bank up" arm applies.
  if (!coldStart && projFreezerEnd() > FREEZER_BAND_HIGH && nBatches > 0) {
    nBatches -= 1;
    rationale.push('Cut a batch — freezer would end above target (drawing the buffer down).');
  } else if (projFreezerEnd() < FREEZER_BAND_LOW && nBatches < batchDays.length) {
    nBatches += 1;
    rationale.push('Added a batch — freezer would end below target (banking the buffer up).');
  }

  // ---- 4. SCHEDULE batches on batch days, pick recipes (variety-capped) -------
  // Only FREEZABLE dishes are batch-cooked — they're the ones that can bank the
  // freezer buffer. Fresh-only dishes (freezes=false: steak, salad, cod, patties)
  // are never batched or banked; they're cooked on the day (step 6c below).
  const isFreezable = (r) => r.freezes !== false;   // default true when unset
  const servesLD = (r) => canServe(r, 'lunch') || canServe(r, 'dinner');
  // The taste steer binds the lunch/dinner cooking pools. Light meals draw from
  // allowedRecipes directly in 6d and are untouched by it.
  const batchPool = allowedRecipes.filter((r) => isFreezable(r) && servesLD(r) && matchesTaste(r));
  const freshPool = allowedRecipes.filter((r) => r.freezes === false && servesLD(r) && matchesTaste(r));
  // Every exclusion reports itself, this one included — and it says out loud that
  // light meals are untouched, so a blank dinner and a filled breakfast in the
  // same week reads as intended rather than as a bug.
  if (wantCuisines.length || wantDishTypes.length || legacyTerm) {
    const ldPool = allowedRecipes.filter(servesLD);
    const setAside = ldPool.length - ldPool.filter(matchesTaste).length;
    const wanted = [...wantCuisines, ...wantDishTypes].join(', ') || legacyTerm;
    if (batchPool.length === 0 && freshPool.length === 0) {
      rationale.push(
        `Nothing matches ${wanted} for lunch or dinner, so those slots are empty. Breakfast and snacks are unaffected — clear the steer to fill them.`
      );
    } else {
      rationale.push(
        `Steering lunch and dinner towards ${wanted} — ${setAside} other dish${setAside === 1 ? '' : 'es'} set aside this week. Breakfast and snacks are not steered.`
      );
    }
  }

  const pickCount = {}; // recipe_id -> times chosen this week
  const eligible = seededShuffle(batchPool, rng);
  const chosenBatchDays = eligible.length === 0 ? [] : batchDays.slice(0, nBatches);

  const pickRecipe = (avoidProtein, bday) => {
    // prefer a recipe under the variety cap, and (soft) a different protein_type
    // ONE batch per recipe per week. A batch is batch_portions (4) and the week
    // only ever eats SLOTS_PER_RECIPE_CAP (2) of them — the rest are banked. So a
    // second pot of the same dish cooks 4 more portions nobody asked for, buys the
    // ingredients twice, and crowds a different dish out of the week. VARIETY_CAP
    // counted batch PICKS, which is how one week ended up with two pots of Ragu
    // spread over five slots.
    let pool = eligible.filter((r) => !(pickCount[r.id] > 0));
    if (pool.length === 0) pool = eligible.filter((r) => (pickCount[r.id] || 0) < VARIETY_CAP);
    if (pool.length === 0) pool = eligible; // both relax only if the pool is exhausted
    const diff = pool.filter((r) => !avoidProtein || r.protein_type !== avoidProtein);
    // Macro fit is a TIEBREAK on the batch pick, not a filter. A batch is chosen
    // once for the week and then fills up to two slots on days the engine has
    // not placed yet, so scoring it against one day would be false precision —
    // but a pot with 19 g of carbs a portion eats over half a day's ceiling
    // twice, and preferring the lighter of two otherwise-equal candidates costs
    // nothing. The hard ceiling still applies later, per slot, in
    // fillFromBatches.
    const shortlist = diff.length ? diff : pool;
    const chosen = bday ? byFit(shortlist, { slot_date: bday })[0] : shortlist[0];
    pickCount[chosen.id] = (pickCount[chosen.id] || 0) + 1;
    return chosen;
  };

  const batches = [];
  let lastProtein = null;
  for (const bday of chosenBatchDays) {
    // does this batch day coincide with a guest slot? if so, cook to cover it fresh.
    const guestSlotToday = ldSlots.find((s) => s.slot_date === bday && s.guest);
    const recipe = pickRecipe(lastProtein, bday);
    lastProtein = recipe.protein_type || null;
    // Per-recipe batch rules (defaults 4 total / 2 fresh reproduce the old flat batch).
    const rBatch = recipe.batch_portions ?? BATCH_SIZE;
    const rFresh = recipe.fresh_portions ?? BATCH_FRESH;
    const guestPortions = guestSlotToday ? guestSlotToday.portions : 0;
    const totalPortions = Math.max(rBatch, guestPortions);
    const freshPortions = guestPortions > 0
      ? guestPortions                       // guest cooks are eaten fresh, no freeze
      : rFresh;
    const freezePortions = totalPortions - freshPortions;
    batches.push({
      batch_date: bday,
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      portions_total: totalPortions,
      portions_fresh: freshPortions,
      portions_freeze: freezePortions,
      _freshLeft: freshPortions,
      _freezeLeft: freezePortions, // available for cook-forward pulls in cold start
      _freshShelf: recipe.fresh_shelf_days ?? FRESH_SHELF_DAYS, // per-recipe fresh window
    });
  }

  // ---- 5. ASSIGN batch-fresh portions to nearby IN-slots ---------------------
  // A batch's fresh portions land within [batch_day, batch_day + the recipe's own
  // fresh_shelf_days]. Fill the batch day itself first (esp. guest days), then forward.
  const fillFromBatches = (slot) => {
    if (slot.source !== 'empty') return false;
    for (const b of batches) {
      if (b._freshLeft <= 0) continue;
      if (!canTake(b.recipe_id, slot)) continue;          // 2-and-2 rule + no repeat in a day
      const gap = daysBetween(b.batch_date, slot.slot_date);
      if (gap < 0 || gap > b._freshShelf) continue;
      // The carb ceiling binds a batch's fresh portions like anything else. A
      // pot you already committed to cooking is not a licence to blow the day.
      if (!carbsFit(b.recipe_id, slot)) continue;
      slot.source = 'batch_cook';
      slot.recipe_id = b.recipe_id;
      slot.cook_date = b.batch_date;   // the day the pot is MADE (may not be this slot)
      b._freshLeft -= slot.portions;
      take(b.recipe_id, slot);
      recordMacros(b.recipe_id, slot);
      return true;
    }
    return false;
  };
  // Guest days and batch days first (they must be covered by their own cook), then the rest.
  const orderedForBatch = ldSlots
    .slice()
    .sort((a, b) => (b.guest === true) - (a.guest === true) || (a.slot_date < b.slot_date ? -1 : 1));
  for (const slot of orderedForBatch) fillFromBatches(slot);

  // ---- 6. FILL remaining slots from existing stock: freezer (soonest) then fridge
  // Take the soonest-expiry portion (pool is pre-sorted) whose recipe can actually
  // serve this slot's meal — so a dinner leftover never lands on breakfast, and a
  // frittata portion never lands on dinner.
  const pullOne = (pool, slot) => {
    const idx = pool.findIndex((p) => {
      const r = recipeById[p.recipe_id];
      // isAllowed also binds STOCK: an allergen in the freezer is still an allergen.
      // tasteOK binds stock too, but only for lunch/dinner: if you asked for Thai
      // this week, a Madras portion in the freezer is not what you asked for. It
      // stays banked rather than being pushed onto the plate.
      // carbsFit binds stock too, and this is the ONE place the tie-break shows
      // its teeth: the pool stays sorted soonest-expiry, so anti-waste still
      // chooses WHICH portion, but the ceiling can refuse it outright. Waste
      // beats the macro band; nothing beats the ceiling.
      return r && isAllowed(p.recipe_id) && canServe(r, slot.meal)
        && tasteOK(r, slot.meal) && canTake(p.recipe_id, slot)
        && carbsFit(p.recipe_id, slot);
    });
    if (idx === -1) return false;
    const [p] = pool.splice(idx, 1);
    slot.recipe_id = p.recipe_id;
    take(p.recipe_id, slot);
    recordMacros(p.recipe_id, slot);
    return true;
  };
  // Chronological so soonest-expiry stock lands on the earliest gaps (anti-waste).
  const chrono = ldSlots.slice().sort((a, b) => (a.slot_date < b.slot_date ? -1 : 1));
  for (const slot of chrono) {
    if (slot.source !== 'empty') continue;
    if (pullOne(freezerPool, slot)) { slot.source = 'freezer_pull'; continue; }
    if (pullOne(fridgePool, slot)) { slot.source = 'fridge_pull'; continue; }
    // stays empty
  }

  // ---- 6b. COLD-START cook-forward: fill remaining gaps from batch FREEZE surplus
  // Only in cold start, and only AFTER existing stock (anti-waste stays first).
  // A batch's freeze portions are available from its cook day onward (45-day life).
  let batchFreezeEaten = 0;
  if (coldStart) {
    for (const slot of chrono) {
      if (slot.source !== 'empty') continue;
      for (const b of batches) {
        if (b._freezeLeft <= 0) continue;
        if (!canTake(b.recipe_id, slot)) continue;    // 2-and-2 rule: the freeze half stays frozen
        if (daysBetween(b.batch_date, slot.slot_date) < 0) continue; // not cooked yet
        if (!carbsFit(b.recipe_id, slot)) continue;   // the ceiling binds cook-forward too
        slot.source = 'batch_freeze';
        slot.recipe_id = b.recipe_id;
        slot.cook_date = b.batch_date;   // informational: this portion is not a new cook
        b._freezeLeft -= slot.portions;
        take(b.recipe_id, slot);
        recordMacros(b.recipe_id, slot);
        batchFreezeEaten += slot.portions;
        break;
      }
    }
  }

  // ---- 6c. FRESH-COOK-ON-THE-DAY ---------------------------------------------
  // Any non-out slot still empty is filled by a fresh dish cooked that day.
  // Fresh dishes never batch or bank — they're cooked the day they're eaten; we
  // assume a non-out day is cookable. (When a "busy day" signal exists later, it
  // joins outs as another skip and these slots stay empty instead.)
  if (freshPool.length > 0) {
    const eligibleFresh = seededShuffle(freshPool, rng);
    const freshPickCount = {};
    let lastFreshProtein = null;
    const pickFresh = (avoidProtein, slot) => {
      let pool = eligibleFresh.filter((r) => (freshPickCount[r.id] || 0) < VARIETY_CAP && canTake(r.id, slot));
      if (pool.length === 0) pool = eligibleFresh.filter((r) => canTake(r.id, slot));
      if (pool.length === 0) return null;   // rules hold: leave the slot empty rather than repeat
      // Separate the two reasons a slot can come back empty. "No dish left that
      // respects the variety cap" and "everything left would break the day's
      // carb ceiling" are different problems with different fixes, and a single
      // 'empty' would hide which one you have.
      const beforeCarbs = pool.length;
      pool = pool.filter((r) => carbsFit(r.id, slot));
      if (pool.length === 0) {
        if (beforeCarbs > 0) carbBlockedSlots += 1;
        return null;
      }
      // Protein-type variety stays the FIRST preference and macro fit is the
      // tiebreak inside it, deliberately: the ceiling is already a hard gate, so
      // the soft score is fine-tuning and should not be allowed to flatten the
      // variety the week already had. Swap the two lines to reverse that.
      // Protein-type variety is the first preference ONLY while the day is on
      // pace for protein. The moment it falls behind, variety yields to the
      // floor and the whole eligible pool is ranked by fit — because a varied
      // week that misses its protein every day is a worse week.
      const diff = pool.filter((r) => !avoidProtein || r.protein_type !== avoidProtein);
      const shortlist = proteinBehind(slot) ? pool : (diff.length ? diff : pool);
      const chosen = byFit(shortlist, slot)[0];
      freshPickCount[chosen.id] = (freshPickCount[chosen.id] || 0) + 1;
      return chosen;
    };
    for (const slot of chrono) {
      if (slot.source !== 'empty') continue;
      // Cook a fresh dish on this day. It yields fresh_portions, which also cover
      // forward empty slots within the recipe's own fresh_shelf_days — one cook,
      // eaten over its keep-window (make-2-eat-over-2). Like a batch's fresh split,
      // every covered slot reads as 'fresh_cook' + same recipe; the cook counts once
      // against the variety cap regardless of how many days it covers.
      const r = pickFresh(lastFreshProtein, slot);
      if (!r) continue;                     // nothing left that respects the rules
      lastFreshProtein = r.protein_type || null;
      const shelf = r.fresh_shelf_days ?? FRESH_SHELF_DAYS;
      let portionsLeft = r.fresh_portions ?? BATCH_FRESH;

      slot.source = 'fresh_cook';
      slot.recipe_id = r.id;
      slot.cook_date = slot.slot_date;   // cooked on the day: this IS the cook
      take(r.id, slot);
      recordMacros(r.id, slot);
      portionsLeft -= slot.portions; // this day's meal (household + any guests)

      if (portionsLeft > 0) {
        for (const fwd of chrono) {
          if (portionsLeft <= 0) break;
          if (fwd.source !== 'empty') continue;
          if (!canTake(r.id, fwd)) continue;     // 2-and-2 + no repeat in a day
          const gap = daysBetween(slot.slot_date, fwd.slot_date);
          if (gap <= 0 || gap > shelf) continue; // strictly forward, within the window
          // Forward cover lands on a DIFFERENT day with its own ledger, so it
          // gets its own ceiling test. Leftovers are not exempt from the day
          // they are eaten on.
          if (!carbsFit(r.id, fwd)) continue;
          fwd.source = 'fresh_cook';
          fwd.recipe_id = r.id;
          fwd.cook_date = slot.slot_date;   // leftover of THAT cook, not a new one
          take(r.id, fwd);
          recordMacros(r.id, fwd);
          portionsLeft -= fwd.portions;
        }
      }
    }
  }

  // ---- 6d. LIGHT MEALS: breakfast + morning/afternoon snacks --------------------
  // Own pool, own rules: fresh-cover only (never the freezer buffer, never batched)
  // and NO slot cap — a shake or frittata every morning is fine. The per-day guard
  // still applies, so the same dish cannot be both breakfast and the morning snack
  // on one date.
  //
  // Run ONCE PER LIGHT MEAL. Each has its own rotation and its own forward cover,
  // so a breakfast's leftovers cover a later breakfast and a snack's cover a later
  // snack — they never bleed across. Both snack slots draw the same 'snack' tag:
  // a recipe is tagged for what it IS, not for when it is eaten.
  for (const lightMeal of ALL_MEALS.filter((m) => LIGHT_MEALS.has(m))) {
    const mealSlots = bSlots.filter((s) => s.meal === lightMeal);
    if (mealSlots.length === 0) continue;
    const bChrono = mealSlots.slice().sort((a, b) => (a.slot_date < b.slot_date ? -1 : 1));

    // 1. anti-waste: use up eligible fridge stock first
    for (const slot of bChrono) {
      if (slot.source !== 'empty') continue;
      if (pullOne(fridgePool, slot)) { slot.source = 'fridge_pull'; takeDay(slot.recipe_id, slot); }
    }

    // 2. fresh-cook on the day + forward-cover. Soft least-used rotation (spreads
    //    variety without ever capping) so a light meal can repeat but isn't forced to.
    const bPool = seededShuffle(allowedRecipes.filter((r) => canServe(r, lightMeal)), rng);
    if (bPool.length === 0) continue;
    const bCount = {};
    let lastBProtein = null;
    // ⚠️ ORDERING RISK, stated here rather than discovered later. Light meals are
    // filled LAST, so lunch and dinner have already spent part of the day's carb
    // room by the time a breakfast is chosen. On the live book that should be
    // comfortable — lunch + dinner average ~17 g of the 35 g ceiling, leaving
    // ~18 g across three light slots against a book whose minimum is 1 g — but
    // it is not guaranteed, and a squeezed day will show up as empty
    // breakfasts, which is the exact failure the taste-steer rule was written to
    // avoid.
    //
    // The ceiling is NOT relaxed for light meals to paper over this: an
    // exemption would make the ceiling a suggestion. Instead the shortfall is
    // reported with the ceiling named as the reason, so a squeezed week is
    // visible rather than mysterious. If it bites in practice the fix is
    // ordering — reserve the light meals' share of the ceiling up front, or
    // fill them before lunch and dinner — and not an exemption.
    const pickLight = (avoidProtein, slot) => {
      const free = bPool.filter((r) => canTakeDay(r.id, slot));
      if (free.length === 0) return null;
      const beforeCarbs = free.length;
      const fits = free.filter((r) => carbsFit(r.id, slot));
      if (fits.length === 0) {
        if (beforeCarbs > 0) carbBlockedSlots += 1;
        return null;
      }
      const min = Math.min(...fits.map((r) => bCount[r.id] || 0));
      const leastUsed = fits.filter((r) => (bCount[r.id] || 0) === min);
      const diff = leastUsed.filter((r) => !avoidProtein || r.protein_type !== avoidProtein);
      // Light meals are where the protein floor is actually won or lost — they
      // are the last slots filled, so they see the day's shortfall. When behind,
      // rank the whole fitting pool rather than just the least-used slice.
      const chosen = proteinBehind(slot)
        ? byFit(fits, slot)[0]
        : byFit(diff.length ? diff : leastUsed, slot)[0];
      bCount[chosen.id] = (bCount[chosen.id] || 0) + 1;
      return chosen;
    };
    for (const slot of bChrono) {
      if (slot.source !== 'empty') continue;
      const r = pickLight(lastBProtein, slot);
      if (!r) continue;                   // nothing left that respects the per-day rule
      lastBProtein = r.protein_type || null;
      const shelf = r.fresh_shelf_days ?? FRESH_SHELF_DAYS;
      let portionsLeft = r.fresh_portions ?? 1;

      slot.source = 'fresh_cook';
      slot.recipe_id = r.id;
      slot.cook_date = slot.slot_date;   // cooked on the day: this IS the cook
      takeDay(r.id, slot);
      recordMacros(r.id, slot);
      portionsLeft -= slot.portions;

      if (portionsLeft > 0) {
        for (const fwd of bChrono) {
          if (portionsLeft <= 0) break;
          if (fwd.source !== 'empty') continue;
          if (!canTakeDay(r.id, fwd)) continue;
          const gap = daysBetween(slot.slot_date, fwd.slot_date);
          if (gap <= 0 || gap > shelf) continue; // strictly forward, within the window
          if (!carbsFit(r.id, fwd)) continue;    // its own day, its own ceiling
          fwd.source = 'fresh_cook';
          fwd.recipe_id = r.id;
          fwd.cook_date = slot.slot_date;   // leftover of THAT cook, not a new one
          takeDay(r.id, fwd);
          recordMacros(r.id, fwd);
          portionsLeft -= fwd.portions;
        }
      }
    }
  }

  // ---- 6e. THE FAT LEVER -------------------------------------------------------
  // Karum's ordering is protein -> carbs -> calories -> fat, and fat is the item
  // that closes the day. Runs LAST, after every slot is placed, because a
  // shortfall is only knowable once the day is otherwise finished.
  //
  // Why fat and not a bigger portion: on keto, oil is the only thing that adds
  // calories without touching the constraint that actually binds. It carries no
  // carbs, so the lever can never push a day through the ceiling. Scaling a
  // portion would, and cannot be done to a frozen one anyway.
  //
  // It only ever adds UP TO the target, never past it — the lever exists to
  // close a gap, not to overshoot one. And it is per-diet data: a diet with no
  // `fat_lever` simply has no lever, and the shortfall stays visible.
  const fatLever = (diet && diet.fat_lever) || null;
  const fatKcalPerG = num(fatLever && fatLever.kcal_per_g);
  const fatMaxPerSlot = num(fatLever && fatLever.max_g_per_slot) ?? 15;
  let fatAddedTotalG = 0;
  let fatDaysClosed = 0;
  if (targetingOn && fatLever && fatKcalPerG > 0) {
    for (const date of Object.keys(dayLedger).sort()) {
      const led = dayLedger[date];
      if (led.filled === 0) continue;                       // nothing to add it to
      if (led.kcal >= targetKcal * (1 - kcalDayBand)) continue;  // already in band
      const daySlots = inSlots.filter(
        (s) => s.slot_date === date && s.source !== 'empty' && s.source !== 'out'
      );
      if (daySlots.length === 0) continue;
      const gapKcal = targetKcal - led.kcal;
      const wanted = Math.round(gapKcal / fatKcalPerG);
      const grams = Math.min(wanted, daySlots.length * fatMaxPerSlot);
      if (grams < FAT_LEVER_MIN_G) continue;                // below this it is noise
      // Spread evenly across the day's real meals, whole grams, remainder to the
      // earliest slots so the numbers on the plan are readable rather than exact
      // to a decimal nobody can measure with a spoon.
      const per = Math.floor(grams / daySlots.length);
      let remainder = grams - per * daySlots.length;
      for (const s of daySlots) {
        const add = per + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        if (add <= 0) continue;
        s.fat_top_up_g = (s.fat_top_up_g || 0) + add;
        led.fat_added_g += add;
        led.fat_g += add;
        led.kcal += add * fatKcalPerG;
        fatAddedTotalG += add;
      }
      if (led.kcal >= targetKcal * (1 - kcalDayBand)) fatDaysClosed += 1;
    }
  }

  // ---- 7. RATIONALE + projected freezer ---------------------------------------
  const freshCookCount = inSlots.filter((s) => s.source === 'fresh_cook').length;
  if (freshCookCount > 0) {
    rationale.push(
      `${freshCookCount} slot${freshCookCount > 1 ? 's' : ''} set to cook fresh on the day (dishes that don't freeze).`
    );
  }
  const emptyCount = inSlots.filter((s) => s.source === 'empty').length;
  if (emptyCount > 0) {
    // Two different problems with two different fixes, so two different
    // sentences. "Nothing fits the variety cap" means loosen the week; "the
    // day's carbs were already spent" means the ceiling is biting. One
    // undifferentiated 'empty' would hide which one you have.
    const varietyEmpty = Math.max(0, emptyCount - carbBlockedSlots);
    if (varietyEmpty > 0) {
      rationale.push(
        `${varietyEmpty} slot${varietyEmpty > 1 ? 's' : ''} left empty — no stock, batch, or fresh-cook dish available without breaking the variety cap.`
      );
    }
    if (carbBlockedSlots > 0) {
      rationale.push(
        `${carbBlockedSlots} slot${carbBlockedSlots > 1 ? 's' : ''} left empty because the day's ${carbCeilingG} g carb ceiling was already spent — every remaining dish would have gone over.`
      );
    }
  }
  const freezerPullsUsed = inSlots.filter((s) => s.source === 'freezer_pull').length;
  const freezeBanked = batches.reduce((s, b) => s + b.portions_freeze, 0);
  // Cook-forward eats some freeze surplus this week, so it never reaches the buffer.
  const projectedFreezerEnd = startingFreezerCount - freezerPullsUsed + freezeBanked - batchFreezeEaten;
  if (projectedFreezerEnd >= FREEZER_BAND_LOW && projectedFreezerEnd <= FREEZER_BAND_HIGH) {
    rationale.push(`Freezer ends at ${projectedFreezerEnd} portions — inside the ${FREEZER_BAND_LOW}-${FREEZER_BAND_HIGH} band.`);
  } else {
    rationale.push(`Freezer ends at ${projectedFreezerEnd} portions (target ${FREEZER_BAND_LOW}-${FREEZER_BAND_HIGH}).`);
  }

  // ---- 7b. MACRO SUMMARY + reporting (bridge items 4 + 5) ----------------------
  // Every exclusion reports itself, and so does every target. A plan that hit
  // its numbers and a plan that had no numbers to hit must not look the same.
  const daysPlanned = Object.keys(dayLedger).sort();
  const perDay = daysPlanned.map((d) => {
    const led = dayLedger[d];
    return {
      slot_date: d,
      kcal: Math.round(led.kcal),
      protein_g: Math.round(led.protein_g),
      carbs_g: Math.round(led.carbs_g * 10) / 10,
      fat_g: Math.round(led.fat_g),
      fat_top_up_g: led.fat_added_g,
      slots_filled: led.filled,
      slots_planned: dayPlanCount[d] || 0,
      unknown_macro_slots: led.unknown,
      over_carb_ceiling: targetingOn && carbCeilingG != null ? led.carbs_g > carbCeilingG : false,
      kcal_in_band: targetingOn
        ? Math.abs(led.kcal - targetKcal) <= targetKcal * kcalDayBand
        : null,
      // Within tolerance counts as met: 3 g under a 183 g floor is hit, not
      // missed. protein_short_g carries the magnitude either way so the UI can
      // show the gap rather than just a colour.
      protein_met: targetingOn
        ? led.protein_g >= targetProteinG * (1 - PROTEIN_FLOOR_TOLERANCE)
        : null,
      protein_short_g: targetingOn ? Math.max(0, Math.round(targetProteinG - led.protein_g)) : null,
    };
  });
  const weekKcal = perDay.reduce((s, d) => s + d.kcal, 0);
  const weekProtein = perDay.reduce((s, d) => s + d.protein_g, 0);
  const avgKcal = daysPlanned.length ? Math.round(weekKcal / daysPlanned.length) : 0;
  const weekInBand = targetingOn && targetKcal > 0
    ? Math.abs(avgKcal - targetKcal) <= targetKcal * kcalWeekBand
    : null;

  const macroSummary = {
    targeting: targetingOn,
    source: (targets && targets.source) || 'absent',
    target_kcal: targetKcal,
    target_protein_g: targetProteinG,
    target_carbs_aim_g: targetCarbsAimG,
    diet_key: dietKey,
    diet_label: (diet && diet.label) || null,
    diet_source: dietSource,
    carb_ceiling_g: carbCeilingG,          // null is a real answer: this diet has no ceiling
    kcal_day_band: kcalDayBand,
    kcal_week_band: kcalWeekBand,
    per_day: perDay,
    week_kcal: weekKcal,
    week_protein_g: weekProtein,
    avg_daily_kcal: avgKcal,
    week_in_band: weekInBand,
    days_over_carb_ceiling: perDay.filter((d) => d.over_carb_ceiling).length,
    days_kcal_out_of_band: targetingOn ? perDay.filter((d) => d.kcal_in_band === false).length : 0,
    days_under_protein: targetingOn ? perDay.filter((d) => d.protein_met === false).length : 0,
    // The worst day is what you would actually act on, so it is carried out
    // rather than left to be recomputed by whoever renders this.
    worst_protein_short_g: targetingOn
      ? perDay.reduce((w, d) => Math.max(w, d.protein_short_g || 0), 0)
      : 0,
    protein_floor_tolerance: PROTEIN_FLOOR_TOLERANCE,
    carb_blocked_slots: carbBlockedSlots,
    recipes_without_macros: unknownMacroIds.size,
    fat_lever: fatLever ? { label: fatLever.label || null, kcal_per_g: fatKcalPerG, max_g_per_slot: fatMaxPerSlot } : null,
    fat_added_total_g: fatAddedTotalG,
    fat_days_closed: fatDaysClosed,
  };

  if (!targetingOn) {
    // Say WHICH silence this is. "You have no profile" and "your profile has no
    // targets" are different problems and the user can only fix the one they are
    // actually in.
    const src = (targets && targets.source) || 'absent';
    if (src === 'no_profile') {
      rationale.unshift('No profile found, so the week was planned without calorie or protein targets.');
    } else if (src === 'missing') {
      rationale.unshift('Your profile has no calorie or protein target saved, so the week was planned without them. Set them on the dashboard and regenerate.');
    } else {
      rationale.unshift('No targets were passed to the planner, so the week was planned without them.');
    }
  } else {
    // The ceiling and its PROVENANCE are stated on every targeted week, always,
    // including when there is no ceiling. That is the whole defence against a
    // ceiling that quietly stops existing because a diet row was misconfigured:
    // "Mediterranean sets no carb ceiling" and "your diet could not be found"
    // must never look the same, and neither may look like silence.
    const dietName = (diet && diet.label) || dietKey;
    let carbClause;
    if (carbCeilingG != null) {
      carbClause = `carbs capped at ${carbCeilingG} g a day${dietName ? ` (${dietName})` : ''}`;
    } else if (dietSource === 'missing' || dietSource === 'absent') {
      carbClause = 'and NO carb ceiling was applied, because no diet is set on your profile';
    } else {
      carbClause = `and no carb ceiling, because ${dietName || 'this diet'} does not set one`;
    }
    rationale.unshift(
      `Planning to ${targetKcal} kcal and ${targetProteinG} g protein a day, with ${carbClause}.`
    );
    if (macroSummary.recipes_without_macros > 0) {
      // The protein_type lesson, applied before it can bite: a filter is inert
      // wherever its column is null, so the count is stated rather than assumed
      // to be zero.
      rationale.push(
        `${macroSummary.recipes_without_macros} dish${macroSummary.recipes_without_macros > 1 ? 'es have' : ' has'} no macros recorded, so the carb ceiling could not be applied to ${macroSummary.recipes_without_macros > 1 ? 'them' : 'it'}.`
      );
    }
    rationale.push(
      `The week averages ${avgKcal} kcal a day against a ${targetKcal} target — ${weekInBand ? `inside the ±${Math.round(kcalWeekBand * 100)}% weekly band` : `outside the ±${Math.round(kcalWeekBand * 100)}% weekly band`}.`
    );
    if (macroSummary.days_kcal_out_of_band > 0) {
      rationale.push(
        `${macroSummary.days_kcal_out_of_band} day${macroSummary.days_kcal_out_of_band > 1 ? 's sit' : ' sits'} outside the ±${Math.round(kcalDayBand * 100)}% daily calorie band.`
      );
    }
    if (fatAddedTotalG > 0) {
      const what = (fatLever && fatLever.label) || 'fat';
      rationale.push(
        `Added ${fatAddedTotalG} g of ${what} across the week to close the calorie gap — it carries no carbs, so the ceiling is untouched.`
      );
    } else if (targetingOn && !fatLever && macroSummary.days_kcal_out_of_band > 0) {
      // No lever configured and days are short. Say why the gap is being left
      // rather than closed, so an absent lever is a visible choice.
      rationale.push(
        'No fat lever is set for this diet, so short days are left short rather than topped up.'
      );
    }
    if (macroSummary.days_under_protein > 0) {
      // Name the SIZE of the miss, not just the count. "6 days fall short" and
      // "1 day is 33 g short" describe the same week and only one of them tells
      // you what to do about it.
      const worst = macroSummary.worst_protein_short_g;
      rationale.push(
        `${macroSummary.days_under_protein} day${macroSummary.days_under_protein > 1 ? 's are' : ' is'} more than ${Math.round(PROTEIN_FLOOR_TOLERANCE * 100)}% under the ${targetProteinG} g protein floor — the worst by ${worst} g.`
      );
    } else if (macroSummary.worst_protein_short_g > 0) {
      // Every day is inside tolerance. Say so, because "no protein line at all"
      // reads like the check did not run.
      rationale.push(
        `Every day reaches the ${targetProteinG} g protein floor within ${Math.round(PROTEIN_FLOOR_TOLERANCE * 100)}% — the closest is ${macroSummary.worst_protein_short_g} g under.`
      );
    }
    if (macroSummary.days_over_carb_ceiling > 0) {
      // Should be unreachable — the ceiling is a hard gate on every fill path.
      // If this ever prints, a path was added that does not call carbsFit, and
      // saying so is more useful than a silent breach.
      rationale.push(
        `⚠️ ${macroSummary.days_over_carb_ceiling} day${macroSummary.days_over_carb_ceiling > 1 ? 's are' : ' is'} over the ${carbCeilingG} g carb ceiling — that should not be possible, please report it.`
      );
    }
  }

  // strip internal fields
  // Also enforce the storage invariant at the boundary: plan_slots has
  // CHECK (portions > 0), and one bad row aborts the entire insert, losing
  // the whole week rather than one slot. Nothing upstream should produce a
  // non-positive value; this guarantees none can escape if something does.
  const cleanSlots = slots.map(({ guest, ...s }) => ({
    ...s,
    portions: Number(s.portions) > 0 ? Number(s.portions) : 1,
  }));
  const cleanBatches = batches.map(({ _freshLeft, _freezeLeft, _freshShelf, ...b }) => b);

  return { slots: cleanSlots, batches: cleanBatches, rationale, projectedFreezerEnd, macroSummary };
}

module.exports = { generatePlan, addDays, daysBetween };
