// app/plan/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { generatePlan } from '../../lib/generatePlan';
import { setMealWindows } from '../../lib/actions';
import { recipeImageUrl } from '../../lib/recipeImage';
import { planComponents } from '../../lib/planComponents';
import { signInAsDemo } from '../../lib/demoLogin';
import { isoDate, addDays, dayLabel } from '../../lib/dates';

// Editorial design tokens (match dashboard / spend / recipe book)
const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';
const BLUE = '#8FBBD6';
const GREEN = '#7BB88F';
const AMBER = '#E9C067';

const eyebrowStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 12,
};

// Every plannable meal, in day order. snack_am / snack_pm are separate slots so a
// morning and an afternoon snack can both sit on one date — plan_slots is unique on
// (user, date, meal), so they cannot share one 'snack' key. Both draw the same
// 'snack' recipe tag: a dish is tagged for what it IS, not for when it is eaten.
const PLANNABLE_MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'snack_am',  label: 'Morning snack' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'snack_pm',  label: 'Afternoon snack' },
  { key: 'dinner',    label: 'Dinner' },
];

// The 14 UK major allergens. Codes MUST equal profiles.allergens /
// recipe_allergens.contains verbatim — they are matched, not displayed.
const ALLERGENS = ['celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'tree_nuts', 'peanuts', 'sesame', 'soybeans', 'sulphites'];
const ALLERGEN_LABELS = {
  celery: 'Celery', gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish',
  lupin: 'Lupin', milk: 'Milk', molluscs: 'Molluscs', mustard: 'Mustard', tree_nuts: 'Tree nuts',
  peanuts: 'Peanuts', sesame: 'Sesame', soybeans: 'Soybeans', sulphites: 'Sulphites',
};

// Cuisine + dish-type tags. These MUST equal recipes.cuisine / recipes.dish_type
// verbatim — they are matched against the column, not displayed from it, so a
// label change here without the matching UPDATE silently empties a chip.
//
// Two dimensions on purpose. "Indian" and "a salad" are different questions and
// people ask both: pick a cuisine to steer the week's flavour, pick a dish type
// to steer its shape. Either alone works; together they narrow.
const CUISINE_TAGS = [
  'British & Classic', 'Italian', 'Indian', 'Thai', 'Asian', 'Spanish',
  'Mexican', 'Middle Eastern', 'Mediterranean', 'French', 'Anytime',
];
// 'Anytime' is not a cuisine — it is the honest label for the dishes that have
// none: shakes, yoghurt bowls, cottage cheese. Better a truthful bucket than
// pretending a protein shake is British.

const DISH_TAGS = [
  { key: 'salad', label: 'Salads' },
  { key: 'grill', label: 'Grills & steaks' },
  { key: 'curry', label: 'Curries' },
  { key: 'pasta', label: 'Pasta' },
  { key: 'roast', label: 'Roasts & slow-cooked' },
  { key: 'stew', label: 'Stews' },
  { key: 'bowl', label: 'Bowls' },
  { key: 'breakfast', label: 'Breakfasts' },
  { key: 'shake', label: 'Shakes' },
  { key: 'board', label: 'Boards & snacks' },
];
const DISH_LABEL = Object.fromEntries(DISH_TAGS.map((d) => [d.key, d.label]));

// One chip, used for cuisines, dish types and the week's allergens.
// 40px minimum height — a chip is a thumb control, not a footnote.
function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', minHeight: 40,
        border: `1px solid ${on ? INK : HAIRLINE}`, background: on ? INK : '#fff',
        color: on ? CREAM : INK, borderRadius: 100, padding: '6px 14px',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

// Small pill toggle used for "Freezer first" and "Off meat".
function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 40, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
    >
      <span style={{ width: 44, height: 24, borderRadius: 100, background: on ? GREEN : HAIRLINE, position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{label}</span>
    </button>
  );
}

export default function PlanPage() {
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [weekStart, setWeekStart] = useState(null);
  const [days, setDays] = useState([]);
  const [freezerLots, setFreezerLots] = useState([]);

  // Constraint state v2
  // KIMI NOTE: the default is now ALL FIVE windows (Karum, 22 Nov 2026) — three
  // mains + two snacks. The profile default (profiles.meal_windows, read in load)
  // replaces it once it arrives, and the saved week's meals_to_plan replaces both.
  const [mealsToPlan, setMealsToPlan] = useState(PLANNABLE_MEALS.map((m) => m.key));
  const [outs, setOuts] = useState([]);           // array of { date, meal }
  const [batchDays, setBatchDays] = useState([]); // array of date strings
  const [freezerFirst, setFreezerFirst] = useState(true);
  const [avoidMeat, setAvoidMeat] = useState(false);
  const [weekCuisines, setWeekCuisines] = useState([]);   // steers lunch + dinner only
  const [weekDishTypes, setWeekDishTypes] = useState([]); // steers lunch + dinner only
  const [guests, setGuests] = useState([]);       // array of { date, meal, count }
  const [weekAllergens, setWeekAllergens] = useState([]);  // THIS WEEK only
  const [includeIds, setIncludeIds] = useState([]);        // restrict the week to these recipes
  const [recipeList, setRecipeList] = useState([]);        // {id, name} for the picker
  const [recipeSearch, setRecipeSearch] = useState('');
  const [userId, setUserId] = useState(null);
  const [profileAllergens, setProfileAllergens] = useState([]);  // permanent, read-only here
  const [dislikedIds, setDislikedIds] = useState([]);            // permanent, read-only here
  // KIMI NOTE: cuisine likes/dislikes are PERMANENT profile fields (editable on the
  // dashboard), read-only here. Dislikes hard-exclude from the picker, the steer
  // chips and the pool; likes soft-steer the engine via appetite.preferred_cuisines.
  const [likedCuisines, setLikedCuisines] = useState([]);
  const [dislikedCuisines, setDislikedCuisines] = useState([]);
  // This week's shape sheet (meal windows). profileWindows is the saved profile
  // default — kept in state so the sheet can offer to persist changes to it.
  const [windowsSheetOpen, setWindowsSheetOpen] = useState(false);
  const [defaultWindowsOn, setDefaultWindowsOn] = useState(false);
  const [profileWindows, setProfileWindows] = useState(null);

  const [saving, setSaving] = useState(false);
  // Saved state is THREE DISTINCT TRUTHS, not one boolean (spec §4.6):
  //   lastSave 'preferences' + !dirty → "Preferences saved."
  //   lastSave 'generated'            → the result panel header announces it
  //   dirty after either              → a subtle unsaved-changes note
  const [lastSave, setLastSave] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  const [seed, setSeed] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [planResult, setPlanResult] = useState(null); // { rationale, slotsWritten }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) { setLoggedOut(true); setLoading(false); }
        return;
      }
      const uid = session.user.id;

      // The plan window is a LOCK DATE + 7 days, defaulting to today — it is not
      // Monday-anchored. The dashboard grid draws today..today+6, so a Monday anchor
      // left the tail of the grid permanently blank: on a Wednesday the plan covered
      // Mon..Sun while the grid drew Wed..next Tue, and the last two days were never
      // planned at all. Same anchor, same seven days, nothing falls off the end.
      const start = isoDate(new Date());
      const weekDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));

      const { data: lots } = await supabase
        .from('pantry_lots')
        .select('recipe_id, quantity, expiry_date')
        .eq('user_id', uid).eq('item_kind', 'recipe').eq('location', 'freezer');
      const { data: recipeRows } = await supabase.from('recipes').select('id, name, protein_type, meal_type, meal_types, cuisine, dish_type, freezes, batch_portions, fresh_portions, fresh_shelf_days, image_id');

      if (cancelled) return;

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('allergens, disliked_recipe_ids, liked_cuisines, disliked_cuisines, meal_windows')
        .eq('id', uid)
        .maybeSingle();

      const nameById = {};
      for (const recipe of recipeRows || []) nameById[recipe.id] = recipe.name;

      // KIMI NOTE: "due within ~14 days" is read as expiry_date present and
      // on/before today + 14. Already-overdue lots are included (they are the
      // most due of all); lots with no expiry_date are left off the list.
      const useByLimit = addDays(start, 14);
      const dueLots = (lots || [])
        .filter((lot) => lot.expiry_date && lot.expiry_date <= useByLimit)
        .map((lot) => ({ ...lot, recipeName: nameById[lot.recipe_id] || 'A recipe' }))
        .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));

      // Restore this week's saved constraints. save_plan_constraints has always
      // written them and NOTHING has ever read them back — so every visit to
      // /plan reset to dinner-only with no outs, no batch days and no appetite,
      // silently discarding what was saved. That is why breakfast kept coming
      // back unticked. get_plan_inputs already returns them.
      let restoredMeals = false;
      try {
        const { data: inputs } = await supabase.rpc('get_plan_inputs', { p_week_start: start });
        const saved = inputs?.constraints;
        if (!cancelled && saved && typeof saved === 'object') {
          if (Array.isArray(saved.meals_to_plan) && saved.meals_to_plan.length) {
            setMealsToPlan(saved.meals_to_plan);
            restoredMeals = true;
          }
          if (Array.isArray(saved.outs)) setOuts(saved.outs);
          if (Array.isArray(saved.batch_days)) setBatchDays(saved.batch_days);
          if (Array.isArray(saved.guests)) setGuests(saved.guests);
          const ap = saved.appetite || {};
          setAvoidMeat(!!ap.avoid_meat);
          // A week saved before the tags existed carries appetite.cuisine as free
          // text. If it happens to name a real tag, restore it as a chip; if not,
          // drop it rather than showing a chip that matches nothing. The engine
          // still honours the raw string either way.
          if (Array.isArray(ap.cuisines)) setWeekCuisines(ap.cuisines.filter((c) => CUISINE_TAGS.includes(c)));
          else if (ap.cuisine && CUISINE_TAGS.includes(ap.cuisine)) setWeekCuisines([ap.cuisine]);
          if (Array.isArray(ap.dish_types)) setWeekDishTypes(ap.dish_types.filter((d) => DISH_LABEL[d]));
          if (Array.isArray(ap.avoid_allergens)) setWeekAllergens(ap.avoid_allergens);
          if (Array.isArray(ap.include_recipe_ids)) setIncludeIds(ap.include_recipe_ids);
        }
      } catch { /* no saved week yet — start from the defaults */ }

      // The saved week's meals win; otherwise fall back to the profile default
      // (profiles.meal_windows, whose column default is all five windows). A week
      // saved by an older session with dinner-only is honoured as saved — the
      // shape sheet is how that gets changed.
      if (!cancelled && !restoredMeals) {
        const prefs = profileRow?.meal_windows;
        if (Array.isArray(prefs) && prefs.length) {
          const valid = PLANNABLE_MEALS.map((m) => m.key);
          setMealsToPlan(valid.filter((k) => prefs.includes(k)));
        }
      }
      if (!cancelled) setProfileWindows(profileRow?.meal_windows || null);

      setUserId(uid);
      setProfileAllergens(profileRow?.allergens || []);
      setDislikedIds(profileRow?.disliked_recipe_ids || []);
      setLikedCuisines(profileRow?.liked_cuisines || []);
      setDislikedCuisines(profileRow?.disliked_cuisines || []);
      // KIMI NOTE: disliked cuisines are a HARD exclusion (Karum, 16 Nov 2026) — a
      // recipe whose cuisine is disliked never appears in this picker, exactly like
      // a declared allergen. The picker list and the planner pool must agree.
      const dislikedCuisineSet = new Set(profileRow?.disliked_cuisines || []);
      setRecipeList(
        (recipeRows || [])
          .filter((r) => !dislikedCuisineSet.has(r.cuisine))
          .map((r) => ({
            id: r.id,
            name: r.name,
            cuisine: r.cuisine || null,
            dish_type: r.dish_type || null,
            image_id: r.image_id || null,
            meal_types: Array.isArray(r.meal_types) && r.meal_types.length
              ? r.meal_types
              : (r.meal_type ? [r.meal_type] : []),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setWeekStart(start);
      setDays(weekDays);
      setFreezerLots(dueLots);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Move the lock date. Constraints are pinned to real dates, so anything that
  // falls outside the new window is dropped rather than silently applying to a day
  // that is no longer in the plan.
  function changeStart(iso) {
    if (!iso) return;
    const nextDays = Array.from({ length: 7 }, (_, i) => addDays(iso, i));
    const inWindow = new Set(nextDays);
    setWeekStart(iso);
    setDays(nextDays);
    setOuts((cur) => cur.filter((o) => inWindow.has(o.date)));
    setBatchDays((cur) => cur.filter((d) => inWindow.has(d)));
    setGuests((cur) => cur.filter((g) => inWindow.has(g.date)));
    setPlanResult(null);
    setDirty(true);
  }

  // DEV-PHASE ONLY: one-tap demo entry on the logged-out card (Karum, 22 Nov
  // 2026 — no sign-up in dev). Claims this browser's own throwaway demo
  // account (seeding a sample profile + a generated week can take a few
  // seconds, hence the busy state), then reloads so load() runs against the
  // fresh session.
  async function onDemo() {
    setError(null);
    setDemoBusy(true);
    const { error: demoError } = await signInAsDemo();
    if (demoError) {
      setDemoBusy(false);
      setError(demoError.message);
    } else {
      window.location.reload();
    }
  }

  function toggleWeekAllergen(code) {
    setWeekAllergens((cur) => (cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code]));
    setDirty(true);
  }

  function toggleCuisine(tag) {
    setWeekCuisines((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
    setDirty(true);
  }

  function toggleDishType(key) {
    setWeekDishTypes((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]));
    setDirty(true);
  }

  function toggleIncluded(id) {
    setIncludeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setDirty(true);
  }

  function toggleMeal(m) {
    setMealsToPlan((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
    setDirty(true);
  }

  // KIMI NOTE: persists the current window selection as the profile default via
  // the set_meal_windows RPC (security-definer, auth.uid()-scoped — mirrors
  // commit_targets). The weekly constraints in plan_weeks still override it for
  // a saved week, so this never rewrites history.
  async function saveWindowsDefault() {
    const { error: windowsErr } = await setMealWindows({ mealWindows: mealsToPlan });
    if (windowsErr) {
      setError(windowsErr.message);
    } else {
      setProfileWindows([...mealsToPlan]);
      setDefaultWindowsOn(false);
    }
  }

  // Guest nights live inside their day's row (spec §4.2). The pill on the day
  // row adds a guest night prefilled with that date; meal and count stay
  // editable inline. State shape ({ date, meal, count }) is unchanged.
  function addGuestFor(date) {
    setGuests((current) => [...current, { date, meal: mealsToPlan[0] || 'dinner', count: 1 }]);
    setDirty(true);
  }

  function updateGuest(index, patch) {
    setGuests((current) => current.map((guest, i) => (i === index ? { ...guest, ...patch } : guest)));
    setDirty(true);
  }

  function removeGuest(index) {
    setGuests((current) => current.filter((_, i) => i !== index));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const constraints = {
      meals_to_plan: mealsToPlan,
      outs: outs,
      batch_days: batchDays,
      appetite: {
        avoid_meat: avoidMeat,
        cuisines: weekCuisines,       // steers lunch + dinner only
        dish_types: weekDishTypes,    // steers lunch + dinner only
        cuisine: null,                // retired free-text field, kept null for old readers
        avoid_allergens: weekAllergens,
        include_recipe_ids: includeIds,
      },
      allergens: profileAllergens,
      exclude_recipe_ids: dislikedIds,
      guests: guests.filter((g) => g.date && g.meal && g.count > 0),
      household: 1,
    };
    const supabase = getBrowserClient();

    // DEFECT 2 — save_plan_constraints overwrites the whole constraints jsonb,
    // so a preferences-only save used to wipe the planned_against stamp that
    // generate wrote. Read the current constraints first and carry the stamp
    // across. Best-effort on purpose: a failed read falls back to today's
    // behaviour — never block a save over a stamp.
    try {
      const { data: existing } = await supabase.rpc('get_plan_inputs', { p_week_start: weekStart });
      const stamp = existing?.constraints?.planned_against;
      if (stamp && typeof stamp === 'object') constraints.planned_against = stamp;
    } catch { /* stamp read failed — save without it */ }

    const { error: rpcError } = await supabase.rpc('save_plan_constraints', {
      p_week_start: weekStart,
      p_constraints: constraints,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setLastSave('preferences');
      setDirty(false);
    }
  }

  async function generateNow(useSeed) {
    setGenerating(true);
    setError(null);
    setPlanResult(null);
    try {
      const supabase = getBrowserClient();
      const constraints = {
        meals_to_plan: mealsToPlan,
        outs: outs,
        batch_days: batchDays,
        appetite: {
          avoid_meat: avoidMeat,
          cuisines: weekCuisines,                  // steers lunch + dinner only
          dish_types: weekDishTypes,               // steers lunch + dinner only
          cuisine: null,                           // retired free-text field
          avoid_allergens: weekAllergens,          // this week only
          include_recipe_ids: includeIds,          // empty = the whole book
        },
        allergens: profileAllergens,               // PERMANENT — the planner must never violate these
        exclude_recipe_ids: dislikedIds,           // PERMANENT
        guests: guests.filter((g) => g.date && g.meal && g.count > 0),
        household: 1,
      };
      const { error: saveErr } = await supabase.rpc('save_plan_constraints', {
        p_week_start: weekStart, p_constraints: constraints,
      });
      if (saveErr) throw saveErr;

      const { data: inputs, error: readErr } = await supabase.rpc('get_plan_inputs', {
        p_week_start: weekStart,
      });
      if (readErr) throw readErr;

      // ── BRIDGE ITEM 3 — the client-side merge is RETIRED.
      //
      // get_plan_inputs now selects meal_type, meal_types, cuisine and dish_type
      // itself, so the pool arrives complete and this page no longer re-reads
      // `recipes` to patch it. That removes the second derivation of the recipe
      // pool: one query, one shape, one source of truth.
      //
      // It also removes a real failure mode. The old merge was best-effort — a
      // silent catch — so a failed read meant every recipe fell back to
      // ['lunch','dinner'], the breakfast pool emptied, and the week came back
      // with seven blank breakfasts and no explanation anywhere.
      const recipePool0 = inputs.recipes || [];

      let recipePool = recipePool0;

      // Allergens are matched against recipe_allergens.contains, exactly as the
      // dashboard's Swap chooser does. If this read fails we must NOT plan blind —
      // an unfiltered plan could propose a declared allergen — so we stop instead.
      const { data: allergenRows, error: allergenErr } = await supabase
        .from('recipe_allergens')
        .select('recipe_id, contains');
      if (allergenErr) throw allergenErr;
      const allergensById = Object.fromEntries((allergenRows || []).map((row) => [row.recipe_id, row.contains || []]));
      recipePool = recipePool.map((r) => ({ ...r, allergens: allergensById[r.id] || [] }));

      // KIMI NOTE: disliked cuisines are a HARD exclusion, allergen-style (Karum,
      // 16 Nov 2026). The pool is pre-filtered here — the same place
      // disliked_recipe_ids already binds — so the engine needs NO cuisine-dislike
      // knowledge, and a disliked dish in the freezer stays there.
      const dislikedCuisineSet = new Set(dislikedCuisines);
      recipePool = recipePool.filter((r) => !dislikedCuisineSet.has(r.cuisine));

      // ── BRIDGE ITEMS 4 + 6 — targets reach the engine ────────────────────
      // get_plan_inputs v4 returns `targets` read LIVE from profiles on every
      // call. That is item 6 in one line: commit_targets writes profiles,
      // get_plan_inputs reads profiles, so the next plan generated after a
      // commit uses the new numbers. There is no cached copy to invalidate and
      // nothing here to remember to refresh.
      //
      // Merging them into the constraints object is NOT the retired
      // client-side merge — both halves came out of the same RPC call, so
      // there is still exactly one derivation. What was wrong before was
      // re-reading `recipes` separately and patching the pool with it.
      //
      // `diet` (v5) carries the carb ceiling. 35 g/day belongs to keto, not to
      // HERB, so the engine holds no diet knowledge at all and takes whatever
      // ceiling arrives here — including none, which is a real answer for a
      // plain deficit or a bulk.
      const planConstraints = {
        ...inputs.constraints,
        targets: inputs.targets || null,
        diet: inputs.diet || null,
      };
      // KIMI NOTE: PROFILE LIKES AS A PERMANENT DEFAULT (Karum, 16 Nov 2026). The
      // manual weekly steer (appetite.cuisines, restored from the saved week above)
      // takes precedence by construction: likes are handed to the engine as
      // appetite.preferred_cuisines, which the engine applies ONLY when no manual
      // cuisine steer is set — and soft-falls back to the full book when the liked
      // pool cannot fill the week. They are injected here, not saved into
      // plan_weeks.constraints, so a dashboard edit takes effect on the very next
      // plan without re-saving the week.
      planConstraints.appetite = {
        ...(planConstraints.appetite || {}),
        preferred_cuisines: likedCuisines,
      };

      const result = generatePlan(planConstraints, inputs.inventory, recipePool, {
        weekStart, seed: useSeed,
      });

      const { data: applied, error: applyErr } = await supabase.rpc('apply_generated_plan', {
        p_week_start: weekStart, p_slots: result.slots,
      });
      if (applyErr) throw applyErr;

      // ── COMPONENT (prep) PLANNING ────────────────────────────────────────
      // Runs AFTER the plan exists, and that order is not incidental: component
      // demand is a CONSEQUENCE of which dishes landed on which days, so it
      // cannot be known before there is a plan to read.
      //
      // Best-effort on purpose. A component is a convenience — it saves money
      // and a shop — so a failed read must never cost you the week. That is the
      // opposite of the allergen read above, which throws rather than plan
      // blind. Convenience degrades; safety stops.
      let componentPlan = null;
      try {
        const [{ data: compRows }, { data: inputRows }] = await Promise.all([
          supabase.from('components')
            .select('id, name, produces_ingredient_id, yield_qty, yield_unit, shelf_life_days, location')
            .eq('active', true),
          supabase.from('component_inputs').select('component_id, ingredient_id, quantity, unit'),
        ]);
        const producible = [...new Set((compRows || []).map((c) => c.produces_ingredient_id))];
        const plannedIds = [...new Set(result.slots.filter((s) => s.recipe_id).map((s) => s.recipe_id))];

        if (producible.length && plannedIds.length) {
          const inputsByComponent = {};
          for (const row of inputRows || []) {
            (inputsByComponent[row.component_id] ||= []).push({
              ingredient_id: row.ingredient_id, quantity: Number(row.quantity),
            });
          }
          const components = (compRows || []).map((c) => ({
            ...c,
            yield_qty: Number(c.yield_qty),
            shelf_life_days: Number(c.shelf_life_days),
            inputs: inputsByComponent[c.id] || [],
          }));

          // Only the producible ingredients, and only for dishes that actually
          // landed. Asking for the whole join would pull ~390 rows to use six.
          const { data: riRows } = await supabase
            .from('recipe_ingredients')
            .select('recipe_id, ingredient_id, quantity')
            .in('recipe_id', plannedIds)
            .in('ingredient_id', producible);
          const needsByRecipe = {};
          for (const row of riRows || []) {
            (needsByRecipe[row.recipe_id] ||= []).push({
              ingredient_id: row.ingredient_id, quantity: Number(row.quantity),
            });
          }

          // Existing stock of the produced ingredient. Netted per
          // (ingredient, expiry_date) — deliberately the SAME bucket shape as
          // get_plan_inputs and eat_portions use for portions. A lot is a lot;
          // the write path and the planner must agree on what one is.
          const { data: stockRows } = await supabase
            .from('pantry_log')
            .select('ingredient_id, quantity, expiry_date')
            .eq('user_id', userId)
            .eq('item_kind', 'ingredient')
            .in('ingredient_id', producible);
          const buckets = {};
          for (const row of stockRows || []) {
            const key = `${row.ingredient_id}|${row.expiry_date || ''}`;
            buckets[key] ||= { ingredient_id: row.ingredient_id, expiry_date: row.expiry_date, quantity: 0 };
            buckets[key].quantity += Number(row.quantity);
          }
          const stock = Object.values(buckets).filter((l) => l.quantity > 0);

          componentPlan = planComponents(result.slots, needsByRecipe, components, stock, {
            weekStart, batchDays,
          });
        }
      } catch { /* a component is a convenience — never lose the week over one */ }

      // ── BRIDGE ITEM 6 — stamp what this week was planned AGAINST ─────────
      // Without this, "did my new targets reach the plan?" can only be
      // answered by regenerating and squinting. The week now records the
      // numbers it was built on, so a week planned under old targets is
      // identifiable rather than merely suspected.
      //
      // Best-effort on purpose, and the reasoning is the component rule again:
      // the plan is already written and applied by this point, so failing to
      // record a stamp must not present as a failed plan. Convenience
      // degrades; safety stops.
      try {
        await supabase.rpc('save_plan_constraints', {
          p_week_start: weekStart,
          p_constraints: {
            ...constraints,
            planned_against: {
              targets: inputs.targets || null,
              diet: inputs.diet || null,
              carb_ceiling_g: result.macroSummary?.carb_ceiling_g ?? null,
              at: new Date().toISOString(),
            },
          },
        });
      } catch { /* the plan is already saved; the stamp is a nicety */ }

      setPlanResult({
        rationale: result.rationale || [],
        slotsWritten: applied?.slots_written ?? 0,
        components: componentPlan,
        macros: result.macroSummary || null,
      });
      setLastSave('generated');
      setDirty(false);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setGenerating(false);
    }
  }

  // ---- derived: what the chips are actually doing to the book ----------------
  const steerOn = weekCuisines.length > 0 || weekDishTypes.length > 0;
  const matchesSteer = (r) =>
    (weekCuisines.length === 0 || weekCuisines.includes(r.cuisine)) &&
    (weekDishTypes.length === 0 || weekDishTypes.includes(r.dish_type));

  // The list under the chips. Search and chips both narrow; clearing the chips
  // is how you get all 55 back.
  const visibleRecipes = recipeList.filter(
    (r) => r.name.toLowerCase().includes(recipeSearch.trim().toLowerCase()) && matchesSteer(r)
  );

  // How many lunch/dinner dishes survive the steer. Zero means those slots come
  // back empty, and the user should be told BEFORE hitting generate rather than
  // finding out from the rationale afterwards.
  const servesLD = (r) => r.meal_types.includes('lunch') || r.meal_types.includes('dinner');
  const matchingLD = recipeList.filter((r) => servesLD(r) && matchesSteer(r)).length;

  // "Only plan these dishes" is a HARD restriction and it binds EVERY meal,
  // light ones included — pin five curries with breakfast ticked and you get
  // seven blank breakfasts. That is the engine working as specified, but it
  // looks exactly like a bug, so name the gap here rather than letting the
  // plan come back short and unexplained.
  const pinnedGaps = includeIds.length === 0 ? [] : PLANNABLE_MEALS.filter((m) => {
    if (!mealsToPlan.includes(m.key)) return false;
    const need = (m.key === 'snack_am' || m.key === 'snack_pm') ? 'snack' : m.key;
    return !includeIds.some((id) => {
      const r = recipeList.find((x) => x.id === id);
      if (!r) return false;
      const types = r.meal_types.length ? r.meal_types : ['lunch', 'dinner'];
      return types.includes(need);
    });
  });

  const inputStyle = {
    border: `1px solid ${HAIRLINE}`,
    background: CREAM,
    color: INK,
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
  };

  return (
    <main style={{ background: CREAM, minHeight: '100vh', color: INK }}>
      <div className="herb-page">
        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: MUTED, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        {loading ? (
          <div className="herb-card" style={{ color: MUTED, fontSize: 14 }}>Loading your week…</div>
        ) : loggedOut ? (
          <div className="herb-card">
            <div style={eyebrowStyle}>Plan my week</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sign in to plan your week.</div>
            {/* Dev-phase demo entry — no account needed (Karum, 22 Nov 2026). */}
            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="herb-btn herb-btn-primary" onClick={onDemo} disabled={demoBusy}>
                {demoBusy ? 'Setting up your demo…' : 'Enter the demo — no account needed'}
              </button>
              <Link href="/login" className="herb-btn herb-btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Log in
              </Link>
            </div>
          </div>
        ) : (
          <>
            <header>
              <div style={{ ...eyebrowStyle, color: PINK, marginBottom: 6 }}>Plan my week</div>
              <h1 className="herb-h1">
                {dayLabel(days[0])} — {dayLabel(days[6])}
              </h1>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>
                Set this week&rsquo;s constraints. The plan itself is generated in a later step.
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: MUTED }}>Plan from</span>
                <input
                  type="date"
                  value={weekStart || ''}
                  onChange={(e) => changeStart(e.target.value)}
                  style={{ ...inputStyle, padding: '8px 12px' }}
                />
                <span style={{ color: MUTED, fontWeight: 400 }}>for the next 7 days</span>
              </label>
            </header>

            {/* ── 1 · This week's shape ───────────────────────────────
                A summary, not a form — the five windows as chips with a
                Change button that opens the bottom sheet. Dessert counts as
                a snack: the engine has no dessert tag, a dessert IS a
                snack-tagged dish, so the two snack windows already carry
                desserts (copy only, no data change). */}
            <section className="herb-card">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div style={eyebrowStyle}>This week&rsquo;s shape</div>
                <button
                  type="button"
                  onClick={() => setWindowsSheetOpen(true)}
                  className="herb-btn herb-btn-secondary herb-btn-inline"
                >
                  Change
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {PLANNABLE_MEALS.map((m) => {
                  const on = mealsToPlan.includes(m.key);
                  return (
                    <span
                      key={m.key}
                      style={{
                        display: 'inline-flex', alignItems: 'center', minHeight: 40,
                        border: `1px solid ${on ? INK : HAIRLINE}`,
                        background: on ? INK : '#fff',
                        color: on ? CREAM : MUTED,
                        borderRadius: 100,
                        padding: '6px 14px',
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      {m.label}
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
                Three mains, two snacks &amp; dessert — the snack windows carry puddings too. Tap Change to set your own default.
              </div>
            </section>

            {/* ── 2 · Your week (outs + guest nights + batch days) ────
                One card, seven day rows. Outs are per-meal pills, guest
                nights live inside their day's row, batch-cook chips sit at
                the foot. The old standalone Guests and Household sections
                are gone — guests moved here, household ships later. */}
            <section className="herb-card">
              <div style={eyebrowStyle}>Your week</div>
              <div style={{ display: 'grid' }}>
                {days.map((date, dayIndex) => {
                  const dayGuests = guests
                    .map((guest, index) => ({ ...guest, index }))
                    .filter((guest) => guest.date === date);
                  return (
                    <div
                      key={date}
                      style={dayIndex > 0 ? { borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12, marginTop: 12 } : {}}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 100 }}>{dayLabel(date)}</span>
                        <span style={{ display: 'inline-flex', background: CREAM, border: `1px solid ${HAIRLINE}`, borderRadius: 100, padding: 3, flexWrap: 'wrap', gap: 3 }}>
                          {mealsToPlan.map((meal) => {
                            const isOut = outs.some(o => o.date === date && o.meal === meal);
                            return (
                              <button
                                key={meal}
                                type="button"
                                onClick={() => {
                                  if (isOut) {
                                    setOuts(outs.filter(o => !(o.date === date && o.meal === meal)));
                                  } else {
                                    setOuts([...outs, { date, meal }]);
                                  }
                                  setDirty(true);
                                }}
                                style={{
                                  border: 'none',
                                  borderRadius: 100,
                                  padding: '7px 14px',
                                  minHeight: 40,
                                  fontSize: 12.5,
                                  fontWeight: 700,
                                  fontFamily: 'inherit',
                                  cursor: 'pointer',
                                  background: isOut ? BLUE : 'transparent',
                                  color: isOut ? CREAM : MUTED,
                                }}
                              >
                                Out for {meal}
                              </button>
                            );
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => addGuestFor(date)}
                          style={{
                            border: `1px dashed ${HAIRLINE}`,
                            background: '#fff',
                            color: MUTED,
                            borderRadius: 100,
                            padding: '6px 14px',
                            minHeight: 40,
                            fontSize: 12.5,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          + guests
                        </button>
                      </div>
                      {dayGuests.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 112 }}>
                          {dayGuests.map((guest) => (
                            <span key={guest.index} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <select
                                value={guest.meal || mealsToPlan[0]}
                                onChange={(event) => updateGuest(guest.index, { meal: event.target.value })}
                                style={{ ...inputStyle, background: '#fff', padding: '6px 10px', fontSize: 13, minHeight: 40 }}
                              >
                                {mealsToPlan.map((meal) => (
                                  <option key={meal} value={meal}>{meal}</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min="1"
                                value={guest.count}
                                onChange={(event) => updateGuest(guest.index, { count: Number(event.target.value) })}
                                style={{ ...inputStyle, width: 68, background: '#fff', padding: '6px 10px', fontSize: 13, minHeight: 40 }}
                                aria-label="Number of guests"
                              />
                              <span style={{ fontSize: 13, color: MUTED }}>guest{guest.count === 1 ? '' : 's'}</span>
                              <button
                                type="button"
                                onClick={() => removeGuest(guest.index)}
                                style={{ border: 'none', background: 'none', color: MUTED, fontSize: 13, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                              >
                                Remove
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Which days will you batch-cook?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {days.map((date) => {
                    const isBatch = batchDays.includes(date);
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => {
                          if (isBatch) {
                            setBatchDays(batchDays.filter((d) => d !== date));
                          } else {
                            setBatchDays([...batchDays, date]);
                          }
                          setDirty(true);
                        }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', minHeight: 40,
                          border: `1px solid ${isBatch ? INK : HAIRLINE}`,
                          background: isBatch ? INK : '#fff',
                          color: isBatch ? CREAM : INK,
                          borderRadius: 100,
                          padding: '8px 14px',
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {dayLabel(date)}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { setBatchDays([]); setDirty(true); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', minHeight: 40,
                      border: `1px solid ${batchDays.length === 0 ? INK : HAIRLINE}`,
                      background: batchDays.length === 0 ? INK : '#fff',
                      color: batchDays.length === 0 ? CREAM : MUTED,
                      borderRadius: 100,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    None
                  </button>
                </div>
              </div>
            </section>

            {/* ── 3 · This week's appetite ──────────────────────────── */}
            <section className="herb-card herb-card-bleed">
              <div style={eyebrowStyle}>This week&rsquo;s appetite</div>
              <Toggle on={avoidMeat} onChange={(value) => { setAvoidMeat(value); setDirty(true); }} label="Off meat this week" />
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                Drops beef, pork, lamb and chicken. Fish and vegetarian dishes stay.
              </div>

              {/* Avoid this week — temporary, separate from your profile allergies */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Avoid this week</div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  Just for these seven days — vegan January, off gluten, too hot for heavy food.
                  {profileAllergens.length > 0 ? ' Your profile allergies are always excluded and are not listed here.' : ''}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ALLERGENS.filter((code) => !profileAllergens.includes(code)).map((code) => {
                    const on = weekAllergens.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggleWeekAllergen(code)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', minHeight: 40,
                          border: `1px solid ${on ? INK : HAIRLINE}`, background: on ? INK : '#fff',
                          color: on ? CREAM : INK, borderRadius: 100, padding: '5px 13px',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {ALLERGEN_LABELS[code]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Fancy something? Cuisine + dish-type chips ──────────
                  These are TASTE steers and they bind LUNCH AND DINNER ONLY.
                  Breakfasts, shakes and snacks carry the 'Anytime' cuisine
                  because they have none, so steering them too would blank
                  seven breakfasts and fourteen snacks the moment you tapped
                  "Indian". Light meals are already exempt from the slot cap;
                  they are exempt from this for the same reason. ── */}
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  Fancy a cuisine? <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  Steers lunch and dinner. Breakfast and snacks are never steered.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {/* KIMI NOTE: disliked cuisines are hidden from the steer chips
                      (Karum, 16 Nov 2026) — a hard-excluded cuisine must not be
                      offered as a steer. Unticking one for dislike removes its chip. */}
                  {CUISINE_TAGS.filter((tag) => !dislikedCuisines.includes(tag)).map((tag) => (
                    <Chip key={tag} on={weekCuisines.includes(tag)} onClick={() => toggleCuisine(tag)}>
                      {tag}
                    </Chip>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  Fancy something in particular? <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  A week of salads, a week of curries — the shape of the food rather than its flavour.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {DISH_TAGS.map((d) => (
                    <Chip key={d.key} on={weekDishTypes.includes(d.key)} onClick={() => toggleDishType(d.key)}>
                      {d.label}
                    </Chip>
                  ))}
                </div>
                {(weekCuisines.length > 0 || weekDishTypes.length > 0) && (
                  <button
                    type="button"
                    onClick={() => { setWeekCuisines([]); setWeekDishTypes([]); setDirty(true); }}
                    style={{ marginTop: 10, border: 'none', background: 'none', color: MUTED, fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0, minHeight: 40 }}
                  >
                    Clear the steer
                  </button>
                )}
                {matchingLD === 0 && (weekCuisines.length > 0 || weekDishTypes.length > 0) && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#C0392B', marginTop: 10 }}>
                    Nothing in your book matches that for lunch or dinner — those slots would come back empty.
                  </div>
                )}
              </div>

              {/* ── Pick specific dishes ────────────────────────────────
                  Fifty-five rows in one scroll is not a chooser, it is a
                  list. The chips above filter it, so picking "Indian" turns
                  a 55-row scroll into five. */}
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  Only plan these dishes <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  {includeIds.length === 0
                    ? (steerOn
                        ? `Nothing pinned — the planner uses anything matching the chips above.`
                        : `Nothing pinned — the planner uses all ${recipeList.length} recipes.`)
                    : `${includeIds.length} pinned — the week will be built from these only.`}
                </div>
                {includeIds.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {includeIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleIncluded(id)}
                        style={{ border: 'none', background: GREEN, color: '#fff', borderRadius: 100, padding: '5px 13px', minHeight: 40, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {recipeList.find((r) => r.id === id)?.name || 'Recipe'} ×
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setIncludeIds([]); setDirty(true); }}
                      style={{ border: `1px solid ${HAIRLINE}`, background: '#fff', color: MUTED, borderRadius: 100, padding: '5px 13px', minHeight: 40, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Clear all
                    </button>
                  </div>
                )}
                {pinnedGaps.length > 0 && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#B26B00', background: '#FDF6E7', border: `1px solid ${AMBER}`, borderRadius: 10, padding: '9px 12px', marginBottom: 10 }}>
                    Nothing you have pinned can serve {pinnedGaps.map((m) => m.label.toLowerCase()).join(', ')} —
                    {pinnedGaps.length === 1 ? ' that slot' : ' those slots'} will come back empty. Pin something for
                    {pinnedGaps.length === 1 ? ' it' : ' them'}, or untick {pinnedGaps.length === 1 ? 'it' : 'them'} above.
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Search your recipes…"
                  value={recipeSearch}
                  onChange={(event) => setRecipeSearch(event.target.value)}
                  style={{ ...inputStyle, width: '100%', maxWidth: 380, background: '#fff', marginBottom: 8 }}
                />
                <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>
                  Showing {visibleRecipes.length} of {recipeList.length}
                  {steerOn ? ' · filtered by the chips above' : ''}
                </div>
                {/* ── Dish carousel ─────────────────────────────────────
                    The chooser is a carousel of dish cards, not a text
                    scroll — you pick with your eyes. Images come from
                    recipeImageUrl (the single source of truth for image
                    URLs); recipes with no image_id get an honest initial
                    tile rather than a broken picture. Tap a card to pin
                    it; the chips and search above filter it. */}
                {visibleRecipes.length === 0 ? (
                  <div style={{ padding: '14px 12px', fontSize: 13, color: MUTED, border: `1px solid ${HAIRLINE}`, borderRadius: 12, background: '#fff' }}>
                    No dishes match. Clear a chip or the search box.
                  </div>
                ) : (
                  <div className="herb-carousel">
                    {visibleRecipes.map((r) => {
                      const pinned = includeIds.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggleIncluded(r.id)}
                          aria-pressed={pinned}
                          style={{
                            width: 136, border: `2px solid ${pinned ? INK : HAIRLINE}`,
                            borderRadius: 14, background: '#fff', padding: 0,
                            overflow: 'hidden', cursor: 'pointer', fontFamily: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          {r.image_id ? (
                            <span style={{ position: 'relative', display: 'block', aspectRatio: '4 / 3', backgroundColor: '#F1E7D5', backgroundImage: `url('${recipeImageUrl(r.image_id)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                              {pinned && (
                                <span style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: INK, color: CREAM, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>✓</span>
                              )}
                            </span>
                          ) : (
                            <span style={{ position: 'relative', display: 'grid', placeItems: 'center', aspectRatio: '4 / 3', backgroundColor: '#F1E7D5', color: MUTED, fontFamily: 'var(--font-newsreader), Georgia, serif', fontStyle: 'italic', fontSize: 34 }}>
                              {r.name.charAt(0)}
                              {pinned && (
                                <span style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: INK, color: CREAM, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>✓</span>
                              )}
                            </span>
                          )}
                          <span style={{ display: 'block', padding: '8px 10px 10px' }}>
                            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, color: INK, fontFamily: 'var(--font-newsreader), Georgia, serif', fontStyle: 'italic' }}>
                              {r.name}
                            </span>
                            <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 3 }}>
                              {[r.cuisine, r.dish_type ? DISH_LABEL[r.dish_type] || r.dish_type : null]
                                .filter(Boolean).join(' · ') || 'untagged'}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* ── 4 · Freezer first ─────────────────────────────────── */}
            <section className="herb-card">
              <div style={eyebrowStyle}>Freezer first</div>
              {freezerLots.length === 0 ? (
                <div style={{ fontSize: 14, color: MUTED }}>No freezer portions to use up this week.</div>
              ) : (
                <div style={{ display: 'grid' }}>
                  {freezerLots.map((lot, index) => (
                    <div key={`${lot.recipe_id}-${index}`} className="shop-row" style={{ cursor: 'default' }}>
                      <span className="shop-name">{lot.recipeName}</span>
                      <span className="shop-price">
                        {lot.quantity} portion{lot.quantity === 1 ? '' : 's'} · use by {dayLabel(lot.expiry_date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Toggle on={freezerFirst} onChange={(value) => { setFreezerFirst(value); setDirty(true); }} label="Use these up first" />
              </div>
            </section>

            {/* ── CTA bar ─────────────────────────────────────────────
                One primary action: Generate my plan (ink, full width on a
                phone, sticky at the foot of the viewport — .herb-page
                reserves the 96px). "Save preferences" is the secondary.
                After a generate the bar switches to Regenerate + the
                dashboard link; the result panel header announces that the
                week IS saved. Three saved states, three messages (spec §4.6);
                the "coming soon" sentence is deleted everywhere. */}
            <div className="herb-cta">
              {!planResult ? (
                <>
                  <button
                    type="button"
                    className="herb-btn herb-btn-primary"
                    disabled={generating}
                    onClick={() => generateNow(seed)}
                  >
                    {generating ? 'Generating…' : 'Generate my plan'}
                  </button>
                  <button
                    type="button"
                    className="herb-btn herb-btn-secondary"
                    disabled={saving}
                    onClick={save}
                  >
                    {saving ? 'Saving…' : 'Save preferences'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="herb-btn herb-btn-secondary"
                    disabled={saving}
                    onClick={save}
                  >
                    {saving ? 'Saving…' : 'Save preferences'}
                  </button>
                  <button
                    type="button"
                    className="herb-btn herb-btn-secondary"
                    disabled={generating}
                    onClick={() => { const n = seed + 1; setSeed(n); generateNow(n); }}
                  >
                    Regenerate (different plan)
                  </button>
                  <Link href="/dashboard" style={{ fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'underline', minHeight: 40, display: 'inline-flex', alignItems: 'center' }}>
                    View plan on dashboard →
                  </Link>
                </>
              )}
              {!dirty && lastSave === 'preferences' && (
                <span style={{ fontSize: 14, fontWeight: 600, color: GREEN }}>✓ Preferences saved.</span>
              )}
              {dirty && lastSave === 'preferences' && (
                <span style={{ fontSize: 13, color: MUTED }}>You have unsaved changes.</span>
              )}
              {dirty && lastSave === 'generated' && (
                <span style={{ fontSize: 13, color: MUTED }}>Changes not yet saved to your week.</span>
              )}
              {error && (
                <span style={{ fontSize: 14, fontWeight: 600, color: '#C0392B' }}>{error}</span>
              )}
            </div>

            {/* ── Generate Result Panel ──────────────────────────────────────────── */}
            {planResult && (
              <div className="herb-card">
                {/* "This week is saved" — the panel header says the week IS
                    saved, and names any holes rather than reading as "this
                    week has N slots". */}
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {(() => {
                    const planned = planResult.macros
                      ? planResult.macros.per_day.reduce((n, d) => n + d.slots_planned, 0)
                      : null;
                    const set = planResult.slotsWritten;
                    const range = `${dayLabel(days[0])} — ${dayLabel(days[6])}`;
                    return planned && planned !== set
                      ? `This week is saved — ${set} of ${planned} slots for ${range}, ${planned - set} left empty.`
                      : `This week is saved — ${set} slots for ${range}.`;
                  })()}
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, color: MUTED, fontSize: 14, lineHeight: 1.6 }}>
                  {planResult.rationale.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>

                {/* ── Against your targets (bridge items 4-6) ──────────────
                    A plan that hit its numbers and a plan that had no numbers
                    to hit must not look the same on screen. When targets are
                    missing this panel says so and says WHICH silence it is;
                    when they are present it shows the day-by-day result, so
                    "did my new targets reach this plan?" is answered by
                    looking rather than by regenerating and squinting. ── */}
                {planResult.macros && !planResult.macros.targeting && (
                  <div style={{ marginTop: 16, background: '#FDF6E7', border: `1px solid ${AMBER}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#B26B00', marginBottom: 6 }}>
                      Planned without targets
                    </div>
                    <div style={{ fontSize: 13, color: '#7A4A00', lineHeight: 1.6 }}>
                      {planResult.macros.source === 'no_profile'
                        ? 'No profile was found, so calories and protein were not taken into account.'
                        : 'Your profile has no calorie or protein target saved, so calories and protein were not taken into account.'}
                    </div>
                    <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 600, color: '#7A4A00' }}>
                      Set your targets on the dashboard →
                    </Link>
                  </div>
                )}

                {planResult.macros && planResult.macros.targeting && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
                    <div style={eyebrowStyle}>Against your targets</div>
                    <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
                      {planResult.macros.target_kcal} kcal · {planResult.macros.target_protein_g} g protein ·
                      {' '}carbs capped at {planResult.macros.carb_ceiling_g} g a day
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {planResult.macros.per_day.map((d) => {
                        const ceiling = planResult.macros.carb_ceiling_g || 35;
                        const carbPct = Math.min(100, Math.round((d.carbs_g / ceiling) * 100));
                        return (
                          <div key={d.slot_date} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                            <span style={{ width: 96, color: MUTED, flexShrink: 0 }}>{dayLabel(d.slot_date)}</span>
                            <span style={{ width: 68, fontWeight: 600, color: d.kcal_in_band === false ? '#B26B00' : INK, flexShrink: 0 }}>
                              {d.kcal} kcal
                            </span>
                            {/* Amber only for a REAL miss. A day 3 g under a
                                183 g floor is hit; flagging it identically to
                                a day 33 g under buries the only one worth
                                acting on. The gap is named in grams, so the
                                SIZE of the miss is visible and not just its
                                existence. */}
                            <span style={{ width: 84, fontWeight: 600, color: d.protein_met === false ? '#B26B00' : INK, flexShrink: 0 }}>
                              {d.protein_g} g P
                              {d.protein_met === false && d.protein_short_g > 0 ? (
                                <span style={{ fontWeight: 500 }}> &minus;{d.protein_short_g}</span>
                              ) : null}
                            </span>
                            {/* The carb meter is the one number with a hard
                                edge, so it gets the only bar: a full bar is
                                the ceiling, not a target to reach. */}
                            <span style={{ flex: 1, minWidth: 40, height: 6, background: HAIRLINE, borderRadius: 3, overflow: 'hidden' }}>
                              <span style={{ display: 'block', width: `${carbPct}%`, height: '100%', background: carbPct >= 90 ? AMBER : GREEN }} />
                            </span>
                            <span style={{ width: 54, textAlign: 'right', color: MUTED, flexShrink: 0 }}>
                              {d.carbs_g} g C
                            </span>
                            {/* The fat lever, stated in grams. "Add some oil"
                                is not a plan; "+12 g olive oil" is. */}
                            <span style={{ width: 46, textAlign: 'right', color: d.fat_top_up_g > 0 ? INK : HAIRLINE, flexShrink: 0 }}>
                              {d.fat_top_up_g > 0 ? `+${d.fat_top_up_g} g` : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
                      The week averages {planResult.macros.avg_daily_kcal} kcal a day
                      {planResult.macros.week_in_band ? ', inside' : ', outside'} the weekly band.
                      Protein is driven, carbs are capped, and calories are closed
                      {planResult.macros.fat_lever
                        ? ` with ${planResult.macros.fat_lever.label} — ${planResult.macros.fat_added_total_g} g across the week, spread over the meals above.`
                        : ' by the dishes alone; this diet sets no fat lever, so short days stay short.'}
                    </div>
                  </div>
                )}

                {/* ── Prep cooks ───────────────────────────────────────────
                    A component never occupies a slot, so it would otherwise be
                    invisible: the plan would quietly assume pulled chicken
                    exists without ever telling you to roast the bird. This is
                    where the plan asks for it. ── */}
                {planResult.components && planResult.components.cooks.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
                    <div style={eyebrowStyle}>Prep to cook</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {planResult.components.cooks.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>
                            {c.component_name}
                          </span>
                          <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>
                            {dayLabel(c.cook_date)} · makes {c.yield_qty}{c.yield_unit} · use by {dayLabel(c.expiry_date)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
                      Cooked alongside your batch day and used across the week — it fills no meal slot of its own.
                    </div>
                  </div>
                )}

                {planResult.components && planResult.components.shortfalls.length > 0 && (
                  <div style={{ marginTop: 16, background: '#FDF6E7', border: `1px solid ${AMBER}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#B26B00', marginBottom: 6 }}>
                      Not everything is covered
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#7A4A00', lineHeight: 1.6 }}>
                      {planResult.components.shortfalls.map((s, i) => (
                        <li key={i}>
                          {Math.round(s.short_by)}g short for {s.meal} on {dayLabel(s.date)} — {s.reason}.
                        </li>
                      ))}
                    </ul>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                      Buy it ready-made or move the dish. Nothing is substituted for you.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── This week's shape sheet ─────────────────────────────
                Bottom sheet on a phone, centred card on desktop (the
                herb-sheet classes). Toggling a window edits this week
                immediately — mealsToPlan is the same state the outs pills,
                guest rows and payloads have always derived from. */}
            {windowsSheetOpen && (
              <div className="herb-sheet-scrim" onClick={() => setWindowsSheetOpen(false)}>
                {/* stopPropagation so tapping inside the sheet doesn't close it */}
                <div className="herb-sheet" onClick={(e) => e.stopPropagation()}>
                  <div style={eyebrowStyle}>This week&rsquo;s shape</div>
                  <div style={{ display: 'grid' }}>
                    {PLANNABLE_MEALS.map((m) => {
                      const on = mealsToPlan.includes(m.key);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => {
                            // At least one window must stay on — a week with
                            // zero planned meals plans nothing.
                            if (on && mealsToPlan.length === 1) return;
                            toggleMeal(m.key);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                            minHeight: 52, border: 'none', borderBottom: `1px solid ${HAIRLINE}`,
                            background: 'none', padding: '6px 0', fontFamily: 'inherit', cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{m.label}</span>
                          <span style={{ width: 44, height: 24, borderRadius: 100, background: on ? GREEN : HAIRLINE, position: 'relative', transition: 'background .15s' }}>
                            <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                    Dessert counts as a snack — anything snack-tagged can land in either snack window.
                  </div>
                  <Toggle on={defaultWindowsOn} onChange={setDefaultWindowsOn} label="Always plan these meals" />
                  {profileWindows && defaultWindowsOn && (
                    <div style={{ fontSize: 12, color: MUTED }}>
                      Saves to your profile — every new week starts with these windows.
                    </div>
                  )}
                  <button
                    type="button"
                    className="herb-btn herb-btn-primary"
                    onClick={async () => {
                      if (defaultWindowsOn) await saveWindowsDefault();
                      setWindowsSheetOpen(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </main>
  );
}
