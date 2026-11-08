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

// ── Diet modes (Karum, 8 Nov 2026; evidence: HERB_Evidence_Diet_Modes_20261108) ──
// Protein is the same g/kg in every mode. If BMI is over 30 it is worked on goal
// weight, otherwise a 120 kg user would be set 216 g.
const PROTEIN_G_PER_KG = 1.8;
const BMI_PROTEIN_ON_GOAL = 30;
// Muscle gain: maintenance + 300 kcal (lean bulk, ~1% body weight a month).
const MUSCLE_SURPLUS_KCAL = 300;
// Steps and gym REPLACE the activity multiplier; they never add to it.
// Baseline BMR x 1.2 covers digestion and basic living. Burns are NET (MET - 1).
const BASELINE_MULTIPLIER = 1.2;
const STEP_KCAL_PER_KG_PER_1000 = 0.45; // Compendium 2024, 3.0-3.8 MET walking
const GYM_KCAL_PER_KG_PER_HOUR = 2.5;   // Compendium 02054, 3.5 MET, 60 min session
// Modes with no carb aim (deficit, gut, muscle): fat is set at this share of kcal
// and carbs take the remainder. PROPOSED, awaiting Karum's yes (impact note Q8).
const NON_KETO_FAT_SHARE = 0.3;
// UK guideline (SACN 2015), all adults; surfaced in gut-health mode.
const TARGET_FIBRE_G = 30;

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
  mode = 'keto',
  carb_aim_g,
  avg_daily_steps,
  gym_sessions_per_week,
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
  // Steps/gym path replaces the multiplier, but only when the user has answered it.
  // Profiles without it (and the public reference adult) keep the legacy multiplier,
  // so nobody's numbers jump overnight and REFERENCE_FACTOR stays at 0.8395.
  const steps = avg_daily_steps == null || avg_daily_steps === '' ? null : Number(avg_daily_steps);
  const gym = gym_sessions_per_week == null || gym_sessions_per_week === '' ? null : Number(gym_sessions_per_week);
  const hasActivityBurn = Number.isFinite(steps) || Number.isFinite(gym);
  let tdee;
  if (hasActivityBurn) {
    const stepKcal = Number.isFinite(steps) ? STEP_KCAL_PER_KG_PER_1000 * bmrWeight * (Math.max(0, steps) / 1000) : 0;
    const gymKcal = Number.isFinite(gym) ? (GYM_KCAL_PER_KG_PER_HOUR * bmrWeight * Math.max(0, gym)) / 7 : 0;
    tdee = bmr * BASELINE_MULTIPLIER + stepKcal + gymKcal;
  } else {
    tdee = bmr * multiplier;
  }
  if (Number.isFinite(avgDailyBurnKcal) && avgDailyBurnKcal > 0 && avgDailyBurnKcal >= bmr) {
    tdee = avgDailyBurnKcal;
  }

  let targetKcal = tdee;
  if (mode === 'muscle') {
    // Muscle gain is a surplus whatever the goal weight says.
    targetKcal = tdee + MUSCLE_SURPLUS_KCAL;
  } else if (goalWeightKg < startWeightKg) {
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
    targetKcal = tdee + MUSCLE_SURPLUS_KCAL;
  }

  targetKcal = Math.round(targetKcal);
  // Final backstop: never below the absolute floor. Redundant for a loss goal (the intake
  // floor already guarantees this) but protects maintenance/gain and any small-TDEE edge.
  if (targetKcal < MIN_TARGET_KCAL) targetKcal = MIN_TARGET_KCAL;

  // Protein: 1.8 g/kg of the driver weight (current weight on recalc, start weight at
  // onboarding) in every mode. BMI over 30 -> goal weight, when the goal is lower.
  let proteinWeight = bmrWeight;
  const bmi = heightCm > 0 ? bmrWeight / ((heightCm / 100) ** 2) : null;
  if (bmi != null && bmi > BMI_PROTEIN_ON_GOAL && goalWeightKg > 0 && goalWeightKg < bmrWeight) {
    proteinWeight = goalWeightKg;
  }
  const targetProteinG = Math.round(PROTEIN_G_PER_KG * proteinWeight);
  const proteinKcal = targetProteinG * 4;

  // Carbs: keto (and any diet with an aim) pins carbs and fat is the remainder.
  // Modes with no aim: fat at a fixed share of kcal, carbs the remainder.
  const aim = carb_aim_g === undefined ? (mode === 'keto' ? TARGET_CARBS_G : null) : carb_aim_g;
  let targetCarbsG;
  let targetFatG;
  if (aim != null && Number.isFinite(Number(aim))) {
    targetCarbsG = Math.round(Number(aim));
    targetFatG = Math.round((targetKcal - proteinKcal - targetCarbsG * 4) / 9);
  } else {
    targetFatG = Math.round((targetKcal * NON_KETO_FAT_SHARE) / 9);
    targetCarbsG = Math.round((targetKcal - proteinKcal - targetFatG * 9) / 4);
    if (targetCarbsG < 0) targetCarbsG = 0;
  }
  // KIMI NOTE: if protein + fixed carbs already exceed the calorie target, fat is clamped
  // to 0 rather than returning a nonsensical negative macro target.
  if (targetFatG < 0) targetFatG = 0;

  return {
    target_kcal: targetKcal,
    target_protein_g: targetProteinG,
    target_carbs_g: targetCarbsG,
    target_fat_g: targetFatG,
    target_fibre_g: TARGET_FIBRE_G,
  };
}
