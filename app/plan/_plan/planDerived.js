// app/plan/_plan/planDerived.js
import { PLANNABLE_MEALS } from './planShared';

// KIMI NOTE: module split (2026-11-24) — derived values, verbatim from the
// single-file build with state reads renamed to data.* (the state bag).
export function computeDerived(data) {
  // ---- derived: what the chips are actually doing to the book ----------------
  const steerOn = data.weekCuisines.length > 0 || data.weekDishTypes.length > 0;
  const matchesSteer = (r) =>
    (data.weekCuisines.length === 0 || data.weekCuisines.includes(r.cuisine)) &&
    (data.weekDishTypes.length === 0 || data.weekDishTypes.includes(r.dish_type));

  // The list under the chips. Search and chips both narrow; clearing the chips
  // is how you get all 55 back.
  const visibleRecipes = data.recipeList.filter(
    (r) => r.name.toLowerCase().includes(data.recipeSearch.trim().toLowerCase()) && matchesSteer(r)
  );

  // How many lunch/dinner dishes survive the steer. Zero means those slots come
  // back empty, and the user should be told BEFORE hitting generate rather than
  // finding out from the rationale afterwards.
  const servesLD = (r) => r.meal_types.includes('lunch') || r.meal_types.includes('dinner');
  const matchingLD = data.recipeList.filter((r) => servesLD(r) && matchesSteer(r)).length;

  // "Only plan these dishes" is a HARD restriction and it binds EVERY meal,
  // light ones included — pin five curries with breakfast ticked and you get
  // seven blank breakfasts. That is the engine working as specified, but it
  // looks exactly like a bug, so name the gap here rather than letting the
  // plan come back short and unexplained.
  const pinnedGaps = data.includeIds.length === 0 ? [] : PLANNABLE_MEALS.filter((m) => {
    if (!data.mealsToPlan.includes(m.key)) return false;
    const need = (m.key === 'snack_am' || m.key === 'snack_pm') ? 'snack' : m.key;
    return !data.includeIds.some((id) => {
      const r = data.recipeList.find((x) => x.id === id);
      if (!r) return false;
      const types = r.meal_types.length ? r.meal_types : ['lunch', 'dinner'];
      return types.includes(need);
    });
  });

  const recipeByIdMap = Object.fromEntries(data.recipeList.map((r) => [r.id, r]));
  const shortDayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

  // One-line provenance for a planned slot's meta line, same truths as the
  // dashboard grid (cooked tick, freezer/fridge pull, batch origin).
  function slotBadge(slot) {
    if (!slot) return '';
    if (slot.cooked_at) return ' · Cooked ✓';
    if (slot.fill_source === 'freezer_pull') return ' · from the freezer';
    if (slot.fill_source === 'fridge_pull') return ' · from the fridge';
    if (slot.fill_source === 'batch_freeze') return ' · batch';
    if ((slot.fill_source === 'batch_cook' || slot.fill_source === 'fresh_cook') && slot.cook_date) {
      return ` · from ${shortDayLabel(slot.cook_date)}`;
    }
    return '';
  }
  return {
    steerOn, matchesSteer, visibleRecipes, servesLD,
    matchingLD, pinnedGaps, recipeByIdMap, shortDayLabel,
    slotBadge,
  };
}
