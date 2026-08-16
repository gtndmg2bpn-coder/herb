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
const SPEND_CATEGORIES = ['grocery', 'eating_out', 'other'];
// The 14 UK major allergens
const ALLERGENS = ['celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soy', 'sulphites'];

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
    const stone = Math.floor(totalLb / 14);
    const pounds = Math.round(totalLb - stone * 14);
    return `${stone} st ${pounds} lb`;
  }
  return `${Number(weightKg).toFixed(1)} kg`;
}

function slotKey(slotDate, meal) {
  return `${slotDate}|${meal}`;
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
      .select('amount_pence, spend_date')
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
    const { data: { session: live } } = await getBrowserClient().auth.getSession();
    if (live) await loadAll(live);
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
    if (soonest < today) return { text: 'expired', colour: '#b00020' };
    if (soonest <= warnBy) return { text: 'use soon', colour: '#9a6b00' };
    return null;
  }

  function trendSvg() {
    if (weightRows.length === 0) return null;
    if (weightRows.length === 1) {
      return <p style={{ color: '#666' }}>One weigh-in logged — log again to see your trend.</p>;
    }

    const values = weightRows.map((row) => Number(row.weight_kg));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * 180 + 10;
      const y = 50 - ((value - min) / span) * 40;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox="0 0 200 60" width="100%" height="60" role="img" aria-label="Weight trend">
        <polyline points={points} fill="none" stroke="#3b7d3b" strokeWidth="2" />
      </svg>
    );
  }

  if (checking || !session) return null;

  const weekSpendPence = spendRows.reduce((sum, row) => sum + (row.amount_pence || 0), 0);
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

  return (
    <main style={{ maxWidth: 980, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 24 }}>
      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>HERB dashboard</h1>
        {error ? <p role="alert" style={{ color: '#b00020' }}>{error}</p> : null}

        {profile ? (
          <>
            <p>
              Start {formatWeight(profile.start_weight_kg, profile.preferred_units)} → Now{' '}
              {formatWeight(currentWeight, profile.preferred_units)} → Goal{' '}
              {formatWeight(profile.goal_weight_kg, profile.preferred_units)}
            </p>
            {trendSvg()}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {profile.preferred_units === 'imperial' ? (
                <>
                  <input
                    type="number"
                    min="0"
                    placeholder="st"
                    value={weightStones}
                    onChange={(event) => setWeightStones(event.target.value)}
                    style={{ width: 64 }}
                  />
                  <span>st</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="13.9"
                    placeholder="lb"
                    value={weightPounds}
                    onChange={(event) => setWeightPounds(event.target.value)}
                    style={{ width: 64 }}
                  />
                  <span>lb</span>
                </>
              ) : (
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  placeholder="Log weight (kg)"
                  value={weightInput}
                  onChange={(event) => setWeightInput(event.target.value)}
                />
              )}
              <button type="button" disabled={busy} onClick={submitWeight}>Log weight</button>
            </div>
            <p style={{ marginBottom: 0 }}>
              Daily target: <b>{profile.target_kcal ?? '—'} kcal</b> · protein {profile.target_protein_g ?? '—'} g · carbs{' '}
              {profile.target_carbs_g ?? '—'} g · fat {profile.target_fat_g ?? '—'} g ({profile.diet})
            </p>
          </>
        ) : (
          <p>No profile found yet. <Link href="/onboarding">Complete onboarding first</Link>.</p>
        )}
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <h2 style={{ marginTop: 0 }}>Allergens &amp; dislikes</h2>
        <div>
          <strong style={{ fontSize: 14 }}>Allergens — tap to toggle. Recipes containing them are hidden, safely.</strong>
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
                    borderRadius: 999,
                    padding: '4px 12px',
                    border: '1px solid #ddd',
                    cursor: 'pointer',
                    background: active ? '#2A2932' : '#fff',
                    color: active ? '#fff' : '#2A2932',
                  }}
                >
                  {allergen}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <strong style={{ fontSize: 14 }}>Disliked ingredients — hidden from your meal choices.</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            {(profile?.disliked_ingredient_ids || []).map((id) => (
              <span key={id} style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid #ddd', fontSize: 13 }}>
                {ingredientById[id]?.name ?? 'Ingredient'}
                <button type="button" disabled={busy} onClick={() => removeDislikedIngredient(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: 4 }}>×</button>
              </span>
            ))}
            <select value="" disabled={busy} onChange={(event) => addDislikedIngredient(event.target.value)}>
              <option value="">+ add ingredient…</option>
              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
            </select>
          </div>
          {(profile?.dislikes || []).length > 0 ? (
            <p style={{ fontSize: 12, color: '#666', margin: '8px 0 0' }}>
              Typed dislikes ({(profile?.dislikes || []).join(', ')}) don&rsquo;t filter choices — re-add them with the picker above.
            </p>
          ) : null}
        </div>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Next 7 days</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {weekDays.map((slotDate) => (
            <div key={slotDate} style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
              <strong>{dayLabel(slotDate)}</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                {MEALS.map((meal) => {
                  const slot = slotByKey[slotKey(slotDate, meal)];
                  const recipe = slot?.recipe_id ? recipeById[slot.recipe_id] : null;
                  return (
                    <div key={meal} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, minHeight: 92 }}>
                      <div style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>{meal}</div>

                      {slot?.eating_out ? (
                        <div>
                          <div>{slot.eating_out_label || 'Eating out'}</div>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            est. {money(slot.est_cost_pence)} · {slot.est_kcal ?? '—'} kcal
                          </div>
                        </div>
                      ) : recipe ? (
                        <div>
                          <Link href={`/recipe/${recipe.id}`} style={{ display: 'block', fontWeight: 600 }}>
                            {recipe.name}
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 'normal', color: '#666' }}>
                              tap for photo, ingredients &amp; method →
                            </span>
                          </Link>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            {recipe.kcal ?? '—'} kcal · {money(Math.round((costByRecipe[recipe.id] ?? 0) * 100 * (slot.portions ?? householdPortions)))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                            <button type="button" disabled={busy} onClick={() => openChooser(slotDate, meal, recipe.id)}>Swap</button>
                            <button type="button" disabled={busy} onClick={() => editPortions(slot)}>Portions: {slot.portions ?? householdPortions}</button>
                            {slot.cooked_at ? (
                              <>
                                <span style={{ fontSize: 12, color: '#3b7d3b', alignSelf: 'center' }}>Cooked ✓</span>
                                <button type="button" disabled={busy} onClick={() => eatSlot(slot)}>Eaten</button>
                              </>
                            ) : (
                              <button type="button" disabled={busy} onClick={() => cookSlot(slot)}>Cooked</button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => openChooser(slotDate, meal, null)}>+ plan a meal</button>
                      )}

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        <button type="button" disabled={busy} onClick={() => setEatingForm({ slotDate, meal, label: '', costPounds: '', kcal: '', proteinG: '', carbsG: '', fatG: '' })}>
                          Eating out
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/shopping">Build shopping list &rarr;</Link>
        </div>
      </section>

      {chooser ? (
        <section ref={chooserRef} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, scrollMarginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>{chooser.currentRecipeId ? 'Choose a swap' : 'Plan a meal'}</h2>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#666' }}>
            Showing {chooser.options.length} of {chooser.total ?? chooser.options.length} recipes — scroll inside the box to see them all.
            {chooser.hiddenAllergens > 0 ? ` ${chooser.hiddenAllergens} hidden by your allergens.` : ''}
            {chooser.hiddenDisliked > 0 ? ` ${chooser.hiddenDisliked} hidden by "never again".` : ''}
            {chooser.hiddenIngDislikes > 0 ? ` ${chooser.hiddenIngDislikes} hidden by your disliked ingredients.` : ''}
          </p>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {chooser.options.length ? chooser.options.map((option) => (
              <div key={option.id} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eee', padding: '8px 0' }}>
                <span>{option.name} <span style={{ color: '#666' }}>({option.kcal ?? '—'} kcal)</span></span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" disabled={busy} onClick={() => chooseSwap(option, false)}>{chooser.currentRecipeId ? 'Just this once' : 'Plan it'}</button>
                  {chooser.currentRecipeId ? (
                    <button type="button" disabled={busy} onClick={() => chooseSwap(option, true)}>Never again</button>
                  ) : null}
                </span>
              </div>
            )) : <p>No safe recipes found with the current allergens/dislikes.</p>}
          </div>
          <button type="button" disabled={busy} onClick={() => setChooser(null)}>Close</button>
        </section>
      ) : null}

      {eatingForm ? (
        <section ref={eatingFormRef} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, display: 'grid', gap: 8, scrollMarginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Mark eating out</h2>
          <input placeholder="Label (e.g. pub dinner)" value={eatingForm.label} onChange={(event) => setEatingForm({ ...eatingForm, label: event.target.value })} />
          <input placeholder="Est. cost (£)" value={eatingForm.costPounds} onChange={(event) => setEatingForm({ ...eatingForm, costPounds: event.target.value })} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="kcal" value={eatingForm.kcal} onChange={(event) => setEatingForm({ ...eatingForm, kcal: event.target.value })} />
            <input placeholder="protein g" value={eatingForm.proteinG} onChange={(event) => setEatingForm({ ...eatingForm, proteinG: event.target.value })} />
            <input placeholder="carbs g" value={eatingForm.carbsG} onChange={(event) => setEatingForm({ ...eatingForm, carbsG: event.target.value })} />
            <input placeholder="fat g" value={eatingForm.fatG} onChange={(event) => setEatingForm({ ...eatingForm, fatG: event.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={submitEatingOut}>Save eating out</button>
            <button type="button" disabled={busy} onClick={() => setEatingForm(null)}>Cancel</button>
          </div>
        </section>
      ) : null}

      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Pantry</h2>
        {LOCATIONS.map((location) => (
          <div key={location} style={{ marginBottom: 12 }}>
            <h3 style={{ textTransform: 'capitalize' }}>{location}</h3>
            {pantryStock.filter((row) => row.location === location).length ? pantryStock.filter((row) => row.location === location).map((row) => {
              const badge = expiryBadge(row);
              return (
                <div key={`${row.location}|${row.item_kind}|${row.ingredient_id}|${row.recipe_id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #eee', padding: '6px 0' }}>
                  <span style={{ flex: 1 }}>{stockName(row)} — {stockQuantity(row)}</span>
                  {badge ? <span style={{ color: badge.colour, fontSize: 12 }}>{badge.text}</span> : null}
                  {row.item_kind === 'cooked_portion' && row.recipe_id ? (
                    <button type="button" disabled={busy} onClick={() => eatStock(row)}>Eat</button>
                  ) : null}
                  {row.location !== 'cupboard' ? (
                    <button type="button" disabled={busy} onClick={() => moveStock(row)}>
                      {row.location === 'fridge' ? 'To freezer' : 'To fridge'}
                    </button>
                  ) : null}
                  <button type="button" disabled={busy} onClick={() => binStockRow(row)}>Bin</button>
                </div>
              );
            }) : <p style={{ color: '#666', margin: '4px 0' }}>No stock.</p>}
          </div>
        ))}

        <div style={{ display: 'grid', gap: 8, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <strong>Add stock</strong>
          <select value={pantryForm.itemKind} onChange={(event) => setPantryForm({ ...pantryForm, itemKind: event.target.value })}>
            <option value="ingredient">ingredient</option>
            <option value="cooked_portion">cooked_portion</option>
          </select>
          {pantryForm.itemKind === 'ingredient' ? (
            <select value={pantryForm.ingredientId} onChange={(event) => setPantryForm({ ...pantryForm, ingredientId: event.target.value })}>
              <option value="">Choose ingredient…</option>
              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
            </select>
          ) : (
            <select value={pantryForm.recipeId} onChange={(event) => setPantryForm({ ...pantryForm, recipeId: event.target.value })}>
              <option value="">Choose recipe…</option>
              {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
            </select>
          )}
          <input placeholder="Label fallback (optional)" value={pantryForm.label} onChange={(event) => setPantryForm({ ...pantryForm, label: event.target.value })} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Quantity" value={pantryForm.quantity} onChange={(event) => setPantryForm({ ...pantryForm, quantity: event.target.value })} />
            <input placeholder="Unit" value={pantryForm.unit} onChange={(event) => setPantryForm({ ...pantryForm, unit: event.target.value })} />
            <select value={pantryForm.location} onChange={(event) => setPantryForm({ ...pantryForm, location: event.target.value })}>
              {LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
            <input placeholder="Cost (£)" value={pantryForm.costPounds} onChange={(event) => setPantryForm({ ...pantryForm, costPounds: event.target.value })} />
            <label style={{ fontSize: 12, color: '#666' }}>Bought/cooked
              <input type="date" value={pantryForm.boughtDate} onChange={(event) => setPantryForm({ ...pantryForm, boughtDate: event.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: '#666' }}>Expiry (auto if blank)
              <input type="date" value={pantryForm.expiryDate} onChange={(event) => setPantryForm({ ...pantryForm, expiryDate: event.target.value })} />
            </label>
          </div>
          <button type="button" disabled={busy} onClick={submitPantryAdd}>Add pantry item</button>
        </div>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <h2 style={{ marginTop: 0 }}>Log off-plan</h2>
        <input placeholder="Description" value={intakeForm.description} onChange={(event) => setIntakeForm({ ...intakeForm, description: event.target.value })} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="kcal" value={intakeForm.kcal} onChange={(event) => setIntakeForm({ ...intakeForm, kcal: event.target.value })} />
          <input placeholder="protein g" value={intakeForm.proteinG} onChange={(event) => setIntakeForm({ ...intakeForm, proteinG: event.target.value })} />
          <input placeholder="carbs g" value={intakeForm.carbsG} onChange={(event) => setIntakeForm({ ...intakeForm, carbsG: event.target.value })} />
          <input placeholder="fat g" value={intakeForm.fatG} onChange={(event) => setIntakeForm({ ...intakeForm, fatG: event.target.value })} />
          <input placeholder="Cost (£, optional)" value={intakeForm.costPounds} onChange={(event) => setIntakeForm({ ...intakeForm, costPounds: event.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#666' }}>Used from pantry (optional):</span>
          <select value={intakeForm.pantryIngredientId} onChange={(event) => setIntakeForm({ ...intakeForm, pantryIngredientId: event.target.value })}>
            <option value="">Choose ingredient…</option>
            {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
          </select>
          <input placeholder="Qty" style={{ width: 72 }} value={intakeForm.pantryQuantity} onChange={(event) => setIntakeForm({ ...intakeForm, pantryQuantity: event.target.value })} />
        </div>
        <button type="button" disabled={busy} onClick={submitIntake}>Log intake</button>

        <h3 style={{ marginBottom: 0 }}>Log eat</h3>
        {intakeRows.length ? intakeRows.map((row) => (
          <p key={row.id} style={{ margin: 0, color: '#666' }}>
            {row.intake_date}: {row.description} — {row.kcal ?? '—'} kcal
            {row.cost_pence != null ? ` · ${money(row.cost_pence)}` : ''}
            {row.confidence === 'ESTIMATED' ? ' (estimated — confirm?)' : ''}
          </p>
        )) : <p style={{ margin: 0, color: '#666' }}>Nothing eaten logged yet.</p>}

        <h3 style={{ marginBottom: 0 }}>Log bin</h3>
        {wasteRows.length ? wasteRows.map((row) => (
          <p key={row.id} style={{ margin: 0, color: '#666' }}>
            {row.wasted_date}: {row.label || 'Binned item'} — {row.quantity}{row.unit ? ` ${row.unit}` : ''}
            {row.cost_pence != null ? ` · ${money(row.cost_pence)} wasted` : ''}
          </p>
        )) : <p style={{ margin: 0, color: '#666' }}>Nothing binned this week. Nice.</p>}

        <h2>Log spend</h2>
        <p style={{ margin: 0 }}>This week (cash out): <b>{money(weekTotalPence)}</b></p>
        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
          Logged {money(weekSpendPence)} · eating out (est.) {money(eatingOutPence)} · off-plan {money(offPlanPence)}
        </p>
        <p style={{ margin: 0 }}>
          This week (eaten): <b>{money(eatenPence)}</b>{' '}
          <span style={{ fontSize: 12, color: '#666' }}>— the cost of what you actually consumed, portion by portion.</span>
        </p>
        <p style={{ margin: 0 }}>
          This week (binned): <b>{money(binnedPence)}</b>{' '}
          <span style={{ fontSize: 12, color: '#666' }}>— food you paid for but threw away.</span>
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Amount (£)" value={spendForm.amountPounds} onChange={(event) => setSpendForm({ ...spendForm, amountPounds: event.target.value })} />
          <select value={spendForm.category} onChange={(event) => setSpendForm({ ...spendForm, category: event.target.value })}>
            {SPEND_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={submitSpend}>Log spend</button>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/">Browse recipes</Link>
        <Link href="/shopping">Shopping list</Link>
      </div>
    </main>
  );
}
