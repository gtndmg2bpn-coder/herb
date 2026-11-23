// app/dashboard/_dash/useDashData.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../../lib/supabaseBrowser';
import { isoDate, addDays } from '../../../lib/dates';
import { slotKey } from './dashShared';

export function useDashData() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cookingSlot, setCookingSlot] = useState(null);

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

  // Adaptive-targets UI state. proposal holds a recalcTargets() result while its card
  // is open; notice is the transient green "Targets unchanged" / "Targets updated" toast.
  const [proposal, setProposal] = useState(null);
  const [proposalError, setProposalError] = useState('');
  const [notice, setNotice] = useState('');
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
      .select('display_name, start_weight_kg, goal_weight_kg, target_kcal, target_protein_g, target_carbs_g, target_fat_g, diet, preferred_units, household_portions, disliked_recipe_ids, disliked_ingredient_ids, allergens, dislikes, sex, date_of_birth, height_cm, activity_level, pace, avg_daily_burn_kcal, liked_cuisines, disliked_cuisines')
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
      .select('id, name, section, kcal, protein_g, carbs_g, fat_g, fibre_g, portions, image_id, freezes, batch_portions, fresh_portions, fresh_shelf_days, cuisine')
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

  // Auto-dismiss the green toast a few seconds after it appears.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Check-in card values, derived from the weigh-in history (ascending by date).
  const checkin = useMemo(() => {
    if (!weightRows || weightRows.length === 0) return { hasData: false };
    const latest = weightRows[weightRows.length - 1];
    const prev = weightRows.length > 1 ? weightRows[weightRows.length - 2] : null;
    const daysSince = (Date.now() - new Date(latest.created_at).getTime()) / 86400000;
    return {
      hasData: true,
      latestKg: Number(latest.weight_kg),
      deltaKg: prev ? Number(latest.weight_kg) - Number(prev.weight_kg) : null,
      daysSince,
      duePrompt: daysSince >= 7,
      stale: daysSince > 14,
    };
  }, [weightRows]);

  return {
    router,
    checking,
    setChecking,
    session,
    setSession,
    error,
    setError,
    busy,
    setBusy,
    cookingSlot,
    setCookingSlot,
    profile,
    setProfile,
    currentWeight,
    setCurrentWeight,
    weightRows,
    setWeightRows,
    planSlots,
    setPlanSlots,
    recipes,
    setRecipes,
    ingredients,
    setIngredients,
    recipeIngredients,
    setRecipeIngredients,
    costByRecipe,
    setCostByRecipe,
    allergensByRecipe,
    setAllergensByRecipe,
    pantryStock,
    setPantryStock,
    pantryLots,
    setPantryLots,
    spendRows,
    setSpendRows,
    intakeRows,
    setIntakeRows,
    weekIntakeRows,
    setWeekIntakeRows,
    wasteRows,
    setWasteRows,
    weightInput,
    setWeightInput,
    weightStones,
    setWeightStones,
    weightPounds,
    setWeightPounds,
    proposal,
    setProposal,
    proposalError,
    setProposalError,
    notice,
    setNotice,
    chooser,
    setChooser,
    eatingForm,
    setEatingForm,
    pantryForm,
    setPantryForm,
    intakeForm,
    setIntakeForm,
    spendForm,
    setSpendForm,
    chooserRef,
    eatingFormRef,
    today,
    weekDays,
    weekEnd,
    monday,
    weekStart,
    recipeById,
    ingredientById,
    slotByKey,
    ingredientsByRecipe,
    householdPortions,
    loadAll,
    checkin,
  };
}
