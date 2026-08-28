// app/plan/page.js
'use client';
// app/plan/page.js

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { generatePlan } from '../../lib/generatePlan';
import { planComponents } from '../../lib/planComponents';
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

// Helpers copied verbatim from app/dashboard/page.js (local functions, not importable)

const cardStyle = {
  background: '#FFFFFF',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 20,
  padding: '24px 28px',
};
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
function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${on ? INK : HAIRLINE}`, background: on ? INK : '#fff',
        color: on ? CREAM : INK, borderRadius: 100, padding: '6px 13px',
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
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
  const [weekStart, setWeekStart] = useState(null);
  const [days, setDays] = useState([]);
  const [freezerLots, setFreezerLots] = useState([]);

  // Constraint state v2
  const [mealsToPlan, setMealsToPlan] = useState(['dinner']);
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

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
      const { data: recipeRows } = await supabase.from('recipes').select('id, name, protein_type, meal_type, meal_types, cuisine, dish_type, freezes, batch_portions, fresh_portions, fresh_shelf_days');

      if (cancelled) return;

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('allergens, disliked_recipe_ids')
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
      try {
        const { data: inputs } = await supabase.rpc('get_plan_inputs', { p_week_start: start });
        const saved = inputs?.constraints;
        if (!cancelled && saved && typeof saved === 'object') {
          if (Array.isArray(saved.meals_to_plan) && saved.meals_to_plan.length) setMealsToPlan(saved.meals_to_plan);
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

      setUserId(uid);
      setProfileAllergens(profileRow?.allergens || []);
      setDislikedIds(profileRow?.disliked_recipe_ids || []);
      setRecipeList(
        (recipeRows || [])
          .map((r) => ({
            id: r.id,
            name: r.name,
            cuisine: r.cuisine || null,
            dish_type: r.dish_type || null,
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
    setSaved(false);
  }

  function toggleWeekAllergen(code) {
    setWeekAllergens((cur) => (cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code]));
    setSaved(false);
  }

  function toggleCuisine(tag) {
    setWeekCuisines((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
    setSaved(false);
  }

  function toggleDishType(key) {
    setWeekDishTypes((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]));
    setSaved(false);
  }

  function toggleIncluded(id) {
    setIncludeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setSaved(false);
  }

  function toggleMeal(m) {
    setMealsToPlan((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
    setSaved(false);
  }

  function addGuest() {
    setGuests((current) => [...current, { date: days[0], meal: mealsToPlan[0] || 'dinner', count: 1 }]);
    setSaved(false);
  }

  function updateGuest(index, patch) {
    setGuests((current) => current.map((guest, i) => (i === index ? { ...guest, ...patch } : guest)));
    setSaved(false);
  }

  function removeGuest(index) {
    setGuests((current) => current.filter((_, i) => i !== index));
    setSaved(false);
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
    const { error: rpcError } = await supabase.rpc('save_plan_constraints', {
      p_week_start: weekStart,
      p_constraints: constraints,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSaved(true);
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
  
      // BRIDGE ITEM 3 — the client-side merge is RETIRED.
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
      setSaved(true);
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
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px' }}>
        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: MUTED, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        {loading ? (
          <div style={{ ...cardStyle, marginTop: 24, color: MUTED, fontSize: 14 }}>Loading your week…</div>
        ) : loggedOut ? (
          <div style={{ ...cardStyle, marginTop: 24 }}>
            <div style={eyebrowStyle}>Plan my week</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sign in to plan your week.</div>
          </div>
        ) : (
          <>
            <header style={{ marginTop: 24, marginBottom: 28 }}>
              <div style={{ ...eyebrowStyle, color: PINK }}>Plan my week</div>
              <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>
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

            <div style={{ display: 'grid', gap: 20 }}>
              
              {/* ── 1 · Plan which meals? (Scope) ─────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Plan which meals?</div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {PLANNABLE_MEALS.map((m) => (
                    <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                      <input type="checkbox" checked={mealsToPlan.includes(m.key)} onChange={() => toggleMeal(m.key)} style={{ accentColor: INK, width: 18, height: 18 }} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </section>

              {/* ── 2 · Freezer first ─────────────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Freezer first</div>
                {freezerLots.length === 0 ? (
                  <div style={{ fontSize: 14, color: MUTED }}>No freezer portions to use up this week.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                    {freezerLots.map((lot, index) => (
                      <div key={`${lot.recipe_id}-${index}`} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{lot.recipeName}</span>
                        <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>
                          {lot.quantity} portion{lot.quantity === 1 ? '' : 's'} · use by {dayLabel(lot.expiry_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Toggle on={freezerFirst} onChange={(value) => { setFreezerFirst(value); setSaved(false); }} label="Use these up first" />
              </section>

              {/* ── 3 · Your week ─────────────────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Your week</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {days.map((date) => {
                    return (
                      <div key={date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 110 }}>{dayLabel(date)}</span>
                        <span style={{ display: 'inline-flex', background: CREAM, border: `1px solid ${HAIRLINE}`, borderRadius: 100, padding: 3 }}>
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
                                  setSaved(false);
                                }}
                                style={{
                                  border: 'none',
                                  borderRadius: 100,
                                  padding: '7px 16px',
                                  fontSize: 13,
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
                            setSaved(false);
                          }}
                          style={{
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
                      onClick={() => { setBatchDays([]); setSaved(false); }}
                      style={{
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

              {/* ── 4 · This week's appetite ──────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>This week&rsquo;s appetite</div>
                <Toggle on={avoidMeat} onChange={(value) => { setAvoidMeat(value); setSaved(false); }} label="Off meat this week" />
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
                            border: `1px solid ${on ? INK : HAIRLINE}`, background: on ? INK : '#fff',
                            color: on ? CREAM : INK, borderRadius: 100, padding: '5px 12px',
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
                    {CUISINE_TAGS.map((tag) => (
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
                      onClick={() => { setWeekCuisines([]); setWeekDishTypes([]); setSaved(false); }}
                      style={{ marginTop: 10, border: 'none', background: 'none', color: MUTED, fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
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
                    a 55-row scroll into five. ── */}
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
                          style={{ border: 'none', background: GREEN, color: '#fff', borderRadius: 100, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {recipeList.find((r) => r.id === id)?.name || 'Recipe'} ×
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { setIncludeIds([]); setSaved(false); }}
                        style={{ border: `1px solid ${HAIRLINE}`, background: '#fff', color: MUTED, borderRadius: 100, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
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
                  <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${HAIRLINE}`, borderRadius: 12, background: '#fff' }}>
                    {visibleRecipes.length === 0 ? (
                      <div style={{ padding: '14px 12px', fontSize: 13, color: MUTED }}>
                        No dishes match. Clear a chip or the search box.
                      </div>
                    ) : visibleRecipes.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleIncluded(r.id)}
                        style={{
                          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
                          width: '100%', textAlign: 'left', border: 'none',
                          borderBottom: `1px solid ${HAIRLINE}`, background: includeIds.includes(r.id) ? '#F3F8F4' : 'transparent',
                          padding: '9px 12px', fontSize: 13, fontWeight: includeIds.includes(r.id) ? 700 : 500,
                          color: INK, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <span>{includeIds.includes(r.id) ? '✓ ' : '+ '}{r.name}</span>
                        <span style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {[r.cuisine, r.dish_type ? DISH_LABEL[r.dish_type] || r.dish_type : null]
                            .filter(Boolean).join(' · ') || 'untagged'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* ── 5 · Household Size ────────────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Household size</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.6, cursor: 'not-allowed' }}>
                  <select disabled style={{ ...inputStyle, background: '#fff', color: MUTED }}>
                    <option>1 person</option>
                    <option>2 people</option>
                    <option>3 people</option>
                    <option>4+ people</option>
                  </select>
                  <span style={{ fontSize: 11, fontWeight: 700, background: HAIRLINE, padding: '2px 6px', borderRadius: 4, color: MUTED }}>
                    COMING SOON
                  </span>
                </div>
              </section>

              {/* ── 6 · Guests ────────────────────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Guests</div>
                {guests.length === 0 && (
                  <div style={{ fontSize: 14, color: MUTED, marginBottom: 12 }}>No guest nights this week.</div>
                )}
                <div style={{ display: 'grid', gap: 10 }}>
                  {guests.map((guest, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <select
                        value={guest.date}
                        onChange={(event) => updateGuest(index, { date: event.target.value })}
                        style={{ ...inputStyle, background: '#fff' }}
                      >
                        {days.map((date) => (
                          <option key={date} value={date}>{dayLabel(date)}</option>
                        ))}
                      </select>
                      <select
                        value={guest.meal || mealsToPlan[0]}
                        onChange={(event) => updateGuest(index, { meal: event.target.value })}
                        style={{ ...inputStyle, background: '#fff', textTransform: 'capitalize' }}
                      >
                        {mealsToPlan.map((meal) => (
                          <option key={meal} value={meal}>{meal}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={guest.count}
                        onChange={(event) => updateGuest(index, { count: Number(event.target.value) })}
                        style={{ ...inputStyle, width: 80, background: '#fff' }}
                        aria-label="Number of guests"
                      />
                      <span style={{ fontSize: 13, color: MUTED }}>guest{guest.count === 1 ? '' : 's'}</span>
                      <button
                        type="button"
                        onClick={() => removeGuest(index)}
                        style={{ border: 'none', background: 'none', color: MUTED, fontSize: 13, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addGuest}
                  style={{
                    marginTop: 14,
                    border: `1px solid ${HAIRLINE}`,
                    background: '#fff',
                    color: INK,
                    borderRadius: 100,
                    padding: '9px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  + Add guest night
                </button>
              </section>

              {/* ── Generate & Save ──────────────────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {/* KIMI NOTE: one primary slot per brief — before a plan exists it generates;
                    once planResult is set the same slot saves, and regenerate stays secondary. */}
                {!planResult ? (
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => generateNow(seed)}
                    style={{
                      background: PINK,
                      color: INK,
                      border: 'none',
                      borderRadius: 100,
                      padding: '14px 32px',
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      opacity: generating ? 0.7 : 1,
                    }}
                  >
                    {generating ? 'Generating…' : 'Generate my plan'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={save}
                      style={{
                        background: PINK,
                        color: INK,
                        border: 'none',
                        borderRadius: 100,
                        padding: '14px 32px',
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {saving ? 'Saving…' : 'Save this week'}
                    </button>

                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => { const n = seed + 1; setSeed(n); generateNow(n); }}
                      style={{
                        background: 'transparent',
                        color: MUTED,
                        border: `1px solid ${MUTED}`,
                        borderRadius: 100,
                        padding: '9px 18px',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        opacity: generating ? 0.7 : 1,
                      }}
                    >
                      Regenerate (different plan)
                    </button>
                  </>
                )}

                {saved && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: GREEN }}>
                    Your week&rsquo;s set — plan generation is coming soon.
                  </span>
                )}
                {error && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#C0392B' }}>{error}</span>
                )}
              </div>

              {/* ── Generate Result Panel ──────────────────────────────────────────────── */}
              {planResult && (
                <div style={{ ...cardStyle, marginTop: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                    Planned — {planResult.slotsWritten} slots set for this week.
                  </div>
                  <Link href="/dashboard" style={{ display: 'inline-block', fontSize: 15, fontWeight: 600, color: INK, textDecoration: 'underline', marginBottom: 16 }}>
                    View plan on dashboard →
                  </Link>
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

            </div>
          </>
        )}
      </div>
    </main>
  );
}
