'use client';
// app/dashboard/page.js

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import {
  swapMeal,
  markEatingOut,
  setPortions,
  addPantryItems,
  consumePantryItem,
  movePantryStock,
  eatPortions,
  binStock,
  logSpend,
  logOffPlanIntake,
  logWeight,
  cookMeal,
} from '../../lib/actions';

const MEALS = ['breakfast', 'lunch', 'dinner'];
const LOCATIONS = ['fridge', 'freezer', 'cupboard'];
const SPEND_CATEGORIES = ['grocery', 'eating_out', 'sundry'];
// The 14 UK major allergens.
// These codes are written to profiles.allergens and matched, verbatim, against
// recipe_allergens.contains — so they MUST equal the data's canonical codes.
// tree_nuts / soybeans are the canonical forms (were shipped as nuts / soy,
// which matched nothing and silently filtered nothing).
const ALLERGENS = ['celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'tree_nuts', 'peanuts', 'sesame', 'soybeans', 'sulphites'];

// Readable labels for display only — never written to the DB, never matched.
const ALLERGEN_LABELS = {
  celery: 'Celery',
  gluten: 'Gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  lupin: 'Lupin',
  milk: 'Milk',
  molluscs: 'Molluscs',
  mustard: 'Mustard',
  tree_nuts: 'Tree nuts',
  peanuts: 'Peanuts',
  sesame: 'Sesame',
  soybeans: 'Soya',
  sulphites: 'Sulphites',
};

// Editorial design tokens
const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';
const BLUE = '#8FBBD6';

// Pastel washes: meal slots and pantry appliances, from the design file.
const MEAL_WASHES = {
  breakfast: 'linear-gradient(155deg,#F1E7D5,#F7F0E2)',
  lunch: 'linear-gradient(155deg,#C8E6C9,#E8F5E9)',
  dinner: 'linear-gradient(155deg,#BCD7E9,#DCEBF3)',
};
const LOCATION_STYLES = {
  fridge: { wash: 'linear-gradient(160deg,#BCD7E9,#E3EEF6)', textColor: '#1E3A52' },
  freezer: { wash: 'linear-gradient(160deg,#DCEBF3,#F6FAFC)', textColor: '#1E3A52' },
  cupboard: { wash: 'linear-gradient(160deg,#F1E7D5,#F7F0E2)', textColor: '#5B4530' },
};

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function dayLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayLabelShort(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

function money(pence) {
  if (pence == null) return '—';
  return `£${(Number(pence) / 100).toFixed(2)}`;
}

function poundsToPence(value) {
  if (value === '' || value == null) return null;
  const pounds = Number(value);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

function optionalNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWeight(weightKg, units) {
  if (weightKg == null) return '—';
  if (units === 'imperial') {
    const totalLb = Number(weightKg) * 2.2046226218;
    let stone = Math.floor(totalLb / 14);
    let pounds = Math.round(totalLb - stone * 14);
    // Rounding can push pounds to 14 (e.g. 76.20 kg = 167.99 lb) —
    // roll over into the stone so we never print "N st 14 lb".
    if (pounds === 14) { stone += 1; pounds = 0; }
    return `${stone} st ${pounds} lb`;
  }
  return `${Number(weightKg).toFixed(1)} kg`;
}

function slotKey(slotDate, meal) {
  return `${slotDate}|${meal}`;
}

// Linear regression over a weight series (index-based), used for the
// predicted trend line and the goal ETA on the progress chart.
function linreg(ys) {
  const n = ys.length;
  const sx = ys.reduce((s, _, i) => s + i, 0);
  const sy = ys.reduce((s, y) => s + y, 0);
  const sxy = ys.reduce((s, y, i) => s + i * y, 0);
  const sxx = ys.reduce((s, _, i) => s + i * i, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope };
}

const CHART_W = 320;
const CHART_H = 130;
const CHART_PAD = 4;
const PREDICT_WEEKS = 8;

function buildChart(history, goalKg) {
  const n = history.length;
  const totalWeeks = n - 1 + PREDICT_WEEKS;
  const { slope } = linreg(history.slice(Math.max(0, n - 6)));
  const intAtFull = history[n - 1] - slope * (n - 1);

  const predicted = [];
  for (let i = n - 1; i <= totalWeeks; i += 1) predicted.push(intAtFull + slope * i);

  const allVals = goalKg != null ? history.concat(predicted, [goalKg]) : history.concat(predicted);
  const yMin = Math.min(...allVals) - 0.6;
  const yMax = Math.max(...allVals) + 0.6;
  const xStep = (CHART_W - CHART_PAD * 2) / totalWeeks;
  const yFor = (kg) => CHART_PAD + (CHART_H - CHART_PAD * 2) * (1 - (kg - yMin) / (yMax - yMin));

  const actualPts = history.map((kg, i) => [CHART_PAD + i * xStep, yFor(kg)]);
  const predictedPts = predicted.map((kg, i) => [CHART_PAD + (n - 1 + i) * xStep, yFor(kg)]);
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  // ETA: weeks until the predicted line crosses the goal, in whichever
  // direction the goal sits (loss or gain).
  let etaLabel = null;
  if (goalKg != null && Math.abs(slope) > 0.02) {
    const movingToward = (goalKg < history[n - 1] && slope < 0) || (goalKg > history[n - 1] && slope > 0);
    if (movingToward) {
      const weeksToGoal = (goalKg - intAtFull) / slope - (n - 1);
      if (weeksToGoal > 0) {
        etaLabel = weeksToGoal <= PREDICT_WEEKS
          ? `On track: ~${Math.round(weeksToGoal)}w to goal`
          : `~${Math.round(weeksToGoal)}w to goal at this pace`;
      }
    }
  }

  const last = actualPts[actualPts.length - 1];
  return {
    actualPath: toPath(actualPts),
    predictedPath: toPath(predictedPts),
    lastX: last[0],
    lastY: last[1],
    goalY: goalKg != null ? yFor(goalKg) : null,
    goalTextY: goalKg != null ? yFor(goalKg) - 5 : null,
    etaLabel,
  };
}

// Shared Editorial input styles
const inputStyle = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: '#fff',
  color: INK,
  boxSizing: 'border-box',
};

const darkPillButton = {
  background: INK,
  color: CREAM,
  border: 'none',
  borderRadius: 100,
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const outlinePillButton = {
  background: 'transparent',
  color: INK,
  border: `1.5px solid ${HAIRLINE}`,
  borderRadius: 100,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// Tiny underlined action link used inside meal chips and pantry rows.
function ChipAction({ onClick, disabled, children, colour = MUTED }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : (event) => { if (event.key === 'Enter') onClick(); }}
      style={{ fontSize: 9, fontWeight: 700, textDecoration: 'underline', color: disabled ? '#B9B6C2' : colour, cursor: disabled ? 'default' : 'pointer' }}
    >
      {children}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState(null);
  const [currentWeight, setCurrentWeight] = useState(null);
  const [weightRows, setWeightRows] = useState([]);

  const [planSlots, setPlanSlots] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [costByRecipe, setCostByRecipe] = useState({});
  const [allergensByRecipe, setAllergensByRecipe] = useState({});

  const [pantryStock, setPantryStock] = useState([]);
  const [pantryLots, setPantryLots] = useState([]);
  const [spendRows, setSpendRows] = useState([]);
  const [intakeRows, setIntakeRows] = useState([]);
  const [weekIntakeRows, setWeekIntakeRows] = useState([]);
  const [wasteRows, setWasteRows] = useState([]);

  const [weightInput, setWeightInput] = useState('');
  const [weightStones, setWeightStones] = useState('');
  const [weightPounds, setWeightPounds] = useState('');
  const [chooser, setChooser] = useState(null);
  const [eatingForm, setEatingForm] = useState(null);
  const [pantryForm, setPantryForm] = useState({
    itemKind: 'ingredient',
    ingredientId: '',
    recipeId: '',
    label: '',
    quantity: '',
    unit: '',
    location: 'fridge',
    costPounds: '',
    expiryDate: '',
    boughtDate: '',
  });
  const [intakeForm, setIntakeForm] = useState({ description: '', kcal: '', proteinG: '', carbsG: '', fatG: '', costPounds: '', pantryIngredientId: '', pantryQuantity: '' });
  const [spendForm, setSpendForm] = useState({ amountPounds: '', category: 'grocery' });

  const chooserRef = useRef(null);
  const eatingFormRef = useRef(null);

  const today = isoDate(new Date());
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);
  const weekEnd = weekDays[6];

  const monday = new Date(`${today}T00:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = isoDate(monday);

  const recipeById = useMemo(() => Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const ingredientById = useMemo(() => Object.fromEntries(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
  const slotByKey = useMemo(() => Object.fromEntries(planSlots.map((slot) => [slotKey(slot.slot_date, slot.meal), slot])), [planSlots]);
  const ingredientsByRecipe = useMemo(() => {
    const map = {};
    recipeIngredients.forEach((row) => {
      if (!map[row.recipe_id]) map[row.recipe_id] = new Set();
      map[row.recipe_id].add(row.ingredient_id);
    });
    return map;
  }, [recipeIngredients]);
  const householdPortions = profile?.household_portions ?? 1;

  async function loadAll(liveSession) {
    if (!liveSession) return;
    const supabase = getBrowserClient();
    const uid = liveSession.user.id;

    const { data: prof, error: profError } = await supabase
      .from('profiles')
      .select('display_name, start_weight_kg, goal_weight_kg, target_kcal, target_protein_g, target_carbs_g, target_fat_g, diet, preferred_units, household_portions, disliked_recipe_ids, disliked_ingredient_ids, allergens, dislikes')
      .eq('id', uid)
      .maybeSingle();
    if (profError) throw profError;

    const { data: current, error: currentError } = await supabase
      .from('weight_current')
      .select('weight_kg')
      .eq('user_id', uid)
      .maybeSingle();
    if (currentError) throw currentError;

    const { data: weights, error: weightsError } = await supabase
      .from('weight_log')
      .select('weight_kg, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (weightsError) throw weightsError;

    const { data: slots, error: slotsError } = await supabase
      .from('plan_slots')
      .select('*')
      .eq('user_id', uid)
      .gte('slot_date', weekStart)
      .lte('slot_date', weekEnd)
      .order('slot_date', { ascending: true });
    if (slotsError) throw slotsError;

    const { data: recipeRows, error: recipesError } = await supabase
      .from('recipes')
      .select('id, name, section, kcal, protein_g, carbs_g, fat_g, fibre_g, portions, image_id')
      .order('name');
    if (recipesError) throw recipesError;

    const { data: ingredientRows, error: ingredientsError } = await supabase
      .from('ingredients')
      .select('id, name, unit, category, storage_location')
      .order('name');
    if (ingredientsError) throw ingredientsError;

    const { data: costRows, error: costsError } = await supabase
      .from('recipe_costs')
      .select('recipe_id, cost_gbp');
    if (costsError) throw costsError;

    const { data: allergenRows, error: allergensError } = await supabase
      .from('recipe_allergens')
      .select('recipe_id, contains');
    if (allergensError) throw allergensError;

    const { data: recipeIngRows, error: recipeIngError } = await supabase
      .from('recipe_ingredients')
      .select('recipe_id, ingredient_id');
    if (recipeIngError) throw recipeIngError;

    const { data: stockRows, error: stockError } = await supabase
      .from('pantry_stock')
      .select('user_id, item_kind, ingredient_id, recipe_id, location, quantity')
      .eq('user_id', uid);
    if (stockError) throw stockError;

    const { data: lotRows, error: lotsError } = await supabase
      .from('pantry_lots')
      .select('id, user_id, item_kind, ingredient_id, recipe_id, label, quantity, unit, location, cost_pence, expiry_date, note, created_at')
      .eq('user_id', uid);
    if (lotsError) throw lotsError;

    const { data: spends, error: spendError } = await supabase
      .from('spend_log')
      .select('amount_pence, spend_date, category')
      .eq('user_id', uid)
      .gte('spend_date', weekStart);
    if (spendError) throw spendError;

    const { data: intake, error: intakeError } = await supabase
      .from('intake_log')
      .select('id, intake_date, description, kcal, protein_g, carbs_g, fat_g, confidence, source, cost_pence')
      .eq('user_id', uid)
      .order('intake_date', { ascending: false })
      .limit(8);
    if (intakeError) throw intakeError;

    // Whole-week intake, for the "cost of eating" total.
    const { data: weekIntake, error: weekIntakeError } = await supabase
      .from('intake_log')
      .select('cost_pence, source, intake_date')
      .eq('user_id', uid)
      .gte('intake_date', weekStart);
    if (weekIntakeError) throw weekIntakeError;

    // Whole-week waste, for the "cost of binning" total and the Log bin list.
    const { data: waste, error: wasteError } = await supabase
      .from('waste_log')
      .select('id, wasted_date, item_kind, ingredient_id, recipe_id, label, quantity, unit, cost_pence')
      .eq('user_id', uid)
      .gte('wasted_date', weekStart)
      .order('wasted_date', { ascending: false });
    if (wasteError) throw wasteError;

    setProfile(prof);
    setCurrentWeight(current?.weight_kg ?? null);
    setWeightRows(weights || []);
    setPlanSlots(slots || []);
    setRecipes(recipeRows || []);
    setIngredients(ingredientRows || []);
    setCostByRecipe(Object.fromEntries((costRows || []).map((row) => [row.recipe_id, row.cost_gbp])));
    setAllergensByRecipe(Object.fromEntries((allergenRows || []).map((row) => [row.recipe_id, row.contains || []])));
    setRecipeIngredients(recipeIngRows || []);
    setPantryStock(stockRows || []);
    setPantryLots(lotRows || []);
    setSpendRows(spends || []);
    setIntakeRows(intake || []);
    setWeekIntakeRows(weekIntake || []);
    setWasteRows(waste || []);
  }
  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const supabase = getBrowserClient();
        const { data: { session: found } } = await supabase.auth.getSession();
        if (!alive) return;
        if (!found) {
          router.replace('/login');
          return;
        }
        setSession(found);
        await loadAll(found);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setChecking(false);
      }
    }

    boot();
    return () => {
      alive = false;
    };
  }, [router, today, weekEnd]);

  useEffect(() => {
    if (chooser && chooserRef.current) {
      chooserRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [chooser]);

  useEffect(() => {
    if (eatingForm && eatingFormRef.current) {
      eatingFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [eatingForm]);

  // If the chooser is open when allergens/dislikes change, rebuild its options
  // with the new filters so the list is never stale.
  useEffect(() => {
    if (chooser) openChooser(chooser.slotDate, chooser.meal, chooser.currentRecipeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function refreshAfterAction() {
    try {
      const { data: { session: live } } = await getBrowserClient().auth.getSession();
      if (live) await loadAll(live);
    } catch (err) {
      console.error('refreshAfterAction failed:', err);
      setError('Could not refresh after the last action — reload if the screen looks stale.');
    }
  }

  async function runAction(message, action) {
    if (!window.confirm(message)) return;
    setBusy(true);
    setError('');
    const { error: actionError } = await action();
    if (actionError) setError(actionError.message);
    await refreshAfterAction();
    setBusy(false);
  }

  async function saveProfile(patch) {
    if (!session) return;
    setBusy(true);
    setError('');
    const supabase = getBrowserClient();
    const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
    if (updateError) setError(updateError.message);
    await refreshAfterAction();
    setBusy(false);
  }

  function toggleAllergen(allergen) {
    const current = new Set(profile?.allergens || []);
    if (current.has(allergen)) current.delete(allergen);
    else current.add(allergen);
    saveProfile({ allergens: [...current] });
  }

  function addDislikedIngredient(ingredientId) {
    if (!ingredientId) return;
    const current = new Set(profile?.disliked_ingredient_ids || []);
    current.add(ingredientId);
    saveProfile({ disliked_ingredient_ids: [...current] });
  }

  function removeDislikedIngredient(ingredientId) {
    const current = new Set(profile?.disliked_ingredient_ids || []);
    current.delete(ingredientId);
    saveProfile({ disliked_ingredient_ids: [...current] });
  }

  function openChooser(slotDate, meal, currentRecipeId) {
    const disliked = new Set(profile?.disliked_recipe_ids || []);
    const dislikedIngredients = new Set(profile?.disliked_ingredient_ids || []);
    const userAllergens = new Set(profile?.allergens || []);

    const afterCurrent = recipes.filter((recipe) => recipe.id !== currentRecipeId);
    const noDislike = afterCurrent.filter((recipe) => !disliked.has(recipe.id));
    const safe = noDislike
      .filter((recipe) => !(allergensByRecipe[recipe.id] || []).some((allergen) => userAllergens.has(allergen)));
    const noIngDislike = safe.filter((recipe) => {
      const ingSet = ingredientsByRecipe[recipe.id];
      if (!ingSet) return true;
      for (const id of dislikedIngredients) {
        if (ingSet.has(id)) return false;
      }
      return true;
    });

    // Both planning and swapping show every safe recipe, A–Z.
    const options = [...noIngDislike].sort((a, b) => a.name.localeCompare(b.name));

    setChooser({
      slotDate, meal, currentRecipeId, options,
      total: recipes.length,
      hiddenDisliked: afterCurrent.length - noDislike.length,
      hiddenAllergens: noDislike.length - safe.length,
      hiddenIngDislikes: safe.length - noIngDislike.length,
    });
  }

  async function chooseSwap(option, neverAgain) {
    if (!chooser) return;
    const label = dayLabel(chooser.slotDate);
    await runAction(
      `Swap ${label} ${chooser.meal} to ${option.name}${neverAgain ? ' and never show the old recipe again' : ''}?`,
      () => swapMeal({ slotDate: chooser.slotDate, meal: chooser.meal, recipeId: option.id, neverAgain })
    );
    setChooser(null);
  }

  async function submitEatingOut() {
    if (!eatingForm?.label.trim()) {
      setError('Eating out needs a label.');
      return;
    }
    const label = dayLabel(eatingForm.slotDate);
    await runAction(`Mark ${label} ${eatingForm.meal} as eating out?`, () => markEatingOut({
      slotDate: eatingForm.slotDate,
      meal: eatingForm.meal,
      label: eatingForm.label.trim(),
      estCostPence: poundsToPence(eatingForm.costPounds),
      estKcal: optionalNumber(eatingForm.kcal),
      estProteinG: optionalNumber(eatingForm.proteinG),
      estCarbsG: optionalNumber(eatingForm.carbsG),
      estFatG: optionalNumber(eatingForm.fatG),
    }));
    setEatingForm(null);
  }

  async function editPortions(slot) {
    const proposed = window.prompt('Portions for this slot', String(slot.portions ?? householdPortions));
    if (proposed == null) return;
    const portions = Number(proposed);
    if (!Number.isFinite(portions) || portions <= 0) {
      setError('Portions must be a positive number.');
      return;
    }
    await runAction(`Set ${dayLabel(slot.slot_date)} ${slot.meal} to ${portions} portion(s)?`, () => setPortions({
      slotDate: slot.slot_date,
      meal: slot.meal,
      portions,
    }));
  }

  async function submitPantryAdd() {
    const quantity = Number(pantryForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Pantry quantity must be positive.');
      return;
    }
    if (pantryForm.itemKind === 'ingredient' && !pantryForm.ingredientId) {
      setError('Choose an ingredient, or use a label.');
      return;
    }
    if (pantryForm.itemKind === 'cooked_portion' && !pantryForm.recipeId) {
      setError('Choose a recipe, or use a label.');
      return;
    }

    await runAction('Add this pantry stock?', () => addPantryItems([{
      itemKind: pantryForm.itemKind,
      ingredientId: pantryForm.ingredientId || null,
      recipeId: pantryForm.recipeId || null,
      label: pantryForm.label.trim() || null,
      quantity,
      unit: pantryForm.unit.trim() || null,
      location: pantryForm.location,
      costPence: poundsToPence(pantryForm.costPounds),
      expiryDate: pantryForm.expiryDate || null,
      boughtDate: pantryForm.boughtDate || null,
    }]));

    setPantryForm({ itemKind: 'ingredient', ingredientId: '', recipeId: '', label: '', quantity: '', unit: '', location: 'fridge', costPounds: '', expiryDate: '', boughtDate: '' });
  }

  // Binning stock: draws it down and logs the waste cost.
  async function binStockRow(row) {
    const proposed = window.prompt(`Bin how much of ${stockName(row)}?`, String(row.quantity));
    if (proposed == null) return;
    const quantity = Number(proposed);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Bin quantity must be positive.');
      return;
    }
    await runAction(`Bin ${quantity} of ${stockName(row)}? This logs the waste cost.`, () => binStock({
      itemKind: row.item_kind,
      quantity,
      location: row.location,
      ingredientId: row.ingredient_id,
      recipeId: row.recipe_id,
    }));
  }

  // Fridge <-> freezer. The destination lot gets a fresh rule-derived expiry
  // (cooked portions: 3 days fridge, 30 days freezer).
  async function moveStock(row) {
    const to = row.location === 'fridge' ? 'freezer' : 'fridge';
    const proposed = window.prompt(`Move how much of ${stockName(row)} to the ${to}?`, String(row.quantity));
    if (proposed == null) return;
    const quantity = Number(proposed);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Move quantity must be positive.');
      return;
    }
    await runAction(`Move ${quantity} of ${stockName(row)} to the ${to}?`, () => movePantryStock({
      itemKind: row.item_kind,
      quantity,
      fromLocation: row.location,
      toLocation: to,
      ingredientId: row.ingredient_id,
      recipeId: row.recipe_id,
    }));
  }

  // Eating a planned (cooked) slot — the cost of eating lands here.
  async function eatSlot(slot) {
    const recipe = recipeById[slot.recipe_id];
    const proposed = window.prompt(`Eat how many portions of ${recipe?.name ?? 'this meal'}?`, '1');
    if (proposed == null) return;
    const portions = Number(proposed);
    if (!Number.isFinite(portions) || portions <= 0) {
      setError('Portions must be a positive number.');
      return;
    }
    await runAction(`Log ${portions} portion(s) of ${recipe?.name ?? 'this meal'} as eaten?`, async () => {
      const result = await eatPortions({ recipeId: slot.recipe_id, portions });
      if (!result.error && Number(result.data?.not_in_stock) > 0) {
        setError(`Logged — but only ${result.data.from_stock} portion(s) were in stock, so ${result.data.not_in_stock} came straight off the hob.`);
      }
      return result;
    });
  }

  // Eating from a cooked-portion stock row (e.g. leftovers later in the week).
  async function eatStock(row) {
    const proposed = window.prompt(`Eat how many portions of ${stockName(row)}?`, '1');
    if (proposed == null) return;
    const portions = Number(proposed);
    if (!Number.isFinite(portions) || portions <= 0) {
      setError('Portions must be a positive number.');
      return;
    }
    await runAction(`Log ${portions} portion(s) of ${stockName(row)} as eaten?`, async () => {
      const result = await eatPortions({ recipeId: row.recipe_id, portions });
      if (!result.error && Number(result.data?.not_in_stock) > 0) {
        setError(`Logged — but only ${result.data.from_stock} portion(s) were in stock.`);
      }
      return result;
    });
  }

  async function cookSlot(slot) {
    await runAction(
      `Mark ${dayLabel(slot.slot_date)} ${slot.meal} as cooked? This takes the ingredients from your pantry and banks the portions in the fridge.`,
      async () => {
        const result = await cookMeal({ slotDate: slot.slot_date, meal: slot.meal });
        if (!result.error && result.data?.shortfalls?.length) {
          const list = result.data.shortfalls
            .map((s) => `${s.name ?? 'An ingredient'}: ${s.short}${s.unit ? ` ${s.unit}` : ''} short`)
            .join('; ');
          setError(`Cooked, but the pantry was short — ${list}.`);
        }
        return result;
      }
    );
  }

  async function submitIntake() {
    if (!intakeForm.description.trim()) {
      setError('Off-plan intake needs a description.');
      return;
    }
    await runAction('Log this off-plan intake?', () => logOffPlanIntake({
      description: intakeForm.description.trim(),
      kcal: optionalNumber(intakeForm.kcal),
      proteinG: optionalNumber(intakeForm.proteinG),
      carbsG: optionalNumber(intakeForm.carbsG),
      fatG: optionalNumber(intakeForm.fatG),
      costPence: poundsToPence(intakeForm.costPounds),
    }));

    // Optional: the dish used something from the pantry (e.g. your own pesto pasta)
    const drainQty = Number(intakeForm.pantryQuantity);
    if (intakeForm.pantryIngredientId && Number.isFinite(drainQty) && drainQty > 0) {
      const ing = ingredientById[intakeForm.pantryIngredientId];
      const location = ing?.storage_location || (ing?.category === 'cupboard' ? 'cupboard' : 'fridge');
      await runAction(`Also take ${drainQty} ${ing?.unit || ''} of ${ing?.name} from the pantry?`, () => consumePantryItem({
        itemKind: 'ingredient',
        quantity: drainQty,
        location,
        ingredientId: intakeForm.pantryIngredientId,
      }));
    }

    setIntakeForm({ description: '', kcal: '', proteinG: '', carbsG: '', fatG: '', costPounds: '', pantryIngredientId: '', pantryQuantity: '' });
  }

  async function submitSpend() {
    const amountPence = poundsToPence(spendForm.amountPounds);
    if (amountPence == null) {
      setError('Spend needs a non-negative amount.');
      return;
    }
    await runAction(`Log ${money(amountPence)} spend?`, () => logSpend({ amountPence, category: spendForm.category }));
    setSpendForm({ amountPounds: '', category: 'grocery' });
  }

  async function submitWeight() {
    let weightKg;
    if (profile?.preferred_units === 'imperial') {
      const stones = Number(weightStones || 0);
      const pounds = Number(weightPounds || 0);
      if (!Number.isFinite(stones) || !Number.isFinite(pounds) || stones < 0 || pounds < 0 || pounds >= 14 || (stones === 0 && pounds === 0)) {
        setError('Enter stones and pounds (pounds under 14).');
        return;
      }
      weightKg = Math.round((stones * 14 + pounds) * 0.45359237 * 100) / 100;
    } else {
      weightKg = Number(weightInput);
      if (!Number.isFinite(weightKg) || weightKg <= 0) {
        setError('Weight must be a positive number.');
        return;
      }
    }
    await runAction(`Log ${formatWeight(weightKg, profile?.preferred_units)}?`, () => logWeight({ weightKg }));
    setWeightInput('');
    setWeightStones('');
    setWeightPounds('');
  }

  function stockName(row) {
    return ingredientById[row.ingredient_id]?.name || recipeById[row.recipe_id]?.name || row.label || 'Pantry item';
  }

  function stockQuantity(row) {
    return row.item_kind === 'cooked_portion'
      ? `${row.quantity} portion${Number(row.quantity) === 1 ? '' : 's'}`
      : `${row.quantity}`;
  }

  function expiryBadge(row) {
    const matchingLots = pantryLots
      .filter((lot) => lot.location === row.location)
      .filter((lot) => (lot.ingredient_id && lot.ingredient_id === row.ingredient_id) || (lot.recipe_id && lot.recipe_id === row.recipe_id) || (!lot.ingredient_id && !lot.recipe_id))
      .filter((lot) => lot.expiry_date)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    const soonest = matchingLots[0]?.expiry_date;
    if (!soonest) return null;

    const warnBy = row.location === 'fridge' ? addDays(today, 2) : today;
    if (soonest < today) return { text: 'expired', wash: '#FFAB91' };
    if (soonest <= warnBy) return { text: 'use soon', wash: '#E9C067' };
    return null;
  }

  if (checking || !session) return null;

  const weekSpendPence = spendRows.reduce((sum, row) => sum + (row.amount_pence || 0), 0);
  // KIMI NOTE: category split is display-only (Slice 1 — Sundries). weekSpendPence
  // stays the full logged total; groceries/sundries are subsets of it, so
  // weekTotalPence below is computed exactly as before.
  const grocerySpendPence = spendRows
    .filter((row) => row.category === 'grocery')
    .reduce((sum, row) => sum + (row.amount_pence || 0), 0);
  const sundrySpendPence = spendRows
    .filter((row) => row.category === 'sundry')
    .reduce((sum, row) => sum + (row.amount_pence || 0), 0);
  const eatingOutPence = planSlots
    .filter((slot) => slot.eating_out)
    .reduce((sum, slot) => sum + (slot.est_cost_pence || 0), 0);
  const offPlanPence = weekIntakeRows
    .filter((row) => row.source !== 'planned')
    .reduce((sum, row) => sum + (row.cost_pence || 0), 0);
  const weekTotalPence = weekSpendPence + eatingOutPence + offPlanPence;
  // The cost of eating: what you actually consumed from planned meals.
  const eatenPence = weekIntakeRows
    .filter((row) => row.source === 'planned')
    .reduce((sum, row) => sum + (row.cost_pence || 0), 0);
  // The cost of binning: food you paid for but threw away.
  const binnedPence = wasteRows.reduce((sum, row) => sum + (row.cost_pence || 0), 0);

  const weightHistory = weightRows.map((row) => Number(row.weight_kg));
  const goalKg = profile?.goal_weight_kg != null ? Number(profile.goal_weight_kg) : null;
  const chart = weightHistory.length >= 2 ? buildChart(weightHistory, goalKg) : null;

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 80px', display: 'flex', flexDirection: 'column', gap: 36, color: INK }}>
      <style>{`
        @media (max-width: 900px) {
          .dash-progress { grid-template-columns: 1fr !important; }
          .dash-progress-col { border-left: none !important; padding-left: 0 !important; border-top: 1px solid ${HAIRLINE}; padding-top: 24px; }
          .dash-week { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-pantry { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 901px) and (max-width: 1150px) {
          .dash-week { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>

      {error ? (
        <p role="alert" style={{ margin: 0, background: '#FDECEA', border: '1px solid #F5C6C0', color: '#b00020', borderRadius: 12, padding: '12px 16px', fontSize: 14 }}>
          {error}
        </p>
      ) : null}

      {/* ── Progress banner ─────────────────────────────────────────── */}
      <section
        className="dash-progress"
        style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 24, padding: 32, display: 'grid', gridTemplateColumns: '.95fr 1.35fr .8fr', gap: 28 }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: BLUE, marginBottom: 10 }}>Your progress</div>
          <h1 style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-.03em', margin: 0 }}>
            Hi, {profile?.display_name || 'there'}
          </h1>
          {profile ? (
            <>
              <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
                <div>
                  <b style={{ display: 'block', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>{formatWeight(profile.start_weight_kg, profile.preferred_units)}</b>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTED, fontWeight: 600 }}>Start</span>
                </div>
                <div>
                  <b style={{ display: 'block', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: PINK }}>{formatWeight(currentWeight, profile.preferred_units)}</b>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTED, fontWeight: 600 }}>Now</span>
                </div>
                <div>
                  <b style={{ display: 'block', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>{formatWeight(profile.goal_weight_kg, profile.preferred_units)}</b>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTED, fontWeight: 600 }}>Goal</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap', alignItems: 'center' }}>
                {profile.preferred_units === 'imperial' ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      placeholder="st"
                      value={weightStones}
                      onChange={(event) => setWeightStones(event.target.value)}
                      style={{ ...inputStyle, width: 64 }}
                    />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="13.9"
                      placeholder="lb"
                      value={weightPounds}
                      onChange={(event) => setWeightPounds(event.target.value)}
                      style={{ ...inputStyle, width: 64 }}
                    />
                  </>
                ) : (
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="Log weight (kg)"
                    value={weightInput}
                    onChange={(event) => setWeightInput(event.target.value)}
                    style={{ ...inputStyle, width: 160 }}
                  />
                )}
                <button type="button" disabled={busy} onClick={submitWeight} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
                  Log weight
                </button>
                {/* Weight units: display + input only. Storage stays kg end-to-end
                    (weight_log.weight_kg; logWeight({ weightKg })). This writes
                    profiles.preferred_units via saveProfile — the same write path
                    the allergen toggles use — and every weight surface (inputs,
                    start/now/goal, chart goal label) follows the preference. */}
                <div role="group" aria-label="Weight units" style={{ display: 'flex', border: `1.5px solid ${HAIRLINE}`, borderRadius: 100, overflow: 'hidden' }}>
                  {[
                    { value: 'imperial', label: 'st + lb' },
                    { value: 'metric', label: 'kg' },
                  ].map((option) => {
                    const activeUnit = (profile.preferred_units === 'imperial' ? 'imperial' : 'metric') === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={busy || activeUnit}
                        onClick={() => saveProfile({ preferred_units: option.value })}
                        style={{
                          border: 'none',
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: activeUnit ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          background: activeUnit ? INK : 'transparent',
                          color: activeUnit ? CREAM : MUTED,
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 14, color: MUTED }}>
              No profile found yet. <Link href="/onboarding" style={{ textDecoration: 'underline' }}>Complete onboarding first</Link>.
            </p>
          )}
        </div>

        <div className="dash-progress-col" style={{ borderLeft: `1px solid ${HAIRLINE}`, paddingLeft: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED }}>Weight trend</div>
            {chart?.etaLabel ? <div style={{ fontSize: 11, fontWeight: 600, color: BLUE }}>{chart.etaLabel}</div> : null}
          </div>
          {chart ? (
            <>
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', height: 130, overflow: 'visible' }} role="img" aria-label="Weight trend">
                {chart.goalY != null ? (
                  <>
                    <line x1="0" y1={chart.goalY} x2={CHART_W} y2={chart.goalY} stroke={HAIRLINE} strokeWidth="1" strokeDasharray="3,4" />
                    <text x={CHART_W} y={chart.goalTextY} textAnchor="end" fontSize="9" fontWeight="700" fill={MUTED}>
                      Goal {formatWeight(goalKg, profile?.preferred_units)}
                    </text>
                  </>
                ) : null}
                <path d={chart.predictedPath} fill="none" stroke={BLUE} strokeWidth="2.5" strokeDasharray="5,5" />
                <path d={chart.actualPath} fill="none" stroke={PINK} strokeWidth="2.5" />
                <circle cx={chart.lastX} cy={chart.lastY} r="4" fill={PINK} />
              </svg>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 3, background: PINK, display: 'inline-block', borderRadius: 2 }} />Logged
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 3, background: BLUE, display: 'inline-block', borderRadius: 2 }} />Predicted
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
              {weightHistory.length === 1 ? 'One weigh-in logged — log again to see your trend.' : 'Log your weight to start your trend chart.'}
            </p>
          )}
        </div>

        <div className="dash-progress-col" style={{ borderLeft: `1px solid ${HAIRLINE}`, paddingLeft: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
            Daily target{profile?.diet ? ` · ${profile.diet}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 0' }}>
            <div style={{ textAlign: 'left', borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 8 }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_kcal ?? '—'}</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>kcal</span>
            </div>
            <div style={{ textAlign: 'right', borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 8 }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_protein_g ?? '—'}g</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>Protein</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_carbs_g ?? '—'}g</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>Carbs</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_fat_g ?? '—'}g</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>Fat</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── This week's spend (dark card) ───────────────────────────── */}
      <section style={{ background: 'linear-gradient(135deg,#2A2932,#3A3847)', color: CREAM, borderRadius: 24, padding: '36px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: PINK, marginBottom: 8 }}>This week&rsquo;s spend</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.02em' }}>{money(weekTotalPence)}</div>
          <div style={{ fontSize: 13, color: '#C7C4D1', marginTop: 8 }}>
            Groceries {money(grocerySpendPence)} · Eating out (est.) {money(eatingOutPence)} · Off-plan {money(offPlanPence)} · Sundries {money(sundrySpendPence)}
          </div>
          <Link href="/spend" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, fontWeight: 700, color: CREAM, textDecoration: 'underline' }}>View logged spend →</Link>
          <div style={{ fontSize: 13, color: '#C7C4D1', marginTop: 4 }}>
            Eaten {money(eatenPence)} <span style={{ opacity: 0.75 }}>— what you actually consumed</span> · Binned {money(binnedPence)} <span style={{ opacity: 0.75 }}>— paid for but thrown away</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Amount (£)"
            value={spendForm.amountPounds}
            onChange={(event) => setSpendForm({ ...spendForm, amountPounds: event.target.value })}
            style={{ border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: CREAM, borderRadius: 12, padding: '12px 16px', fontSize: 14, width: 130, fontFamily: 'inherit' }}
          />
          <select
            value={spendForm.category}
            onChange={(event) => setSpendForm({ ...spendForm, category: event.target.value })}
            style={{ border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: CREAM, borderRadius: 12, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit' }}
          >
            {SPEND_CATEGORIES.map((category) => <option key={category} value={category} style={{ color: INK }}>{category.replace('_', ' ')}</option>)}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={submitSpend}
            style={{ background: PINK, color: INK, border: 'none', borderRadius: 100, padding: '0 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1 }}
          >
            Log spend
          </button>
        </div>
      </section>

      {/* ── This week: 7-day meal grid ──────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <h2 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.03em', margin: 0 }}>This week</h2>
          <Link href="/shopping" style={{ fontSize: 13, fontWeight: 600, textDecoration: 'underline' }}>View shopping list →</Link>
        </div>
        <div className="dash-week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
          {weekDays.map((slotDate) => (
            <div key={slotDate} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{dayLabelShort(slotDate)}</div>
              {MEALS.map((meal) => {
                const slot = slotByKey[slotKey(slotDate, meal)];
                const recipe = slot?.recipe_id ? recipeById[slot.recipe_id] : null;
                return (
                  <div key={meal} style={{ background: MEAL_WASHES[meal], borderRadius: 10, padding: 8, fontSize: 11 }}>
                    <div style={{ textTransform: 'uppercase', letterSpacing: '.05em', color: MUTED, fontWeight: 600, fontSize: 9 }}>{meal}</div>

                    {slot?.eating_out ? (
                      <>
                        <div style={{ fontWeight: 700, marginTop: 2, color: INK }}>{slot.eating_out_label || 'Eating out'}</div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                          est. {money(slot.est_cost_pence)} · {slot.est_kcal ?? '—'} kcal
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <ChipAction disabled={busy} onClick={() => setEatingForm({ slotDate, meal, label: slot.eating_out_label || '', costPounds: slot.est_cost_pence != null ? String(slot.est_cost_pence / 100) : '', kcal: slot.est_kcal ?? '', proteinG: slot.est_protein_g ?? '', carbsG: slot.est_carbs_g ?? '', fatG: slot.est_fat_g ?? '' })}>Edit</ChipAction>
                        </div>
                      </>
                    ) : recipe ? (
                      <>
                        <div style={{ fontWeight: 700, marginTop: 2, color: INK }}>{recipe.name}</div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                          {recipe.kcal ?? '—'} kcal · {money(Math.round((costByRecipe[recipe.id] ?? 0) * 100 * (slot.portions ?? householdPortions)))}
                          {slot.cooked_at ? <span style={{ color: '#3b7d3b', fontWeight: 700 }}> · Cooked ✓</span> : null}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <Link href={`/recipe/${recipe.id}`} style={{ fontSize: 9, fontWeight: 700, textDecoration: 'underline', color: INK }}>View</Link>
                          <ChipAction disabled={busy} onClick={() => openChooser(slotDate, meal, recipe.id)}>Swap</ChipAction>
                          <ChipAction disabled={busy} onClick={() => editPortions(slot)}>×{slot.portions ?? householdPortions}</ChipAction>
                          {slot.cooked_at ? (
                            <ChipAction disabled={busy} onClick={() => eatSlot(slot)} colour={INK}>Eaten</ChipAction>
                          ) : (
                            <ChipAction disabled={busy} onClick={() => cookSlot(slot)} colour={INK}>Cooked</ChipAction>
                          )}
                          <ChipAction disabled={busy} onClick={() => setEatingForm({ slotDate, meal, label: '', costPounds: '', kcal: '', proteinG: '', carbsG: '', fatG: '' })}>Eating out</ChipAction>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <ChipAction disabled={busy} onClick={() => openChooser(slotDate, meal, null)} colour={INK}>+ plan a meal</ChipAction>
                          <ChipAction disabled={busy} onClick={() => setEatingForm({ slotDate, meal, label: '', costPounds: '', kcal: '', proteinG: '', carbsG: '', fatG: '' })}>Eating out</ChipAction>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* ── Swap / plan chooser ─────────────────────────────────────── */}
      {chooser ? (
        <section ref={chooserRef} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, scrollMarginTop: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>
              {chooser.currentRecipeId ? `Swap ${dayLabelShort(chooser.slotDate)} ${chooser.meal}` : `Plan ${dayLabelShort(chooser.slotDate)} ${chooser.meal}`}
            </h2>
            <button type="button" onClick={() => setChooser(null)} style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
              Close
            </button>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>
            Showing {chooser.options.length} of {chooser.total ?? chooser.options.length} recipes — scroll inside the box to see them all.
            {chooser.hiddenAllergens > 0 ? ` ${chooser.hiddenAllergens} hidden by your allergens.` : ''}
            {chooser.hiddenDisliked > 0 ? ` ${chooser.hiddenDisliked} hidden by "never again".` : ''}
            {chooser.hiddenIngDislikes > 0 ? ` ${chooser.hiddenIngDislikes} hidden by your disliked ingredients.` : ''}
          </p>
          <div style={{ maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {chooser.options.length ? chooser.options.map((option) => (
              <div key={option.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${HAIRLINE}`, padding: '12px 0', gap: 12 }}>
                <span style={{ fontSize: 14 }}>
                  {option.name} <span style={{ color: MUTED, fontSize: 13 }}>({option.kcal ?? '—'} kcal)</span>
                </span>
                <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button type="button" disabled={busy} onClick={() => chooseSwap(option, false)} style={{ ...darkPillButton, padding: '8px 16px', fontSize: 12, opacity: busy ? 0.7 : 1 }}>
                    {chooser.currentRecipeId ? 'Just this once' : 'Plan it'}
                  </button>
                  {chooser.currentRecipeId ? (
                    <button type="button" disabled={busy} onClick={() => chooseSwap(option, true)} style={{ ...outlinePillButton, opacity: busy ? 0.7 : 1 }}>
                      Never again
                    </button>
                  ) : null}
                </span>
              </div>
            )) : <p style={{ color: MUTED, fontSize: 14 }}>No safe recipes found with the current allergens/dislikes.</p>}
          </div>
        </section>
      ) : null}

      {/* ── Eating out form ─────────────────────────────────────────── */}
      {eatingForm ? (
        <section ref={eatingFormRef} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, display: 'grid', gap: 12, scrollMarginTop: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>
              Eating out — {dayLabelShort(eatingForm.slotDate)} {eatingForm.meal}
            </h2>
            <button type="button" onClick={() => setEatingForm(null)} style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
              Cancel
            </button>
          </div>
          <input placeholder="Label (e.g. pub dinner)" value={eatingForm.label} onChange={(event) => setEatingForm({ ...eatingForm, label: event.target.value })} style={inputStyle} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Est. cost (£)" value={eatingForm.costPounds} onChange={(event) => setEatingForm({ ...eatingForm, costPounds: event.target.value })} style={{ ...inputStyle, width: 130 }} />
            <input placeholder="kcal" value={eatingForm.kcal} onChange={(event) => setEatingForm({ ...eatingForm, kcal: event.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input placeholder="protein g" value={eatingForm.proteinG} onChange={(event) => setEatingForm({ ...eatingForm, proteinG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input placeholder="carbs g" value={eatingForm.carbsG} onChange={(event) => setEatingForm({ ...eatingForm, carbsG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input placeholder="fat g" value={eatingForm.fatG} onChange={(event) => setEatingForm({ ...eatingForm, fatG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          </div>
          <div>
            <button type="button" disabled={busy} onClick={submitEatingOut} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
              Save eating out
            </button>
          </div>
        </section>
      ) : null}

      {/* ── Pantry: appliance cards ─────────────────────────────────── */}
      <section>
        <h2 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.03em', margin: '0 0 18px' }}>Pantry</h2>
        <div className="dash-pantry" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {LOCATIONS.map((location) => {
            const locStyle = LOCATION_STYLES[location];
            const rows = pantryStock.filter((row) => row.location === location);
            return (
              <div key={location} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 20, overflow: 'hidden' }}>
                {/* Appliance graphic: door seam + handles + shelves */}
                <div style={{ position: 'relative', height: 92, borderRadius: '20px 20px 0 0', background: locStyle.wash, margin: '-20px -20px 16px' }}>
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,.1)' }} />
                  <div style={{ position: 'absolute', left: 'calc(50% - 9px)', top: 14, width: 3, height: 24, background: 'rgba(0,0,0,.16)', borderRadius: 2 }} />
                  <div style={{ position: 'absolute', left: 'calc(50% + 6px)', top: 14, width: 3, height: 24, background: 'rgba(0,0,0,.16)', borderRadius: 2 }} />
                  <div style={{ position: 'absolute', left: 14, top: 52, right: 14, height: 1, background: 'rgba(255,255,255,.6)' }} />
                  <div style={{ position: 'absolute', left: 14, top: 70, right: 14, height: 1, background: 'rgba(255,255,255,.4)' }} />
                  <div style={{ position: 'absolute', left: 14, bottom: 10, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: locStyle.textColor }}>
                    {location}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.length ? rows.map((row) => {
                    const badge = expiryBadge(row);
                    return (
                      <div key={`${row.location}|${row.item_kind}|${row.ingredient_id}|${row.recipe_id}`} style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 8, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span>{stockName(row)} — {stockQuantity(row)}</span>
                          {badge ? (
                            <span style={{ background: badge.wash, color: INK, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '.05em', flexShrink: 0 }}>
                              {badge.text}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          {row.item_kind === 'cooked_portion' && row.recipe_id ? (
                            <ChipAction disabled={busy} onClick={() => eatStock(row)} colour={INK}>Eat</ChipAction>
                          ) : null}
                          {row.location !== 'cupboard' ? (
                            <ChipAction disabled={busy} onClick={() => moveStock(row)}>
                              {row.location === 'fridge' ? 'To freezer' : 'To fridge'}
                            </ChipAction>
                          ) : null}
                          <ChipAction disabled={busy} onClick={() => binStockRow(row)}>Bin</ChipAction>
                        </div>
                      </div>
                    );
                  }) : <p style={{ color: MUTED, margin: '4px 0', fontSize: 13 }}>No stock.</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add stock */}
        <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, marginTop: 16, display: 'grid', gap: 12 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.02em', margin: 0 }}>Add stock</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={pantryForm.itemKind} onChange={(event) => setPantryForm({ ...pantryForm, itemKind: event.target.value })} style={inputStyle}>
              <option value="ingredient">ingredient</option>
              <option value="cooked_portion">cooked_portion</option>
            </select>
            {pantryForm.itemKind === 'ingredient' ? (
              <select value={pantryForm.ingredientId} onChange={(event) => setPantryForm({ ...pantryForm, ingredientId: event.target.value })} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">Choose ingredient…</option>
                {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
              </select>
            ) : (
              <select value={pantryForm.recipeId} onChange={(event) => setPantryForm({ ...pantryForm, recipeId: event.target.value })} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">Choose recipe…</option>
                {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
              </select>
            )}
            <input placeholder="Label fallback (optional)" value={pantryForm.label} onChange={(event) => setPantryForm({ ...pantryForm, label: event.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Quantity" value={pantryForm.quantity} onChange={(event) => setPantryForm({ ...pantryForm, quantity: event.target.value })} style={{ ...inputStyle, width: 100 }} />
            <input placeholder="Unit" value={pantryForm.unit} onChange={(event) => setPantryForm({ ...pantryForm, unit: event.target.value })} style={{ ...inputStyle, width: 80 }} />
            <select value={pantryForm.location} onChange={(event) => setPantryForm({ ...pantryForm, location: event.target.value })} style={inputStyle}>
              {LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
            <input placeholder="Cost (£)" value={pantryForm.costPounds} onChange={(event) => setPantryForm({ ...pantryForm, costPounds: event.target.value })} style={{ ...inputStyle, width: 100 }} />
            <label style={{ fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
              Bought/cooked
              <input type="date" value={pantryForm.boughtDate} onChange={(event) => setPantryForm({ ...pantryForm, boughtDate: event.target.value })} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
              Expiry (auto if blank)
              <input type="date" value={pantryForm.expiryDate} onChange={(event) => setPantryForm({ ...pantryForm, expiryDate: event.target.value })} style={inputStyle} />
            </label>
          </div>
          <div>
            <button type="button" disabled={busy} onClick={submitPantryAdd} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
              Add pantry item
            </button>
          </div>
        </div>
      </section>

      {/* ── Allergens & dislikes ────────────────────────────────────── */}
      <section style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, display: 'grid', gap: 16 }}>
        <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>Allergens &amp; dislikes</h2>
        <div>
          <strong style={{ fontSize: 13 }}>Allergens — tap to toggle. Recipes containing them are hidden, safely.</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {ALLERGENS.map((allergen) => {
              const active = (profile?.allergens || []).includes(allergen);
              return (
                <button
                  key={allergen}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleAllergen(allergen)}
                  style={{
                    borderRadius: 100,
                    padding: '6px 14px',
                    border: `1.5px solid ${active ? INK : HAIRLINE}`,
                    cursor: 'pointer',
                    background: active ? INK : '#fff',
                    color: active ? CREAM : INK,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                  }}
                >
                  {ALLERGEN_LABELS[allergen] ?? allergen}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <strong style={{ fontSize: 13 }}>Disliked ingredients — hidden from your meal choices.</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            {(profile?.disliked_ingredient_ids || []).map((id) => (
              <span key={id} style={{ borderRadius: 100, padding: '6px 12px', border: `1.5px solid ${HAIRLINE}`, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {ingredientById[id]?.name ?? 'Ingredient'}
                <button type="button" disabled={busy} onClick={() => removeDislikedIngredient(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: MUTED, padding: 0, fontFamily: 'inherit' }}>×</button>
              </span>
            ))}
            <select value="" disabled={busy} onChange={(event) => addDislikedIngredient(event.target.value)} style={{ ...inputStyle, padding: '6px 12px', fontSize: 12 }}>
              <option value="">+ add ingredient…</option>
              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
            </select>
          </div>
          {(profile?.dislikes || []).length > 0 ? (
            <p style={{ fontSize: 12, color: MUTED, margin: '8px 0 0' }}>
              Typed dislikes ({(profile?.dislikes || []).join(', ')}) don&rsquo;t filter choices — re-add them with the picker above.
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Log off-plan / Log eat / Log bin ────────────────────────── */}
      <section style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, display: 'grid', gap: 12 }}>
        <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>Log off-plan</h2>
        <input placeholder="Description" value={intakeForm.description} onChange={(event) => setIntakeForm({ ...intakeForm, description: event.target.value })} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="kcal" value={intakeForm.kcal} onChange={(event) => setIntakeForm({ ...intakeForm, kcal: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="protein g" value={intakeForm.proteinG} onChange={(event) => setIntakeForm({ ...intakeForm, proteinG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="carbs g" value={intakeForm.carbsG} onChange={(event) => setIntakeForm({ ...intakeForm, carbsG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="fat g" value={intakeForm.fatG} onChange={(event) => setIntakeForm({ ...intakeForm, fatG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="Cost (£, optional)" value={intakeForm.costPounds} onChange={(event) => setIntakeForm({ ...intakeForm, costPounds: event.target.value })} style={{ ...inputStyle, width: 140 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: MUTED }}>Used from pantry (optional):</span>
          <select value={intakeForm.pantryIngredientId} onChange={(event) => setIntakeForm({ ...intakeForm, pantryIngredientId: event.target.value })} style={inputStyle}>
            <option value="">Choose ingredient…</option>
            {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
          </select>
          <input placeholder="Qty" style={{ ...inputStyle, width: 72 }} value={intakeForm.pantryQuantity} onChange={(event) => setIntakeForm({ ...intakeForm, pantryQuantity: event.target.value })} />
        </div>
        <div>
          <button type="button" disabled={busy} onClick={submitIntake} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
            Log intake
          </button>
        </div>

        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.02em', margin: '12px 0 0' }}>Log eat</h3>
        {intakeRows.length ? intakeRows.map((row) => (
          <p key={row.id} style={{ margin: 0, color: MUTED, fontSize: 13 }}>
            {row.intake_date}: {row.description} — {row.kcal ?? '—'} kcal
            {row.cost_pence != null ? ` · ${money(row.cost_pence)}` : ''}
            {row.confidence === 'ESTIMATED' ? ' (estimated — confirm?)' : ''}
          </p>
        )) : <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Nothing eaten logged yet.</p>}

        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.02em', margin: '12px 0 0' }}>Log bin</h3>
        {wasteRows.length ? wasteRows.map((row) => (
          <p key={row.id} style={{ margin: 0, color: MUTED, fontSize: 13 }}>
            {row.wasted_date}: {row.label || 'Binned item'} — {row.quantity}{row.unit ? ` ${row.unit}` : ''}
            {row.cost_pence != null ? ` · ${money(row.cost_pence)} wasted` : ''}
          </p>
        )) : <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Nothing binned this week. Nice.</p>}
      </section>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
        <Link href="/" style={{ textDecoration: 'underline' }}>Browse recipes</Link>
        <Link href="/shopping" style={{ textDecoration: 'underline' }}>Shopping list</Link>
      </div>
    </main>
  );
}
