'use client';
// app/dashboard/page.js

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import {
  swapMeal,
  markEatingOut,
  setPortions,
  addPantryItems,
  consumePantryItem,
  logSpend,
  logOffPlanIntake,
  logWeight,
} from '../../lib/actions';

const MEALS = ['breakfast', 'lunch', 'dinner'];
const LOCATIONS = ['fridge', 'freezer', 'cupboard'];
const SPEND_CATEGORIES = ['grocery', 'eating_out', 'other'];

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
  const [costByRecipe, setCostByRecipe] = useState({});
  const [allergensByRecipe, setAllergensByRecipe] = useState({});

  const [pantryStock, setPantryStock] = useState([]);
  const [pantryLots, setPantryLots] = useState([]);
  const [spendRows, setSpendRows] = useState([]);
  const [intakeRows, setIntakeRows] = useState([]);

  const [weightInput, setWeightInput] = useState('');
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
  });
  const [intakeForm, setIntakeForm] = useState({ description: '', kcal: '', proteinG: '', carbsG: '', fatG: '' });
  const [spendForm, setSpendForm] = useState({ amountPounds: '', category: 'grocery' });

  const today = isoDate(new Date());
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);
  const weekEnd = weekDays[6];

  const recipeById = useMemo(() => Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const ingredientById = useMemo(() => Object.fromEntries(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
  const slotByKey = useMemo(() => Object.fromEntries(planSlots.map((slot) => [slotKey(slot.slot_date, slot.meal), slot])), [planSlots]);
  const householdPortions = profile?.household_portions ?? 1;

  async function loadAll(liveSession) {
    if (!liveSession) return;
    const supabase = getBrowserClient();
    const uid = liveSession.user.id;

    const { data: prof, error: profError } = await supabase
      .from('profiles')
      .select('display_name, start_weight_kg, goal_weight_kg, target_kcal, target_protein_g, target_carbs_g, target_fat_g, diet, preferred_units, household_portions, disliked_recipe_ids, allergens, dislikes')
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
      .gte('slot_date', today)
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
      .select('id, name, unit')
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

    const monday = new Date(`${today}T00:00:00`);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekStart = isoDate(monday);

    const { data: spends, error: spendError } = await supabase
      .from('spend_log')
      .select('amount_pence, spend_date')
      .eq('user_id', uid)
      .gte('spend_date', weekStart);
    if (spendError) throw spendError;

    const { data: intake, error: intakeError } = await supabase
      .from('intake_log')
      .select('id, intake_date, description, kcal, protein_g, carbs_g, fat_g, confidence')
      .eq('user_id', uid)
      .order('intake_date', { ascending: false })
      .limit(8);
    if (intakeError) throw intakeError;

    setProfile(prof);
    setCurrentWeight(current?.weight_kg ?? null);
    setWeightRows(weights || []);
    setPlanSlots(slots || []);
    setRecipes(recipeRows || []);
    setIngredients(ingredientRows || []);
    setCostByRecipe(Object.fromEntries((costRows || []).map((row) => [row.recipe_id, row.cost_gbp])));
    setAllergensByRecipe(Object.fromEntries((allergenRows || []).map((row) => [row.recipe_id, row.contains || []])));
    setPantryStock(stockRows || []);
    setPantryLots(lotRows || []);
    setSpendRows(spends || []);
    setIntakeRows(intake || []);
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

  function openChooser(slotDate, meal, currentRecipeId) {
    const currentRecipe = currentRecipeId ? recipeById[currentRecipeId] : null;
    const disliked = new Set(profile?.disliked_recipe_ids || []);
    const userAllergens = new Set(profile?.allergens || []);
    const targetKcal = currentRecipe?.kcal ?? Math.round((profile?.target_kcal ?? 600) / 3);

    const options = recipes
      .filter((recipe) => recipe.id !== currentRecipeId)
      .filter((recipe) => !disliked.has(recipe.id))
      .filter((recipe) => !(allergensByRecipe[recipe.id] || []).some((allergen) => userAllergens.has(allergen)))
      .sort((a, b) => {
        const sectionA = currentRecipe && a.section === currentRecipe.section ? 0 : 1;
        const sectionB = currentRecipe && b.section === currentRecipe.section ? 0 : 1;
        if (sectionA !== sectionB) return sectionA - sectionB;
        return Math.abs((a.kcal ?? targetKcal) - targetKcal) - Math.abs((b.kcal ?? targetKcal) - targetKcal);
      })
      .slice(0, 3);

    setChooser({ slotDate, meal, currentRecipeId, options });
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
    }]));

    setPantryForm({ itemKind: 'ingredient', ingredientId: '', recipeId: '', label: '', quantity: '', unit: '', location: 'fridge', costPounds: '', expiryDate: '' });
  }

  async function consumeStock(row) {
    const proposed = window.prompt(`Consume how much of ${stockName(row)}?`, '1');
    if (proposed == null) return;
    const quantity = Number(proposed);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Consume quantity must be positive.');
      return;
    }
    await runAction(`Consume ${quantity} from ${stockName(row)}?`, () => consumePantryItem({
      itemKind: row.item_kind,
      quantity,
      location: row.location,
      ingredientId: row.ingredient_id,
      recipeId: row.recipe_id,
    }));
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
    }));
    setIntakeForm({ description: '', kcal: '', proteinG: '', carbsG: '', fatG: '' });
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
    const weightKg = Number(weightInput);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setError('Weight must be a positive number.');
      return;
    }
    await runAction(`Log ${formatWeight(weightKg, profile?.preferred_units)}?`, () => logWeight({ weightKg }));
    setWeightInput('');
  }

  function stockName(row) {
    return ingredientById[row.ingredient_id]?.name || recipeById[row.recipe_id]?.name || row.label || 'Pantry item';
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
              <input
                type="number"
                step="0.1"
                min="1"
                placeholder={`Log weight (${profile.preferred_units === 'imperial' ? 'kg stored' : 'kg'})`}
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
              />
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
                          <Link href={`/recipe/${recipe.id}`}>{recipe.name}</Link>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            {recipe.kcal ?? '—'} kcal · {money(Math.round((costByRecipe[recipe.id] ?? 0) * 100 * (slot.portions ?? householdPortions)))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                            <button type="button" disabled={busy} onClick={() => openChooser(slotDate, meal, recipe.id)}>Swap</button>
                            <button type="button" disabled={busy} onClick={() => editPortions(slot)}>Portions: {slot.portions ?? householdPortions}</button>
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
      </section>

      {chooser ? (
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Choose a swap</h2>
          {chooser.options.length ? chooser.options.map((option) => (
            <div key={option.id} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eee', padding: '8px 0' }}>
              <span>{option.name} <span style={{ color: '#666' }}>({option.kcal ?? '—'} kcal)</span></span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" disabled={busy} onClick={() => chooseSwap(option, false)}>Just this once</button>
                <button type="button" disabled={busy} onClick={() => chooseSwap(option, true)}>Never again</button>
              </span>
            </div>
          )) : <p>No safe alternatives found with the current allergens/dislikes.</p>}
          <button type="button" disabled={busy} onClick={() => setChooser(null)}>Close</button>
        </section>
      ) : null}

      {eatingForm ? (
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, display: 'grid', gap: 8 }}>
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
                <div key={`${row.location}|${row.ingredient_id}|${row.recipe_id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #eee', padding: '6px 0' }}>
                  <span style={{ flex: 1 }}>{stockName(row)} — {row.quantity}</span>
                  {badge ? <span style={{ color: badge.colour, fontSize: 12 }}>{badge.text}</span> : null}
                  <button type="button" disabled={busy} onClick={() => consumeStock(row)}>Consume</button>
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
            <input type="date" value={pantryForm.expiryDate} onChange={(event) => setPantryForm({ ...pantryForm, expiryDate: event.target.value })} />
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
        </div>
        <button type="button" disabled={busy} onClick={submitIntake}>Log intake</button>
        {intakeRows.map((row) => (
          <p key={row.id} style={{ margin: 0, color: '#666' }}>
            {row.intake_date}: {row.description} — {row.kcal ?? '—'} kcal
            {row.confidence === 'ESTIMATED' ? ' (estimated — confirm?)' : ''}
          </p>
        ))}

        <h2>Log spend</h2>
        <p style={{ margin: 0 }}>This week: <b>{money(weekSpendPence)}</b></p>
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
      </div>
    </main>
  );
}
