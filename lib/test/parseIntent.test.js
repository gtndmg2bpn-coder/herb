// test/parseIntent.test.js — run: node test/parseIntent.test.js
const assert = require('assert');
const { interpretIntent, resolveIngredient, moneyToPence, weightToKg } = require('../lib/parseIntent');

// Small fixture master (real one is 175 rows; the interpreter is master-agnostic).
const MASTER = [
  { id: 'i-chick', name: 'Chicken breast' },
  { id: 'i-spin', name: 'Spinach' },
  { id: 'i-butt', name: 'Butternut squash' },
  { id: 'i-salmon', name: 'Salmon fillet' },
  { id: 'i-egg', name: 'Eggs' },
];

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } }

// --- helpers ---------------------------------------------------------------
t('moneyToPence: pounds string -> pence', () => assert.strictEqual(moneyToPence('£12.50'), 1250));
t('moneyToPence: number -> pence', () => assert.strictEqual(moneyToPence(12.5), 1250));
t('moneyToPence: rejects negative', () => assert.strictEqual(moneyToPence(-5), null));
t('moneyToPence: rejects junk', () => assert.strictEqual(moneyToPence('abc'), null));
t('weightToKg: strips unit', () => assert.strictEqual(weightToKg('82.4kg'), 82.4));
t('weightToKg: rejects zero', () => assert.strictEqual(weightToKg(0), null));

// --- ingredient resolver ---------------------------------------------------
t('resolve: exact match scores 1', () => {
  const r = resolveIngredient('Chicken breast', MASTER);
  assert.strictEqual(r.id, 'i-chick'); assert.strictEqual(r.score, 1);
});
t('resolve: plural tolerated', () => {
  const r = resolveIngredient('chicken breasts', MASTER);
  assert.strictEqual(r.id, 'i-chick');
});
t('resolve: partial substring matches', () => {
  const r = resolveIngredient('butternut', MASTER);
  assert.strictEqual(r.id, 'i-butt'); assert.ok(r.score >= 0.8);
});
t('resolve: nonsense returns no id', () => {
  const r = resolveIngredient('xyzzy quantum', MASTER);
  assert.strictEqual(r.id, null);
});

// --- add_stock -------------------------------------------------------------
t('add_stock: happy path -> PROPOSE + addPantryItems', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'chicken breasts', quantity: 2, location: 'freezer', modelConfidence: 0.95 }, MASTER);
  assert.strictEqual(r.status, 'PROPOSE');
  assert.strictEqual(r.action, 'addPantryItems');
  assert.strictEqual(r.args.items[0].ingredientId, 'i-chick');
  assert.strictEqual(r.args.items[0].quantity, 2);
  assert.strictEqual(r.args.items[0].location, 'freezer');
  assert.strictEqual(r.args.items[0].itemKind, 'ingredient');
});
t('add_stock: "fridge" maps, default qty 1', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'spinach', location: 'fridge', modelConfidence: 0.9 }, MASTER);
  assert.strictEqual(r.args.items[0].location, 'fridge');
  assert.strictEqual(r.args.items[0].quantity, 1);
});
t('add_stock: "pantry" maps to cupboard', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'eggs', location: 'pantry', modelConfidence: 0.9 }, MASTER);
  assert.strictEqual(r.args.items[0].location, 'cupboard');
});
t('add_stock: unknown location -> FALLBACK', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'eggs', location: 'garage', modelConfidence: 0.9 }, MASTER);
  assert.strictEqual(r.status, 'FALLBACK');
  assert.strictEqual(r.reason, 'unrecognised location');
});
t('reserved 4th location stays dormant (does not resolve)', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'eggs', location: 'counter', modelConfidence: 0.9 }, MASTER);
  assert.strictEqual(r.status, 'FALLBACK');
  assert.strictEqual(r.reason, 'unrecognised location');
});
t('add_stock: unknown ingredient -> FALLBACK carries label', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'dragon fruit', location: 'fridge', modelConfidence: 0.9 }, MASTER);
  assert.strictEqual(r.status, 'FALLBACK');
  assert.strictEqual(r.args.label, 'dragon fruit');
  assert.strictEqual(r.args.location, 'fridge');
});
t('add_stock: low model confidence -> FALLBACK not PROPOSE', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'salmon fillet', location: 'freezer', modelConfidence: 0.3 }, MASTER);
  assert.strictEqual(r.status, 'FALLBACK');
});
t('add_stock: cost normalised to pence', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'salmon fillet', location: 'fridge', cost: '£4.50', modelConfidence: 0.95 }, MASTER);
  assert.strictEqual(r.args.items[0].costPence, 450);
});

// --- bin_stock -------------------------------------------------------------
t('bin_stock: happy path -> binStock', () => {
  const r = interpretIntent({ intent: 'bin_stock', ingredient: 'spinach', location: 'fridge', modelConfidence: 0.95 }, MASTER);
  assert.strictEqual(r.status, 'PROPOSE');
  assert.strictEqual(r.action, 'binStock');
  assert.strictEqual(r.args.ingredientId, 'i-spin');
});

// --- log_spend -------------------------------------------------------------
t('log_spend: pounds -> pence, category mapped', () => {
  const r = interpretIntent({ intent: 'log_spend', amount: '£12', category: 'lunch', modelConfidence: 0.9 });
  assert.strictEqual(r.status, 'PROPOSE');
  assert.strictEqual(r.action, 'logSpend');
  assert.strictEqual(r.args.amountPence, 1200);
  assert.strictEqual(r.args.category, 'eating_out');
});
t('log_spend: no amount -> FALLBACK', () => {
  const r = interpretIntent({ intent: 'log_spend', category: 'grocery', modelConfidence: 0.9 });
  assert.strictEqual(r.status, 'FALLBACK');
});
t('log_spend: zero amount -> REJECT', () => {
  const r = interpretIntent({ intent: 'log_spend', amount: 0, modelConfidence: 0.9 });
  assert.strictEqual(r.status, 'REJECT');
});
t('log_spend: default category is grocery', () => {
  const r = interpretIntent({ intent: 'log_spend', amount: 30, modelConfidence: 0.9 });
  assert.strictEqual(r.args.category, 'grocery');
});

// --- log_weight ------------------------------------------------------------
t('log_weight: in range -> PROPOSE', () => {
  const r = interpretIntent({ intent: 'log_weight', weight: '82.4', modelConfidence: 0.95 });
  assert.strictEqual(r.status, 'PROPOSE');
  assert.strictEqual(r.action, 'logWeight');
  assert.strictEqual(r.args.weightKg, 82.4);
});
t('log_weight: absurd value -> FALLBACK', () => {
  const r = interpretIntent({ intent: 'log_weight', weight: 999, modelConfidence: 0.95 });
  assert.strictEqual(r.status, 'FALLBACK');
  assert.strictEqual(r.reason, 'weight outside plausible range');
});

// --- log_off_plan ----------------------------------------------------------
t('log_off_plan: description -> logOffPlanIntake', () => {
  const r = interpretIntent({ intent: 'log_off_plan', description: 'flat white and a croissant', kcal: 320, modelConfidence: 0.9 });
  assert.strictEqual(r.action, 'logOffPlanIntake');
  assert.strictEqual(r.args.kcal, 320);
  assert.strictEqual(r.args.confidence, 'ESTIMATED');
});

// --- guards ----------------------------------------------------------------
t('no intent -> FALLBACK', () => {
  const r = interpretIntent({ ingredient: 'eggs' }, MASTER);
  assert.strictEqual(r.status, 'FALLBACK');
  assert.strictEqual(r.reason, 'no intent parsed');
});
t('unsupported intent -> FALLBACK to guided form', () => {
  const r = interpretIntent({ intent: 'swap_meal', modelConfidence: 0.9 }, MASTER);
  assert.strictEqual(r.status, 'FALLBACK');
});
t('never emits COMMIT', () => {
  const r = interpretIntent({ intent: 'add_stock', ingredient: 'eggs', location: 'fridge', modelConfidence: 1 }, MASTER);
  assert.ok(['PROPOSE', 'FALLBACK', 'REJECT'].includes(r.status));
});
t('stricter caller threshold downgrades PROPOSE', () => {
  const r = interpretIntent({ intent: 'log_weight', weight: 82, modelConfidence: 0.7 }, MASTER, { minConfidence: 0.9 });
  assert.strictEqual(r.status, 'FALLBACK');
});

console.log(`\n${pass}/${pass + fail} passing` + (fail ? `  (${fail} FAILED)` : '  ✓'));
process.exit(fail ? 1 : 0);
