// app/dashboard/_dash/dashActions.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { getBrowserClient } from '../../../lib/supabaseBrowser';
import { swapMeal, markEatingOut, setPortions, consumePantryItem, logSpend, logOffPlanIntake, logWeight, commitTargets } from '../../../lib/actions';
import { recalcTargets } from '../../../lib/recalcTargets';
import { dayLabel } from '../../../lib/dates';
import { money, poundsToPence, optionalNumber, formatWeight } from './dashShared';

export function createDashActions(deps) {
  const { allergensByRecipe, chooser, eatingForm, householdPortions, ingredientById, ingredientsByRecipe, intakeForm, loadAll, profile, proposal, recipes, session, setBusy, setChooser, setEatingForm, setError, setIntakeForm, setNotice, setProposal, setProposalError, setSpendForm, setWeightInput, setWeightPounds, setWeightStones, spendForm, weightInput, weightPounds, weightRows, weightStones } = deps;

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
    if (!window.confirm(message)) return false;
    setBusy(true);
    setError('');
    const { error: actionError } = await action();
    if (actionError) setError(actionError.message);
    await refreshAfterAction();
    setBusy(false);
    return !actionError;
  }

  // Confirm tap on the proposal card — the ONLY target write in the app. Commits via
  // the actions layer (commit_targets RPC); keeps the card open on error so it can retry.
  async function confirmProposal() {
    if (!proposal) return;
    setBusy(true);
    setProposalError('');
    const { error: commitErr } = await commitTargets({
      kcal: proposal.new.target_kcal,
      proteinG: proposal.new.target_protein_g,
      carbsG: proposal.new.target_carbs_g,
      fatG: proposal.new.target_fat_g,
    });
    if (commitErr) {
      setProposalError(commitErr.message);
      setBusy(false);
      return;
    }
    setProposal(null);
    await refreshAfterAction();
    setBusy(false);
    setNotice('Targets updated.');
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

  // KIMI NOTE: cuisine like/dislike pills (Karum, 16 Nov 2026). Like and Dislike
  // are mutually exclusive — ticking one removes the other ("like wins" if a row
  // ever held both, the same write-time ruling as onboarding). Same saveProfile
  // write path as the allergen pills. Disliked cuisines hard-exclude from the
  // planner and the swap chooser; liked ones soft-steer planning.
  function toggleCuisine(cuisine, kind) {
    const liked = new Set(profile?.liked_cuisines || []);
    const disliked = new Set(profile?.disliked_cuisines || []);
    if (kind === 'like') {
      if (liked.has(cuisine)) liked.delete(cuisine);
      else { liked.add(cuisine); disliked.delete(cuisine); }
    } else {
      if (disliked.has(cuisine)) disliked.delete(cuisine);
      else { disliked.add(cuisine); liked.delete(cuisine); }
    }
    saveProfile({ liked_cuisines: [...liked], disliked_cuisines: [...disliked] });
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
    // KIMI NOTE: disliked cuisines are a HARD exclusion, allergen-style (Karum,
    // 16 Nov 2026) — a recipe whose cuisine is disliked never appears in the swap
    // chooser. Untagged/'Anytime' recipes have no cuisine to match, so they pass.
    const dislikedCuisines = new Set(profile?.disliked_cuisines || []);

    const afterCurrent = recipes.filter((recipe) => recipe.id !== currentRecipeId);
    const noDislike = afterCurrent.filter((recipe) => !disliked.has(recipe.id));
    const safe = noDislike
      .filter((recipe) => !(allergensByRecipe[recipe.id] || []).some((allergen) => userAllergens.has(allergen)));
    const noCuisineDislike = safe.filter((recipe) => !dislikedCuisines.has(recipe.cuisine));
    const noIngDislike = noCuisineDislike.filter((recipe) => {
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
      hiddenCuisines: safe.length - noCuisineDislike.length,
      hiddenIngDislikes: noCuisineDislike.length - noIngDislike.length,
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
      if (String(weightStones).trim() === '' && String(weightPounds).trim() === '') return; // empty — stray tap, do nothing
      const stones = Number(weightStones || 0);
      const pounds = Number(weightPounds || 0);
      if (!Number.isFinite(stones) || !Number.isFinite(pounds) || stones < 0 || pounds < 0 || pounds >= 14 || (stones === 0 && pounds === 0)) {
        setError('Enter stones and pounds (pounds under 14).');
        return;
      }
      weightKg = Math.round((stones * 14 + pounds) * 0.45359237 * 100) / 100;
    } else {
      const raw = String(weightInput).replace(',', '.').trim();
      if (raw === '') return; // empty field (e.g. a stray second tap after a successful log) — do nothing
      weightKg = Number(raw);
      if (!Number.isFinite(weightKg) || weightKg <= 0) {
        setError('Weight must be a positive number.');
        return;
      }
    }
    const logged = await runAction(`Log ${formatWeight(weightKg, profile?.preferred_units)}?`, () => logWeight({ weightKg }));
    setWeightInput('');
    setWeightStones('');
    setWeightPounds('');
    if (!logged) return;

    // Propose-only recalc. Build the readings synchronously from the value just logged
    // (prepended to the pre-refresh history) so we don't race the state refresh. The
    // brain writes nothing; a real change opens the card, otherwise a quiet toast.
    const readings = [{ weight_kg: weightKg, created_at: new Date().toISOString() }, ...weightRows];
    const result = recalcTargets({ profile, readings });
    if (result.status === 'PROPOSE' || result.status === 'GOAL_REACHED') {
      setProposalError('');
      setProposal(result);
    } else {
      setNotice('Logged. Targets unchanged.');
    }
  }

  return {
    refreshAfterAction,
    runAction,
    confirmProposal,
    saveProfile,
    toggleAllergen,
    toggleCuisine,
    addDislikedIngredient,
    removeDislikedIngredient,
    openChooser,
    chooseSwap,
    submitEatingOut,
    editPortions,
    submitIntake,
    submitSpend,
    submitWeight,
  };
}
