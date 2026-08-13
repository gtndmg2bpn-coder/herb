// lib/targets.js
// KIMI NOTE: pure function only — no React, no Supabase — so the arithmetic can be
// checked in isolation and stays builder-safe.
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function ageFromDob(dateOfBirth) {
  const birth = new Date(dateOfBirth);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return Math.max(0, age);
}

export function calculateTargets({
  sex,
  date_of_birth,
  height_cm,
  weight_kg,
  start_weight_kg,
  goal_weight_kg,
  activity_level,
}) {
  const age = ageFromDob(date_of_birth);
  const bmrWeight = Number(start_weight_kg ?? weight_kg);
  const heightCm = Number(height_cm);
  const goalWeightKg = Number(goal_weight_kg);
  const startWeightKg = Number(start_weight_kg ?? weight_kg);

  const base = 10 * bmrWeight + 6.25 * heightCm - 5 * age;
  let bmr;

  if (sex === 'male') {
    bmr = base + 5;
  } else if (sex === 'female') {
    bmr = base - 161;
  } else {
    // KIMI NOTE: neutral fallback for sex='other' uses the average of the male/female
    // constants: (+5 + -161) / 2 = -78.
    bmr = base - 78;
  }

  const multiplier = ACTIVITY_MULTIPLIERS[activity_level] ?? ACTIVITY_MULTIPLIERS.sedentary;
  const tdee = bmr * multiplier;

  let targetKcal = tdee;
  if (goalWeightKg < startWeightKg) targetKcal = tdee - 500;
  if (goalWeightKg > startWeightKg) targetKcal = tdee + 300;

  targetKcal = Math.round(targetKcal);
  // KIMI NOTE: hard floor at 1200 kcal so the calculator never returns a dangerously
  // low daily target, even for a large deficit from a low TDEE.
  if (targetKcal < 1200) targetKcal = 1200;

  const targetProteinG = Math.round(1.6 * bmrWeight);
  const proteinKcal = targetProteinG * 4;
  const carbKcal = 20 * 4;

  let targetFatG = Math.round((targetKcal - proteinKcal - carbKcal) / 9);
  // KIMI NOTE: if protein + fixed carbs already exceed the calorie target, fat is clamped
  // to 0 rather than returning a nonsensical negative macro target.
  if (targetFatG < 0) targetFatG = 0;

  return {
    target_kcal: targetKcal,
    target_protein_g: targetProteinG,
    target_carbs_g: 20,
    target_fat_g: targetFatG,
  };
}
