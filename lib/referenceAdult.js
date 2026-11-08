// lib/referenceAdult.js
//
// Karum, 8 Nov 2026: public figures are sized for an 80 kg adult — "what a person
// should be eating" — and say so. Logged-in personal sizing comes later (spec v2 §7).
//
// The 55 recipes were written against KDogg's targets (2000 kcal / 183 g protein).
// The reference adult's daily target comes from lib/targets.js — the ONE place target
// maths lives — and every public figure is scaled by refKcal / BASE_KCAL.
//
// Display only: stored recipe quantities and macros are not changed.
import { calculateTargets } from './targets';

export const REFERENCE_WEIGHT_KG = 80;
export const BASE_KCAL = 2000; // the daily target the recipe book was written to

// A neutral 80 kg adult losing weight at the steady pace. Height and age are the
// round middle of UK adults; sex 'other' uses targets.js's averaged constant.
const REFERENCE_PROFILE = {
  sex: 'other',
  date_of_birth: `${new Date().getFullYear() - 40}-01-01`,
  height_cm: 170,
  weight_kg: REFERENCE_WEIGHT_KG,
  start_weight_kg: REFERENCE_WEIGHT_KG,
  goal_weight_kg: REFERENCE_WEIGHT_KG - 5,
  activity_level: 'light',
  pace: 'steady',
};

export const referenceTargets = calculateTargets(REFERENCE_PROFILE);
export const REFERENCE_FACTOR = referenceTargets.target_kcal / BASE_KCAL;

const r0 = (n) => (n == null ? null : Math.round(Number(n) * REFERENCE_FACTOR));
const r1 = (n) => (n == null ? null : Math.round(Number(n) * REFERENCE_FACTOR * 10) / 10);

export function scaleRecipe(recipe) {
  if (!recipe) return recipe;
  return {
    ...recipe,
    kcal: r0(recipe.kcal),
    protein_g: r0(recipe.protein_g),
    carbs_g: r1(recipe.carbs_g),
    fat_g: r1(recipe.fat_g),
    fibre_g: r1(recipe.fibre_g),
  };
}

export function scaleCost(costGbp) {
  if (costGbp == null) return null;
  return Math.round(Number(costGbp) * REFERENCE_FACTOR * 100) / 100;
}

// Ingredient amounts: weighed lines to a sensible step, never below 1.
// Counted lines (eggs, sausages) are rounded to whole items by countItems at display.
export function scaleQuantity(quantity, unit) {
  const q = Number(quantity) * REFERENCE_FACTOR;
  if (!Number.isFinite(q)) return quantity;
  if (unit === 'unit') return Math.max(0.5, Math.round(q * 2) / 2);
  if (q >= 20) return Math.round(q / 5) * 5;
  return Math.max(1, Math.round(q));
}

export const REFERENCE_LABEL = `Sized for an ${REFERENCE_WEIGHT_KG} kg adult`;
