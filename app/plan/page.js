// app/plan/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { generatePlan } from '../../lib/generatePlan';
import { setMealWindows, swapMeal, markEatingOut, setPortions } from '../../lib/actions';
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

  // The week itself, read back from plan_slots so the strip can render it
  // (spec v2 §2). Costs and allergens are read once for the slot sheet's
  // swap chooser — the same filtering contract the dashboard chooser uses.
  const [slots, setSlots] = useState([]);
  const [costPenceById, setCostPenceById] = useState({});
  const [allergensByRecipe, setAllergensByRecipe] = useState({});
  // Slot sheet: { date, meal, mode } — mode 'menu' | 'swap' | 'eating'
  const [slotSheet, setSlotSheet] = useState(null);
  const [sheetSearch, setSheetSearch] = useState('');
  const [eatingForm, setEatingForm] = useState({ label: '', costPounds: '', kcal: '' });

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
      const { data: recipeRows } = await supabase.from('recipes').select('id, name, protein_type, meal_type, meal_types, cuisine, dish_type, freezes, batch_portions, fresh_portions, fresh_shelf_days, image_id, kcal');

      // Week strip reads (spec v2 §2): the saved plan for this window, the
      // per-portion costs, and allergen rows for the swap chooser. All
      // read-only; the strip never writes outside the actions layer.
      const [{ data: costRows }, { data: allergenRows }, { data: slotRows }] = await Promise.all([
        supabase.from('recipe_costs').select('recipe_id, cost_gbp'),
        supabase.from('recipe_allergens').select('recipe_id, contains'),
        supabase.from('plan_slots').select('*').eq('user_id', uid).gte('slot_date', start).lte('slot_date', weekDays[6]),
      ]);

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
            kcal: r.kcal ?? null,
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
      setCostPenceById(Object.fromEntries((costRows || []).map((row) => [row.recipe_id, Math.round(Number(row.cost_gbp) * 100)])));
      setAllergensByRecipe(Object.fromEntries((allergenRows || []).map((row) => [row.recipe_id, row.contains || []])));
      setSlots(slotRows || []);
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
    setSlots([]);
    setDirty(true);
    refreshSlots(iso);
  }

  // Re-read plan_slots for the window anchored on startIso (defaults to the
  // current weekStart). Called after any slot write and after moving the
  // lock date — the strip always renders the database, never local hope.
  async function refreshSlots(startIso) {
    const anchor = startIso || weekStart;
    if (!anchor) return;
    const supabase = getBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from('plan_slots')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('slot_date', anchor)
      .lte('slot_date', addDays(anchor, 6));
    setSlots(data || []);
  }

  function slotFor(date, meal) {
    return slots.find((s) => s.slot_date === date && s.meal === meal) || null;
  }

  function openSlotSheet(date, meal, mode) {
    setSheetSearch('');
    setSlotSheet({ date, meal, mode: mode || 'menu' });
  }

  function toggleOutSlot(date, meal) {
    const isOut = outs.some((o) => o.date === date && o.meal === meal);
    setOuts((cur) => (isOut ? cur.filter((o) => !(o.date === date && o.meal === meal)) : [...cur, { date, meal }]));
    setDirty(true);
  }

  // KIMI NOTE (spec v2 §4 ruling): the eating-out FORM is only offered for a
  // slot that already exists in plan_slots (post-generation, or a constraint
  // that generate already turned into a slot). Pre-generation it is NOT
  // offered: apply_generated_plan deletes every uncooked slot in the window
  // and rewrites from the engine, so a labelled eating-out row would be
  // silently wiped by the next generate. Pre-generation the sheet offers
  // "Mark out" (a constraint the engine honours), and the label/cost detail
  // can be added from the strip afterwards.
  function openEatingForm(date, meal) {
    const slot = slotFor(date, meal);
    setEatingForm({
      label: slot?.eating_out_label && slot.eating_out_label !== 'Eating out' ? slot.eating_out_label : '',
      costPounds: slot?.est_cost_pence != null ? (Number(slot.est_cost_pence) / 100).toString() : '',
      kcal: slot?.est_kcal != null ? String(slot.est_kcal) : '',
    });
    setSlotSheet({ date, meal, mode: 'eating' });
  }

  async function sheetSwap(recipeId) {
    if (!slotSheet) return;
    const name = recipeByIdMap[recipeId]?.name || 'this dish';
    if (!window.confirm(`Plan ${name} for ${dayLabel(slotSheet.date)} ${slotSheet.meal}?`)) return;
    const { error: swapErr } = await swapMeal({ slotDate: slotSheet.date, meal: slotSheet.meal, recipeId });
    if (swapErr) {
      setError(swapErr.message);
      return;
    }
    setSlotSheet(null);
    await refreshSlots();
  }

  async function sheetEatingOut() {
    if (!slotSheet) return;
    const cost = eatingForm.costPounds.trim() === '' ? null : Math.round(Number(eatingForm.costPounds) * 100);
    const kcal = eatingForm.kcal.trim() === '' ? null : Number(eatingForm.kcal);
    if (eatingForm.label.trim() === '' && cost == null && kcal == null) {
      setError('Add a label, a cost or a kcal figure.');
      return;
    }
    const { error: eoErr } = await markEatingOut({
      slotDate: slotSheet.date,
      meal: slotSheet.meal,
      label: eatingForm.label.trim() || 'Eating out',
      estCostPence: cost,
      estKcal: kcal,
    });
    if (eoErr) {
      setError(eoErr.message);
      return;
    }
    setSlotSheet(null);
    await refreshSlots();
  }

  async function sheetPortions(delta) {
    if (!slotSheet) return;
    const slot = slotFor(slotSheet.date, slotSheet.meal);
    if (!slot) return;
    const next = Math.max(1, Number(slot.portions ?? 1) + delta);
    const { error: pErr } = await setPortions({ slotDate: slotSheet.date, meal: slotSheet.meal, portions: next });
    if (pErr) {
      setError(pErr.message);
      return;
    }
    await refreshSlots();
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
    setMealsToPlan((cur) => (c