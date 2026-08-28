// test/generatePlan.test.js — run: node test/generatePlan.test.js
//
// Grades bridge items 4 and 5: generatePlan reading profiles.target_* and the
// macro-targeting selection built on top of it.
//
// The assertions below are written against the DESIGN CALLS, not against the
// implementation, so they stay meaningful if the internals are rewritten:
//
//   * carbs and protein bind DAILY, calories are a WEEKLY budget with a daily band
//   * the engine corrects by SWAPPING a dish, never by scaling a portion
//   * safety -> carb ceiling -> anti-waste -> protein floor -> kcal band -> cost
//   * fat gets no band, because targets.js already derives it as the residual
//
// Failure paths are graded as hard as happy ones, because the incident this
// whole area exists to prevent was a filter that was INERT rather than wrong.

const assert = require('assert');
const { generatePlan, addDays } = require('../lib/generatePlan');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}

const WEEK = '2026-09-07';                 // a Monday
const DAYS = Array.from({ length: 7 }, (_, i) => addDays(WEEK, i));
const ALL_MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner'];

// ---- fixture helpers ---------------------------------------------------------
// Everything a recipe row carries that the engine reads, macros included. Note
// carbs_g is passed through EXACTLY as given so a 0 can be distinguished from a
// null — that distinction is one of the things under test.
function recipe(id, over = {}) {
  return {
    id,
    name: id,
    protein_type: 'poultry',
    meal_types: ['lunch', 'dinner'],
    freezes: false,
    fresh_portions: 1,
    fresh_shelf_days: 0,
    cuisine: 'Anytime',
    dish_type: 'main',
    kcal: 400,
    protein_g: 30,
    carbs_g: 5,
    fat_g: 20,
    ...over,
  };
}
// The diet is DATA. 35 g is keto's number, not the engine's, so it arrives here
// exactly as get_plan_inputs will deliver it.
const KETO = { key: 'keto', label: 'Keto', carb_ceiling_g: 35, carb_aim_g: 28, source: 'diet' };
const NO_CEILING = { key: 'balanced', label: 'Balanced', carb_ceiling_g: null, carb_aim_g: null, source: 'diet' };
function constraints(over = {}) {
  return {
    meals_to_plan: ['lunch', 'dinner'],
    outs: [],
    batch_days: [],
    appetite: {},
    allergens: [],
    exclude_recipe_ids: [],
    guests: [],
    household: 1,
    diet: KETO,
    ...over,
  };
}
const TARGETS = { kcal: 1800, protein_g: 150, carbs_g: 28, fat_g: 100, source: 'profile' };
const run = (c, inv, recipes, seed = 7) =>
  generatePlan(c, inv, recipes, { weekStart: WEEK, seed });
const filled = (res) => res.slots.filter((s) => s.source !== 'out' && s.source !== 'empty');
const emptyN = (res) => res.slots.filter((s) => s.source === 'empty').length;
const said = (res, frag) => res.rationale.some((r) => r.toLowerCase().includes(frag.toLowerCase()));

console.log('\n-- targets absent: the engine must SAY so, not go quiet ----------------');

t('no targets at all: targeting off, and it says the week had none', () => {
  const res = run(constraints(), [], [recipe('a'), recipe('b')]);
  assert.strictEqual(res.macroSummary.targeting, false);
  assert.ok(said(res, 'without them'), 'rationale never mentions the missing targets');
});

t("source 'no_profile' and 'missing' are DIFFERENT sentences", () => {
  const noProf = run(constraints({ targets: { kcal: null, protein_g: null, source: 'no_profile' } }), [], [recipe('a')]);
  const missing = run(constraints({ targets: { kcal: null, protein_g: null, source: 'missing' } }), [], [recipe('a')]);
  assert.ok(said(noProf, 'no profile found'), 'no_profile did not report itself');
  assert.ok(said(missing, 'no calorie or protein target saved'), 'missing did not report itself');
  assert.notDeepStrictEqual(noProf.rationale[0], missing.rationale[0]);
});

t('half a target is not a target — kcal without protein turns targeting OFF', () => {
  const res = run(constraints({ targets: { kcal: 1800, protein_g: null, source: 'missing' } }), [], [recipe('a')]);
  assert.strictEqual(res.macroSummary.targeting, false);
});

t('targets present: the headline states all three numbers', () => {
  const res = run(constraints({ targets: TARGETS }), [], [recipe('a'), recipe('b')]);
  assert.strictEqual(res.macroSummary.targeting, true);
  assert.ok(/1800 kcal/.test(res.rationale[0]), res.rationale[0]);
  assert.ok(/150 g protein/.test(res.rationale[0]), res.rationale[0]);
  assert.ok(/35 g a day/.test(res.rationale[0]), res.rationale[0]);
});

console.log('\n-- the ceiling belongs to the DIET, not to the engine -------------------');

t('the ceiling comes from the diet row — change the row, change the plan', () => {
  const pool = [recipe('a', { carbs_g: 12 }), recipe('b', { carbs_g: 12 }), recipe('c', { carbs_g: 12 })];
  const at35 = run(constraints({ targets: TARGETS, diet: KETO }), [], pool);
  const at20 = run(constraints({ targets: TARGETS, diet: { ...KETO, carb_ceiling_g: 20 } }), [], pool);
  assert.strictEqual(at35.macroSummary.carb_ceiling_g, 35);
  assert.strictEqual(at20.macroSummary.carb_ceiling_g, 20);
  for (const d of at20.macroSummary.per_day) assert.ok(d.carbs_g <= 20, `${d.slot_date} = ${d.carbs_g}`);
  assert.ok(at20.macroSummary.carb_blocked_slots > at35.macroSummary.carb_blocked_slots,
    'a tighter ceiling did not bind harder');
});

t('a diet with NO ceiling applies none — and says so', () => {
  const pool = [recipe('a', { carbs_g: 60 }), recipe('b', { carbs_g: 60 })];
  const res = run(constraints({ targets: TARGETS, diet: NO_CEILING }), [], pool);
  assert.strictEqual(res.macroSummary.carb_ceiling_g, null);
  assert.strictEqual(res.macroSummary.carb_blocked_slots, 0);
  assert.ok(filled(res).length > 0, 'a 60 g dish was blocked on a diet with no ceiling');
  assert.ok(said(res, 'does not set one'), 'a diet with no ceiling never said so');
});

t('NO diet at all is loud, and never silently defaults to 35', () => {
  const pool = [recipe('a', { carbs_g: 60 }), recipe('b', { carbs_g: 60 })];
  const res = run(constraints({ targets: TARGETS, diet: null }), [], pool);
  assert.strictEqual(res.macroSummary.carb_ceiling_g, null,
    'a missing diet silently inherited keto’s ceiling');
  assert.ok(said(res, 'no diet is set'), 'a missing diet was not reported');
  assert.notStrictEqual(res.macroSummary.diet_source, 'diet');
});

t('"this diet has no ceiling" and "no diet found" are different sentences', () => {
  const none = run(constraints({ targets: TARGETS, diet: NO_CEILING }), [], [recipe('a')]);
  const missing = run(constraints({ targets: TARGETS, diet: null }), [], [recipe('a')]);
  assert.notStrictEqual(none.rationale[0], missing.rationale[0]);
});

t('the engine names no diet anywhere in its own vocabulary', () => {
  // A grep, deliberately. The moment the engine special-cases 'keto' it stops
  // being a planner and becomes a keto planner.
  const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/generatePlan.js'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/['"`]keto['"`]/i.test(code), 'the engine has a literal keto in its code');
  assert.ok(!/['"`]mediterranean['"`]/i.test(code), 'the engine has a literal diet name in its code');
});

t('a per-diet kcal band overrides the default', () => {
  const res = run(constraints({ targets: TARGETS, diet: { ...KETO, kcal_day_band: 0.2, kcal_week_band: 0.15 } }), [], [recipe('a')]);
  assert.strictEqual(res.macroSummary.kcal_day_band, 0.2);
  assert.strictEqual(res.macroSummary.kcal_week_band, 0.15);
});

console.log('\n-- the carb ceiling binds a DAY, never a dish --------------------------');

t('no single dish in the live book could ever trip a per-dish filter (19 g max)', () => {
  // The reason the ceiling is a running day budget and not a pool filter. A
  // 19 g dish passes alone and three of them do not.
  const pool = [recipe('a', { carbs_g: 19 }), recipe('b', { carbs_g: 19 }), recipe('c', { carbs_g: 19 })];
  const res = run(constraints({ targets: TARGETS }), [], pool);
  for (const d of res.macroSummary.per_day) {
    assert.ok(d.carbs_g <= 35, `${d.slot_date} reached ${d.carbs_g} g, over the ceiling`);
  }
});

t('five 10 g meals a day cannot all land — the 4th would be 40 g', () => {
  const pool = ALL_MEALS.map((m, i) =>
    recipe('r' + i, { carbs_g: 10, meal_types: [m === 'snack_am' || m === 'snack_pm' ? 'snack' : m] }));
  const res = run(constraints({ meals_to_plan: ALL_MEALS, targets: TARGETS }), [], pool);
  for (const d of res.macroSummary.per_day) {
    assert.ok(d.carbs_g <= 35, `${d.slot_date} reached ${d.carbs_g} g`);
    assert.ok(d.slots_filled <= 3, `${d.slot_date} filled ${d.slots_filled} slots at 10 g each`);
  }
  assert.ok(res.macroSummary.carb_blocked_slots > 0, 'nothing was reported as carb-blocked');
});

t('a carb-blocked slot is reported as SUCH, not as a variety failure', () => {
  // TWO 30 g dishes, deliberately. With one, dinner is refused by the
  // never-the-same-dish-twice-in-a-day rule BEFORE the ceiling is ever
  // consulted — a genuine variety failure that must not be mislabelled as a
  // carb one. The first draft of this test used one dish and caught exactly
  // that mislabelling risk in the test rather than in the engine.
  const pool = [recipe('a', { carbs_g: 30 }), recipe('b', { carbs_g: 30 })];
  const res = run(constraints({ targets: TARGETS }), [], pool);
  assert.ok(emptyN(res) > 0);
  assert.ok(res.macroSummary.carb_blocked_slots > 0, 'nothing counted as carb-blocked');
  assert.ok(said(res, 'carb ceiling was already spent'), 'the ceiling was never named as the reason');
});

t('a one-dish week empties on VARIETY, and is not mislabelled as a carb block', () => {
  const res = run(constraints({ targets: TARGETS }), [], [recipe('only', { carbs_g: 30 })]);
  assert.ok(emptyN(res) > 0);
  assert.strictEqual(res.macroSummary.carb_blocked_slots, 0,
    'a variety failure was reported as a carb failure');
  assert.ok(said(res, 'variety cap'));
});

t('the ceiling is never breached — no day reports over_carb_ceiling', () => {
  const pool = [recipe('a', { carbs_g: 12 }), recipe('b', { carbs_g: 13 }), recipe('c', { carbs_g: 14 })];
  const res = run(constraints({ meals_to_plan: ALL_MEALS, targets: TARGETS }), [],
    pool.map((r) => ({ ...r, meal_types: ['breakfast', 'snack', 'lunch', 'dinner'] })));
  assert.strictEqual(res.macroSummary.days_over_carb_ceiling, 0);
  assert.ok(!said(res, 'should not be possible'), 'the unreachable breach warning fired');
});

console.log('\n-- the tie-break: ceiling > anti-waste > band --------------------------');

t('the ceiling REFUSES a freezer portion — anti-waste does not override it', () => {
  const heavy = recipe('heavy', { carbs_g: 40, freezes: true });
  const inv = DAYS.map((d) => ({ recipe_id: 'heavy', location: 'freezer', quantity: 2, expiry_date: d }));
  const res = run(constraints({ targets: TARGETS }), inv, [heavy]);
  assert.strictEqual(filled(res).length, 0, 'a 40 g dish was pulled from the freezer under a 35 g ceiling');
});

t('the same freezer portion IS pulled once the ceiling allows it', () => {
  const ok = recipe('ok', { carbs_g: 12, freezes: true });
  const inv = DAYS.map((d) => ({ recipe_id: 'ok', location: 'freezer', quantity: 2, expiry_date: d }));
  const res = run(constraints({ targets: TARGETS }), inv, [ok]);
  assert.ok(filled(res).some((s) => s.source === 'freezer_pull'), 'nothing was pulled at 12 g');
});

t('anti-waste still chooses WHICH portion: soonest expiry first', () => {
  const a = recipe('soon', { carbs_g: 5, freezes: true });
  const b = recipe('later', { carbs_g: 5, freezes: true });
  const inv = [
    { recipe_id: 'later', location: 'freezer', quantity: 1, expiry_date: '2026-09-30' },
    { recipe_id: 'soon', location: 'freezer', quantity: 1, expiry_date: '2026-09-08' },
  ];
  const res = run(constraints({ targets: TARGETS }), inv, [a, b]);
  const pulls = filled(res).filter((s) => s.source === 'freezer_pull');
  assert.ok(pulls.length >= 1);
  assert.strictEqual(pulls[0].recipe_id, 'soon', 'the later-expiring portion was taken first');
});

console.log('\n-- null macros: the protein_type lesson, in the mirror ------------------');

t('0 g carbs is a REAL value and must not read as missing', () => {
  const res = run(constraints({ targets: TARGETS }), [], [recipe('zero', { carbs_g: 0 })]);
  assert.strictEqual(res.macroSummary.recipes_without_macros, 0,
    'a 0 g dish was counted as having no macros — falsiness used where == null was needed');
  assert.ok(filled(res).length > 0, 'a 0 g carb dish should always fit');
});

t('null macros are COUNTED and reported, never silently waved through', () => {
  const res = run(constraints({ targets: TARGETS }), [],
    [recipe('unknown', { carbs_g: null, kcal: null })]);
  assert.strictEqual(res.macroSummary.recipes_without_macros, 1);
  assert.ok(said(res, 'no macros recorded'), 'the inert-filter count was never reported');
});

t('a dish with unknown macros still gets planned — it degrades, it does not blank the week', () => {
  const res = run(constraints({ targets: TARGETS }), [],
    [recipe('unknown', { carbs_g: null, kcal: null })]);
  assert.ok(filled(res).length > 0);
});

console.log('\n-- protein is a FLOOR, kcal is a BAND ----------------------------------');

t('a very high protein dish is never rejected for excess', () => {
  const res = run(constraints({ targets: TARGETS }), [], [recipe('big', { protein_g: 82, carbs_g: 2 })]);
  assert.ok(filled(res).length > 0, 'an 82 g protein dish was excluded');
});

t('days short of the protein floor are counted and named', () => {
  const res = run(constraints({ targets: TARGETS }), [], [recipe('lean', { protein_g: 3, carbs_g: 1 })]);
  assert.ok(res.macroSummary.days_under_protein > 0);
  assert.ok(said(res, 'protein floor'));
});

t('the week reports its average kcal against target, in band or out', () => {
  const res = run(constraints({ targets: TARGETS }), [], [recipe('a', { kcal: 400, carbs_g: 2 })]);
  assert.ok(typeof res.macroSummary.avg_daily_kcal === 'number');
  assert.ok(said(res, 'the week averages'));
  assert.strictEqual(typeof res.macroSummary.week_in_band, 'boolean');
});

t('fat carries no band — it is the residual and is never a reason to reject', () => {
  const greasy = recipe('greasy', { fat_g: 400, carbs_g: 2 });
  const res = run(constraints({ targets: TARGETS }), [], [greasy]);
  assert.ok(filled(res).length > 0, 'a dish was rejected on fat, which has no band by design');
  assert.strictEqual(res.macroSummary.kcal_day_band, 0.10);
  assert.strictEqual(res.macroSummary.kcal_week_band, 0.05);
});

console.log('\n-- the day ledger counts ONE portion, not slot.portions -----------------');

t('a guest slot feeds 3 but only ONE portion hits the macro budget', () => {
  const r = recipe('a', { kcal: 500, protein_g: 40, carbs_g: 5 });
  const c = constraints({
    meals_to_plan: ['dinner'],
    targets: TARGETS,
    guests: [{ date: DAYS[0], meal: 'dinner', count: 2 }],
  });
  const res = run(c, [], [r]);
  const day0 = res.macroSummary.per_day.find((d) => d.slot_date === DAYS[0]);
  const slot0 = res.slots.find((s) => s.slot_date === DAYS[0] && s.meal === 'dinner');
  assert.strictEqual(slot0.portions, 3, 'the guest slot should still cook for 3');
  assert.strictEqual(day0.kcal, 500, `the budget counted ${day0.kcal} — it charged the guests to the user`);
});

console.log('\n-- swap, never scale ---------------------------------------------------');

t('no slot is ever given a fractional portion to hit a number', () => {
  const pool = [recipe('a', { kcal: 900, carbs_g: 4 }), recipe('b', { kcal: 200, carbs_g: 4 })];
  const res = run(constraints({ meals_to_plan: ALL_MEALS, targets: TARGETS }), [],
    pool.map((r) => ({ ...r, meal_types: ['breakfast', 'snack', 'lunch', 'dinner'] })));
  for (const s of res.slots) {
    assert.ok(Number.isInteger(s.portions) && s.portions > 0,
      `slot ${s.slot_date}/${s.meal} carries portions=${s.portions}`);
  }
});

console.log('\n-- determinism and no-regression --------------------------------------');

t('same seed + same inputs + targeting on = identical plan', () => {
  const pool = [recipe('a', { carbs_g: 6 }), recipe('b', { carbs_g: 7 }), recipe('c', { carbs_g: 8 })];
  const one = run(constraints({ targets: TARGETS }), [], pool, 42);
  const two = run(constraints({ targets: TARGETS }), [], pool, 42);
  assert.deepStrictEqual(one.slots, two.slots);
  assert.deepStrictEqual(one.macroSummary, two.macroSummary);
});

t('targeting OFF leaves the plan byte-identical to the same run with no targets key', () => {
  const pool = [recipe('a', { carbs_g: 6 }), recipe('b', { carbs_g: 7 })];
  const noKey = run(constraints(), [], pool, 3);
  const nullTargets = run(constraints({ targets: { kcal: null, protein_g: null, source: 'missing' } }), [], pool, 3);
  assert.deepStrictEqual(noKey.slots, nullTargets.slots,
    'a null-target week planned differently from a no-target week');
});

t('macroSummary is always present, even with targeting off', () => {
  const res = run(constraints(), [], [recipe('a')]);
  assert.ok(res.macroSummary, 'the plan screen has nothing to render');
  assert.strictEqual(res.macroSummary.carb_ceiling_g, 35);
});

console.log('\n-- safety still outranks everything ------------------------------------');

t('an allergen is excluded even when it is the only dish that fits the macros', () => {
  const perfect = recipe('perfect', { kcal: 360, protein_g: 30, carbs_g: 1, allergens: ['dairy'] });
  const res = run(constraints({ targets: TARGETS, allergens: ['dairy'] }), [], [perfect]);
  assert.strictEqual(filled(res).length, 0, 'an allergen was planned because it fitted the macros');
  assert.ok(said(res, 'excluded by allergens'));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
