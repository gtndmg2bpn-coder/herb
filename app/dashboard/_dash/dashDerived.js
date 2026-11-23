// app/dashboard/_dash/dashDerived.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { buildChart } from './dashShared';

export function computeDashDerived(data) {
  const weekSpendPence = data.spendRows.reduce((sum, row) => sum + (row.amount_pence || 0), 0);
  // KIMI NOTE: category split is display-only (Slice 1 — Sundries). weekSpendPence
  // stays the full logged total; groceries/sundries are subsets of it, so
  // weekTotalPence below is computed exactly as before.
  const grocerySpendPence = data.spendRows
    .filter((row) => row.category === 'grocery')
    .reduce((sum, row) => sum + (row.amount_pence || 0), 0);
  const sundrySpendPence = data.spendRows
    .filter((row) => row.category === 'sundry')
    .reduce((sum, row) => sum + (row.amount_pence || 0), 0);
  const eatingOutPence = data.planSlots
    .filter((slot) => slot.eating_out)
    .reduce((sum, slot) => sum + (slot.est_cost_pence || 0), 0);
  const offPlanPence = data.weekIntakeRows
    .filter((row) => row.source !== 'planned')
    .reduce((sum, row) => sum + (row.cost_pence || 0), 0);
  const weekTotalPence = weekSpendPence + eatingOutPence + offPlanPence;
  // The cost of eating: what you actually consumed from planned meals.
  const eatenPence = data.weekIntakeRows
    .filter((row) => row.source === 'planned')
    .reduce((sum, row) => sum + (row.cost_pence || 0), 0);
  // The cost of binning: food you paid for but threw away.
  const binnedPence = data.wasteRows.reduce((sum, row) => sum + (row.cost_pence || 0), 0);

  const weightHistory = data.weightRows.map((row) => Number(row.weight_kg));
  const goalKg = data.profile?.goal_weight_kg != null ? Number(data.profile.goal_weight_kg) : null;
  const chart = weightHistory.length >= 2 ? buildChart(weightHistory, goalKg) : null;

  return {
    weekSpendPence,
    grocerySpendPence,
    sundrySpendPence,
    eatingOutPence,
    offPlanPence,
    weekTotalPence,
    eatenPence,
    binnedPence,
    weightHistory,
    goalKg,
    chart,
  };
}
