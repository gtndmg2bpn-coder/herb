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
const VARIETY_CAP = 2;            // max times a recipe is chosen for a fresh batch this week

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
 * @param {Array}  recipes       dinner-eligible pool: {id, name, protein_type,
 *                               freezes, batch_portions, fresh_portions, fresh_shelf_days}
 * @param {object} opts          { weekStart: 'YYYY-MM-DD', seed: int }
 * @returns {object} { slots, batches, rationale, projectedFreezerEnd }
 */
function generatePlan(constraints, inventory, recipes, opts) {
  const weekStart = opts.weekStart;
  const seed = opts.seed || 1;
  const rng = makeRng(seed);
  const rationale = [];

  const mealsToPlan = (constraints.meals_to_plan || ['dinner'])
    .filter((m) => m === 'dinner'); // v1: dinner only, silently scope others out
  if ((constraints.meals_to_plan || []).some((m) => m !== 'dinner')) {
    rationale.push('Only dinners were planned — breakfast/lunch need meal-type tags (v1 limitation).');
  }
  const household = constraints.household || 1;
  const outs = constraints.outs || [];
  const batchDays = (constraints.batch_days || []).slice().sort();
  const guests = constraints.guests || [];

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
        slots.push({ slot_date: date, meal, source: 'out', recipe_id: null, portions: 0 });
        continue;
      }
      const g = guestCount(date, meal);
      const portions = household + g; // guests add on top; household=1 default
      const slot = { slot_date: date, meal, source: 'empty', recipe_id: null, portions, guest: g > 0 };
      slots.push(slot);
      inSlots.push(slot);
    }
  }

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
  const demandPortions = inSlots.reduce((s, x) => s + x.portions, 0);
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
  const batchPool = recipes.filter(isFreezable);
  const freshPool = recipes.filter((r) => r.freezes === false);
  const pickCount = {}; // recipe_id -> times chosen this week
  const eligible = seededShuffle(batchPool, rng);
  const chosenBatchDays = eligible.length === 0 ? [] : batchDays.slice(0, nBatches);

  const pickRecipe = (avoidProtein) => {
    // prefer a recipe under the variety cap, and (soft) a different protein_type
    let pool = eligible.filter((r) => (pickCount[r.id] || 0) < VARIETY_CAP);
    if (pool.length === 0) pool = eligible; // cap relaxes if the pool is exhausted
    const diff = pool.filter((r) => !avoidProtein || r.protein_type !== avoidProtein);
    const chosen = (diff.length ? diff : pool)[0];
    pickCount[chosen.id] = (pickCount[chosen.id] || 0) + 1;
    return chosen;
  };

  const batches = [];
  let lastProtein = null;
  for (const bday of chosenBatchDays) {
    // does this batch day coincide with a guest slot? if so, cook to cover it fresh.
    const guestSlotToday = inSlots.find((s) => s.slot_date === bday && s.guest);
    const recipe = pickRecipe(lastProtein);
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
      const gap = daysBetween(b.batch_date, slot.slot_date);
      if (gap < 0 || gap > b._freshShelf) continue;
      slot.source = 'batch_cook';
      slot.recipe_id = b.recipe_id;
      b._freshLeft -= slot.portions;
      return true;
    }
    return false;
  };
  // Guest days and batch days first (they must be covered by their own cook), then the rest.
  const orderedForBatch = inSlots
    .slice()
    .sort((a, b) => (b.guest === true) - (a.guest === true) || (a.slot_date < b.slot_date ? -1 : 1));
  for (const slot of orderedForBatch) fillFromBatches(slot);

  // ---- 6. FILL remaining slots from existing stock: freezer (soonest) then fridge
  const pullOne = (pool, slot) => {
    if (pool.length === 0) return false;
    const p = pool.shift(); // soonest-expiry first
    slot.recipe_id = p.recipe_id;
    return true;
  };
  // Chronological so soonest-expiry stock lands on the earliest gaps (anti-waste).
  const chrono = inSlots.slice().sort((a, b) => (a.slot_date < b.slot_date ? -1 : 1));
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
        if (daysBetween(b.batch_date, slot.slot_date) < 0) continue; // not cooked yet
        slot.source = 'batch_freeze';
        slot.recipe_id = b.recipe_id;
        b._freezeLeft -= slot.portions;
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
    const pickFresh = (avoidProtein) => {
      let pool = eligibleFresh.filter((r) => (freshPickCount[r.id] || 0) < VARIETY_CAP);
      if (pool.length === 0) pool = eligibleFresh;
      const diff = pool.filter((r) => !avoidProtein || r.protein_type !== avoidProtein);
      const chosen = (diff.length ? diff : pool)[0];
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
      const r = pickFresh(lastFreshProtein);
      lastFreshProtein = r.protein_type || null;
      const shelf = r.fresh_shelf_days ?? FRESH_SHELF_DAYS;
      let portionsLeft = r.fresh_portions ?? BATCH_FRESH;

      slot.source = 'fresh_cook';
      slot.recipe_id = r.id;
      portionsLeft -= slot.portions; // this day's meal (household + any guests)

      if (portionsLeft > 0) {
        for (const fwd of chrono) {
          if (portionsLeft <= 0) break;
          if (fwd.source !== 'empty') continue;
          const gap = daysBetween(slot.slot_date, fwd.slot_date);
          if (gap <= 0 || gap > shelf) continue; // strictly forward, within the window
          fwd.source = 'fresh_cook';
          fwd.recipe_id = r.id;
          portionsLeft -= fwd.portions;
        }
      }
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
    rationale.push(
      `${emptyCount} slot${emptyCount > 1 ? 's' : ''} left empty — no stock, batch, or fresh-cook dish available without breaking the variety cap.`
    );
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

  // strip internal fields
  const cleanSlots = slots.map(({ guest, ...s }) => s);
  const cleanBatches = batches.map(({ _freshLeft, _freezeLeft, _freshShelf, ...b }) => b);

  return { slots: cleanSlots, batches: cleanBatches, rationale, projectedFreezerEnd };
}

module.exports = { generatePlan, addDays, daysBetween };
