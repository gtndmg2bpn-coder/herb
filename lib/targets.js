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
// Pace maps to a FLAT daily calorie deficit (kcal/day). The deficit is held flat until
// the intake floor starts to bite — no percent-of-bodyweight tapering. 'faster' (1000)
// is the effective maximum deficit; the old weekly-loss-rate model is retired.
const PACE_DAILY_DEFICIT_KCAL = {
  steady: 500,
  moderate: 750,
  faster: 1000,
};
// Absolute hard floor for the daily target, kcal. The working intake floor is
// max(BMR, MIN_TARGET_KCAL): the plan will not drive intake below the user's own BMR,
// and never below 1200 for anyone.
const MIN_TARGET_KCAL = 1200;
// Daily carb target (g). Low-carb rather than strict keto: the plan AIMS here. The
// per-day carb CEILING (35 g) is a planner constraint wired with macro-targeting — it
// has no home in this pure calculator yet, so only the aim lives here for now.
const TARGET_CARBS_G = 28;

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
  pace,
  avg_daily_burn_kcal,
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
  const avgDailyBurnKcal = Number(avg_daily_burn_kcal);

  // KIMI NOTE: a supplied average daily burn below BMR is implausible as a true TDEE
  // (usually active-only calories entered as total burn), so it is ignored and the
  // activity multiplier is used instead. Everything downstream is unchanged.
  let tdee = bmr * multiplier;
  if (Number.isFinite(avgDailyBurnKcal) && avgDailyBurnKcal > 0 && avgDailyBurnKcal >= bmr) {
    tdee = avgDailyBurnKcal;
  }

  let targetKcal = tdee;
  if (goalWeightKg < startWeightKg) {
    // FLAT deficit by pace, eased only by the intake floor. The full pace deficit is
    // applied while there is room above the floor; once (tdee - chosen deficit) would
    // fall below max(BMR, 1200), the deficit shrinks so intake lands exactly on the floor
    // rather than below it. A heavier user stays on the full deficit; the taper appears
    // only near the bottom and is driven by BMR, not bodyweight. Note: once the floor
    // binds, pace no longer changes the target — everyone converges on eating at BMR.
    const chosenDeficit = PACE_DAILY_DEFICIT_KCAL[pace] ?? PACE_DAILY_DEFICIT_KCAL.steady;
    const intakeFloor = Math.max(bmr, MIN_TARGET_KCAL);
    const deficit = Math.max(0, Math.min(chosenDeficit, tdee - intakeFloor));
    targetKcal = tdee - deficit;
  } else if (goalWeightKg > startWeightKg) {
    targetKcal = tdee + 300;
  }

  targetKcal = Math.round(targetKcal);
  // Final backstop: never below the absolute floor. Redundant for a loss goal (the intake
  // floor already guarantees this) but protects maintenance/gain and any small-TDEE edge.
  if (targetKcal < MIN_TARGET_KCAL) targetKcal = MIN_TARGET_KCAL;

  // Protein anchored to 2.0 g per kg of the driver weight (current weight on recalc,
  // start weight at onboarding). No goal-weight floor and no age step-up: the target
  // tracks body weight all the way down by design.
  const targetProteinG = Math.round(2.0 * bmrWeight);
  const proteinKcal = targetProteinG * 4;
  const carbKcal = TARGET_CARBS_G * 4;

  let targetFatG = Math.round((targetKcal - proteinKcal - carbKcal) / 9);
  // KIMI NOTE: if protein + fixed carbs already exceed the calorie target, fat is clamped
  // to 0 rather than returning a nonsensical negative macro target.
  if (targetFatG < 0) targetFatG = 0;

  return {
    target_kcal: targetKcal,
    target_protein_g: targetProteinG,
    target_carbs_g: TARGET_CARBS_G,
    target_fat_g: targetFatG,
  };
}
