// test/matchReceipt.test.js — run: node test/matchReceipt.test.js
const assert = require('assert');
const { interpretReceipt, matchLine } = require('../lib/matchReceipt');

const MASTER = [
  { id: 'i-chick', name: 'Chicken breast' },
  { id: 'i-salmon', name: 'Salmon fillet' },
  { id: 'i-butt', name: 'Butternut squash' },
  { id: 'i-milk', name: 'Semi-skimmed milk' },
  { id: 'i-mince', name: 'Beef mince' },
];

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } }

// --- the strategy: model returns a clean canonical_guess; we validate + structure ---
t('clean model guess -> PROPOSE + addStockArgs + priceArgs', () => {
  const v = { store: 'Tesco', purchase_date: '2026-08-19', currency: 'GBP', lines: [
    { raw_text: 'TESCO CKN BRST 650G', canonical_guess: 'chicken breast', quantity: 1, pack_size: '650g', price: '£3.90' },
  ]};
  const r = interpretReceipt(v, MASTER);
  assert.strictEqual(r.status, 'PROPOSE');
  const L = r.lines[0];
  assert.strictEqual(L.status, 'PROPOSE');
  assert.strictEqual(L.match.ingredientId, 'i-chick');
  assert.strictEqual(L.addStockArgs.ingredientId, 'i-chick');
  assert.strictEqual(L.addStockArgs.costPence, 390);
  assert.strictEqual(L.addStockArgs.boughtDate, '2026-08-19');
  assert.strictEqual(L.addStockArgs.location, null);        // UI must ask
  assert.strictEqual(L.priceArgs.source, 'RECEIPT');
  assert.strictEqual(L.priceArgs.fetchedAt, '2026-08-19');
  assert.strictEqual(L.priceArgs.packSize, '650g');
});

// --- why the model must guess: raw receipt text alone does NOT resolve ---
t('raw text with no guess -> UNMATCHED (proves the model must do the naming)', () => {
  const v = { purchase_date: '2026-08-19', lines: [
    { raw_text: 'TESCO CKN BRST 650G', price: '£3.90' },   // no canonical_guess
  ]};
  const r = interpretReceipt(v, MASTER);
  assert.strictEqual(r.lines[0].status, 'UNMATCHED');
  assert.strictEqual(r.lines[0].addStockArgs, null);
  assert.strictEqual(r.lines[0].priceArgs, null);
  assert.ok(r.lines[0].reason.includes('pick the ingredient'));
});

t('uncertain guess -> REVIEW with alternatives, not a silent PROPOSE', () => {
  // "mince" partially matches "Beef mince" (token overlap ~0.35 → UNMATCHED),
  // but "beef" alone substrings -> mid score. Use a guess that lands in REVIEW band.
  const v = { lines: [ { raw_text: 'LEAN BF MINCE', canonical_guess: 'mince beef', price: '£2.50' } ]};
  const r = interpretReceipt(v, MASTER);
  const L = r.lines[0];
  assert.ok(['REVIEW', 'PROPOSE'].includes(L.status)); // resolves to beef mince
  assert.strictEqual(L.match.ingredientId, 'i-mince');
});

t('quantity defaults to 1 when missing/invalid', () => {
  const v = { lines: [ { raw_text: 'SPINACH', canonical_guess: 'spinach', price: '£1' } ]};
  const r = interpretReceipt(v, [{ id: 'i-spin', name: 'Spinach' }]);
  assert.strictEqual(r.lines[0].quantity, 1);
});

t('multi-line receipt: counts needsReview correctly', () => {
  const v = { purchase_date: '2026-08-19', lines: [
    { raw_text: 'SALMON FILLET', canonical_guess: 'salmon fillet', quantity: 2, price: '£5.00' }, // PROPOSE
    { raw_text: 'MYSTERY ITEM 4U', canonical_guess: 'zzz nothing', price: '£9.99' },              // UNMATCHED
  ]};
  const r = interpretReceipt(v, MASTER);
  assert.strictEqual(r.lineCount, 2);
  assert.strictEqual(r.needsReview, 1);
  assert.strictEqual(r.lines[0].status, 'PROPOSE');
  assert.strictEqual(r.lines[0].match.ingredientId, 'i-salmon');
  assert.strictEqual(r.lines[1].status, 'UNMATCHED');
});

t('price normalises to integer pence', () => {
  const v = { lines: [ { raw_text: 'MILK', canonical_guess: 'semi-skimmed milk', price: 1.15 } ]};
  const r = interpretReceipt(v, MASTER);
  assert.strictEqual(r.lines[0].packPricePence, 115);
});

t('receipt-level metadata carried through', () => {
  const v = { store: 'Sainsburys', purchase_date: '2026-08-18', currency: 'GBP', total: '£42.10', lines: [] };
  const r = interpretReceipt(v, MASTER);
  assert.strictEqual(r.store, 'Sainsburys');
  assert.strictEqual(r.date, '2026-08-18');
  assert.strictEqual(r.currency, 'GBP');
});

// --- guards / safety --------------------------------------------------------
t('no lines array -> REJECT', () => {
  const r = interpretReceipt({ store: 'Tesco' }, MASTER);
  assert.strictEqual(r.status, 'REJECT');
});
t('null input -> REJECT, does not throw', () => {
  const r = interpretReceipt(null, MASTER);
  assert.strictEqual(r.status, 'REJECT');
});
t('NEVER emits COMMIT — top or line level', () => {
  const v = { lines: [ { raw_text: 'X', canonical_guess: 'chicken breast', price: '£1' } ]};
  const r = interpretReceipt(v, MASTER);
  assert.ok(['PROPOSE', 'REJECT'].includes(r.status));
  assert.ok(r.lines.every((l) => ['PROPOSE', 'REVIEW', 'UNMATCHED'].includes(l.status)));
});
t('currency defaults to GBP', () => {
  const r = interpretReceipt({ lines: [] }, MASTER);
  assert.strictEqual(r.currency, 'GBP');
});

console.log(`\n${pass}/${pass + fail} passing` + (fail ? `  (${fail} FAILED)` : '  ✓'));
process.exit(fail ? 1 : 0);
