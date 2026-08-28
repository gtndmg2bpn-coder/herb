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
// n DISTINCT recipes. A fixture of two dishes can only ever fill four lunch and
// dinner slots in a week — SLOTS_PER_RECIPE_CAP is 2 — so a test about what a
// FULL day looks like needs a pool big enough to fill one.
const pool = (n, over = {}) => Array.from({ length: n }, (_, i) => recipe('p' + i, over));
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

t('a day just under the floor counts as MET — a 5% tolerance, not a binary', () => {
  // The live week reported "6 days fall short" for days of 179 and 180 against
  // 183. True, and useless. Within tolerance is hit.
  // 2 slots x 74 g = 148 against a 150 g floor: 1.3% under, which is hit.
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS }), [],
    pool(14, { protein_g: 74, carbs_g: 1, kcal: 500 }));
  const day = res.macroSummary.per_day[0];
  assert.strictEqual(day.slots_filled, 2, 'the fixture did not fill the day');
  assert.strictEqual(day.protein_g, 148);
  assert.strictEqual(day.protein_met, true, '148 of 150 was reported as a miss');
  assert.strictEqual(day.protein_short_g, 2, 'the gap itself must still be carried');
  assert.strictEqual(res.macroSummary.days_under_protein, 0);
});

t('a day well under the floor is still a miss, with the gap in grams', () => {
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS }), [],
    pool(14, { protein_g: 20, carbs_g: 1 }));
  const day = res.macroSummary.per_day[0];
  assert.strictEqual(day.protein_met, false);
  assert.strictEqual(day.protein_short_g, 110);          // 150 - 40
  assert.ok(res.macroSummary.worst_protein_short_g >= 110);
  assert.ok(said(res, 'the worst by'), 'the size of the worst miss was never named');
});

t('all days inside tolerance still says so — silence reads like no check ran', () => {
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS }), [],
    pool(14, { protein_g: 74, carbs_g: 1 }));
  assert.strictEqual(res.macroSummary.days_under_protein, 0);
  assert.ok(said(res, 'within 5%'), 'a week that just clears the floor said nothing about it');
});

t('the tolerance is reported, not hidden in the engine', () => {
  const res = run(constraints({ targets: TARGETS }), [], [recipe('a')]);
  assert.strictEqual(res.macroSummary.protein_floor_tolerance, 0.05);
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

console.log('\n-- the fat lever: three gates, added after the first live week ----------');

const LEVER = { ...KETO, fat_lever: { label: 'olive oil', kcal_per_g: 8.84, max_g_per_slot: 15 } };
// 5 kcal/g of protein-free filler is not a thing; these fixtures just need
// numbers that put a day above or below the band on purpose.
const big  = (id) => recipe(id, { kcal: 700, protein_g: 40, carbs_g: 2 });
const smal = (id) => recipe(id, { kcal: 200, protein_g: 40, carbs_g: 2 });

t('GATE 1: a low day inside a week that is ON TARGET gets no oil', () => {
  // Calories are a WEEKLY budget. A dip balanced by a peak needs nothing, and
  // topping it up would push the week further over.
  const rich = Array.from({ length: 14 }, (_, i) => recipe('r' + i, { kcal: 1000, protein_g: 80, carbs_g: 2 }));
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS, diet: LEVER }), [], rich);
  assert.ok(res.macroSummary.avg_daily_kcal >= TARGETS.kcal, 'fixture is not a rich week');
  assert.strictEqual(res.macroSummary.fat_added_total_g, 0, 'oil was added to an on-target week');
  assert.ok(said(res, 'already averaging'), 'never explained why no fat was added');
});

t('GATE 1: a genuinely short week DOES get oil', () => {
  const lean = Array.from({ length: 14 }, (_, i) => recipe('r' + i, { kcal: 500, protein_g: 80, carbs_g: 2 }));
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS, diet: LEVER }), [], lean);
  assert.ok(res.macroSummary.fat_added_total_g > 0, 'a 1000 kcal/day week got no help at all');
});

t('GATE 1: never adds MORE than the week is short by', () => {
  const lean = Array.from({ length: 14 }, (_, i) => recipe('r' + i, { kcal: 500, protein_g: 80, carbs_g: 2 }));
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS, diet: LEVER }), [], lean);
  const m = res.macroSummary;
  const weekTarget = TARGETS.kcal * m.per_day.length;
  assert.ok(m.week_kcal <= weekTarget + 1, `week landed at ${m.week_kcal} against a ${weekTarget} target`);
});

t('GATE 2: a day with an EMPTY slot gets no oil — it needs a meal, not fat', () => {
  // One 30 g dish per day fits; a second would breach the 35 g ceiling, so the
  // day comes back with an unfilled slot and far too few calories.
  const heavy = Array.from({ length: 14 }, (_, i) => recipe('h' + i, { carbs_g: 30, kcal: 300, protein_g: 20 }));
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS, diet: LEVER }), [], heavy);
  const short = res.macroSummary.per_day.filter((d) => d.slots_filled < d.slots_planned);
  assert.ok(short.length > 0, 'fixture produced no incomplete day');
  for (const d of short) {
    assert.strictEqual(d.fat_top_up_g, 0, `${d.slot_date} was topped up despite an empty slot`);
  }
  assert.ok(res.macroSummary.fat_days_skipped_incomplete > 0);
  assert.ok(said(res, 'needs a meal'), 'never said the day was short a meal rather than short of fat');
});

t('GATE 3: the per-slot dose is never exceeded', () => {
  const lean = Array.from({ length: 14 }, (_, i) => recipe('r' + i, { kcal: 300, protein_g: 80, carbs_g: 2 }));
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS, diet: LEVER }), [], lean);
  for (const d of res.macroSummary.per_day) {
    assert.ok(d.fat_top_up_g <= d.slots_filled * 15,
      `${d.slot_date} got ${d.fat_top_up_g} g across ${d.slots_filled} slots`);
  }
  for (const s of res.slots) {
    assert.ok((s.fat_top_up_g || 0) <= 15, `a slot got ${s.fat_top_up_g} g`);
  }
});

t('a diet with no lever still adds nothing and says why', () => {
  const lean = Array.from({ length: 14 }, (_, i) => recipe('r' + i, { kcal: 300, protein_g: 80, carbs_g: 2 }));
  const res = run(constraints({ meals_to_plan: ['lunch', 'dinner'], targets: TARGETS, diet: KETO }), [], lean);
  assert.strictEqual(res.macroSummary.fat_added_total_g, 0);
  assert.ok(said(res, 'no fat lever is set'));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
