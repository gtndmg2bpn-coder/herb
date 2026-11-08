// lib/targets.test.js — run: node lib/targets.test.js
//
// Diet modes (Karum, 8 Nov 2026; HERB_Evidence_Diet_Modes_20261108):
//   protein 1.8 g/kg in every mode, goal weight if BMI > 30;
//   steps and gym REPLACE the activity multiplier; muscle = maintenance + 300.
// Plus the guard that keeps every public figure still: the reference adult's factor.

const assert = require('assert');

(async () => {
  const { calculateTargets } = await import('./targets.js');

  let passed = 0;
  let failed = 0;
  function t(name, fn) {
    try { fn(); passed += 1; } catch (e) { failed += 1; console.error(`FAIL ${name}\n  ${e.message}`); }
  }

  const dob40 = `${new Date().getFullYear() - 40}-01-01`;
  const base = {
    sex: 'male', date_of_birth: dob40, height_cm: 180,
    weight_kg: 80, start_weight_kg: 80, goal_weight_kg: 80,
    activity_level: 'sedentary', pace: 'steady',
  };
  // BMR, male 80 kg 180 cm age 40: 800 + 1125 - 200 + 5 = 1730
  const BMR = 1730;

  // ── Reference adult: must stay at 0.8395, or every public kcal, gram and £ moves.
  const REFERENCE_PROFILE = {
    sex: 'other', date_of_birth: dob40, height_cm: 170,
    weight_kg: 80, start_weight_kg: 80, goal_weight_kg: 75,
    activity_level: 'light', pace: 'steady',
  };
  t('reference adult target is 1679 kcal (factor 0.8395)', () => {
    const r = calculateTargets(REFERENCE_PROFILE);
    assert.strictEqual(r.target_kcal, 1679);
    assert.strictEqual(r.target_kcal / 2000, 0.8395);
  });

  // ── Protein
  t('protein is 1.8 g/kg', () => assert.strictEqual(calculateTargets(base).target_protein_g, 144));
  t('protein is the same in every mode', () => {
    for (const mode of ['keto', 'deficit', 'gut', 'muscle']) {
      assert.strictEqual(calculateTargets({ ...base, mode }).target_protein_g, 144, mode);
    }
  });
  t('BMI over 30 works protein on goal weight', () => {
    // KDogg-shaped: 93.9 kg, 173 cm (BMI 31.4), goal 73 -> 1.8 x 73 = 131
    const r = calculateTargets({ ...base, height_cm: 173, weight_kg: 93.9, start_weight_kg: 93.9, goal_weight_kg: 73 });
    assert.strictEqual(r.target_protein_g, 131);
  });
  t('BMI 30 or under stays on current weight', () => {
    const r = calculateTargets({ ...base, goal_weight_kg: 70 }); // BMI 24.7
    assert.strictEqual(r.target_protein_g, 144);
  });
  t('BMI over 30 with a higher goal stays on current weight', () => {
    const r = calculateTargets({ ...base, height_cm: 160, goal_weight_kg: 90 }); // BMI 31.25
    assert.strictEqual(r.target_protein_g, 144);
  });

  // ── Activity: steps and gym REPLACE the multiplier
  t('no steps/gym answer keeps the legacy multiplier', () => {
    assert.strictEqual(calculateTargets({ ...base, activity_level: 'moderate' }).target_kcal, Math.round(BMR * 1.55));
  });
  t('steps replace the multiplier, never add to it', () => {
    // 1730 x 1.2 + 0.45 x 80 x 10 = 2076 + 360 = 2436, even with activity 'active' set
    const r = calculateTargets({ ...base, activity_level: 'active', avg_daily_steps: 10000 });
    assert.strictEqual(r.target_kcal, 2436);
  });
  t('gym sessions add 2.5 x kg per session, averaged over the week', () => {
    // 2076 + (2.5 x 80 x 3) / 7 = 2076 + 85.7 = 2162
    const r = calculateTargets({ ...base, gym_sessions_per_week: 3 });
    assert.strictEqual(r.target_kcal, 2162);
  });
  t('zero steps and zero gym is BMR x 1.2', () => {
    assert.strictEqual(calculateTargets({ ...base, avg_daily_steps: 0, gym_sessions_per_week: 0 }).target_kcal, 2076);
  });

  // ── Muscle gain
  t('muscle gain is maintenance + 300 whatever the goal weight', () => {
    const r = calculateTargets({ ...base, mode: 'muscle', goal_weight_kg: 75, avg_daily_steps: 10000 });
    assert.strictEqual(r.target_kcal, 2736);
  });
  t('deficit mode with a lower goal applies the pace deficit', () => {
    const r = calculateTargets({ ...base, mode: 'deficit', goal_weight_kg: 75, avg_daily_steps: 10000 });
    assert.strictEqual(r.target_kcal, 2436 - 500);
  });

  // ── Carbs and fat
  t('keto pins carbs at 28 and fat is the remainder', () => {
    const r = calculateTargets({ ...base, mode: 'keto' });
    assert.strictEqual(r.target_carbs_g, 28);
    assert.strictEqual(r.target_fat_g, Math.round((r.target_kcal - 144 * 4 - 28 * 4) / 9));
  });
  t('a diet row carb aim overrides the keto default', () => {
    assert.strictEqual(calculateTargets({ ...base, mode: 'keto', carb_aim_g: 25 }).target_carbs_g, 25);
  });
  t('non-keto: fat 30% of kcal, carbs take the rest', () => {
    const r = calculateTargets({ ...base, mode: 'deficit', carb_aim_g: null });
    const kcal = r.target_kcal;
    assert.strictEqual(r.target_fat_g, Math.round((kcal * 0.3) / 9));
    assert.strictEqual(r.target_carbs_g, Math.round((kcal - 144 * 4 - r.target_fat_g * 9) / 4));
    assert.ok(r.target_carbs_g > 100, `carbs ${r.target_carbs_g}`);
  });
  t('macros add back to kcal within rounding', () => {
    for (const mode of ['keto', 'deficit', 'gut', 'muscle']) {
      const r = calculateTargets({ ...base, mode, avg_daily_steps: 8000 });
      const sum = r.target_protein_g * 4 + r.target_carbs_g * 4 + r.target_fat_g * 9;
      assert.ok(Math.abs(sum - r.target_kcal) <= 10, `${mode}: ${sum} vs ${r.target_kcal}`);
    }
  });
  t('fibre target is 30 g', () => assert.strictEqual(calculateTargets(base).target_fibre_g, 30));

  // ── Floors still hold
  t('never below 1200 kcal', () => {
    const r = calculateTargets({ ...base, sex: 'female', weight_kg: 45, start_weight_kg: 45, goal_weight_kg: 40, height_cm: 150, pace: 'faster' });
    assert.ok(r.target_kcal >= 1200);
  });

  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
