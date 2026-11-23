// app/plan/_plan/planSaveGuests.js

import { getBrowserClient } from '../../../lib/supabaseBrowser';
import { setMealWindows } from '../../../lib/actions';

// KIMI NOTE: module split (2026-11-24) — verbatim from the single-file
// build; closures read the per-render deps bag (fresh every render, so
// no stale-closure change from the original component-scope functions).
export function createPlanSaveGuests(deps) {
  const {
    avoidMeat, batchDays, dislikedIds, guests,
    includeIds, mealsToPlan, outs, profileAllergens,
    setDefaultWindowsOn, setDirty, setError, setGuests,
    setIncludeIds, setLastSave, setMealsToPlan, setProfileWindows,
    setSaving, setWeekAllergens, setWeekCuisines, setWeekDishTypes,
    weekAllergens, weekCuisines, weekDishTypes, weekStart,
  } = deps;

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
  return { toggleWeekAllergen, toggleCuisine, toggleDishType, toggleIncluded, toggleMeal, saveWindowsDefault, addGuestFor, updateGuest, removeGuest, save };
}
