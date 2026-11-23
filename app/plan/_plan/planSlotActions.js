// app/plan/_plan/planSlotActions.js

import { dayLabel } from '../../../lib/dates';
import { swapMeal, markEatingOut, setPortions } from '../../../lib/actions';
import { signInAsDemo } from '../../../lib/demoLogin';

// KIMI NOTE: module split (2026-11-24) — verbatim from the single-file
// build; closures read the per-render deps bag (fresh every render, so
// no stale-closure change from the original component-scope functions).
export function createPlanSlotActions(deps) {
  const {
    eatingForm, outs, recipeByIdMap, refreshSlots,
    setDemoBusy, setDirty, setEatingForm, setError,
    setOuts, setSheetSearch, setSlotSheet, slotFor,
    slotSheet,
  } = deps;

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
  return { openSlotSheet, toggleOutSlot, openEatingForm, sheetSwap, sheetEatingOut, sheetPortions, onDemo };
}
