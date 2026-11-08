// lib/recipeDisplay.test.js — run: node lib/recipeDisplay.test.js
const assert = require('assert');
const { pickShopWindow, dishOfTheWeek, methodSteps, sectionLabel, isoWeek, formatCost } = require('./recipeDisplay');

let passed = 0;
let failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; } catch (e) { failed += 1; console.error(`FAIL ${name}\n  ${e.message}`); }
}

// Reference-adult figures from the live database, 8 Nov 2026.
const R = (name, section, kcal, protein_g, carbs_g, cost_gbp) => ({ id: name, name, section, kcal, protein_g, carbs_g, cost_gbp });
const book = [
  R('Beef Short Ribs with Crispy Kale', 'mains', 785, 37, 5.0, 4.30),
  R('Seared Tuna with Garlic Green Veg', 'mains', 352, 42, 6.1, 4.03),
  R('Tuna, Mozzarella & Anchovy Salad', 'salads', 276, 32, 5.5, 1.53),
  R('Blueberry Protein Shake', 'shakes', 159, 19, 7.0, 1.09),
  R('Chicken Tikka', 'curries', 357, 38, 14.0, 1.29),
  R('Beef Madras', 'curries', 348, 35, 8.0, 1.13),
  R('Chorizo & Prawn Stew', 'stews', 341, 34, 11.6, 2.67),
  R('Chicken, Bacon & Avocado Salad', 'salads', 433, 42, 6.4, 2.82),
  R('Asian Sesame Chicken Salad', 'salads', 427, 40, 5.2, 1.54),
  R('Sausage & Veg Stew', 'stews', 548, 52, 9.5, 2.45),
  R('Salmon Fillet with Celeriac Mash', 'mains', 696, 31, 9.2, 3.03),
  R('Coconut Milk & Mixed Berries', 'breakfast', 191, 3, 8.1, 1.12),
];

const win = pickShopWindow(book, 6);
t('five eligible picks from this fixture (third salad held back)', () => assert.strictEqual(win.length, 5));
t('no luxuries: short ribs out', () => assert.ok(!win.some((r) => /Short Ribs/.test(r.name))));
t('no over-£3.50 dish (seared tuna £4.03) out', () => assert.ok(!win.some((r) => /Garlic Green Veg/.test(r.name))));
t('no shakes in the shop window', () => assert.ok(!win.some((r) => r.section === 'shakes')));
t('no low-protein breakfast', () => assert.ok(!win.some((r) => /Coconut Milk/.test(r.name))));
t('carbs over 12 g out (tikka 14 g)', () => assert.ok(!win.some((r) => /Tikka/.test(r.name))));
t('max two per section', () => {
  const c = {}; win.forEach((r) => { c[r.section] = (c[r.section] || 0) + 1; });
  assert.ok(Object.values(c).every((n) => n <= 2));
});
t('best protein per kcal comes first', () => assert.strictEqual(win[0].name, 'Tuna, Mozzarella & Anchovy Salad'));
t('every pick at or under 550 kcal', () => assert.ok(win.every((r) => r.kcal <= 550)));

t('dish of the week is in the shop window', () => assert.ok(win.includes(dishOfTheWeek(win, new Date('2026-11-09')))));
t('dish of the week changes week to week', () =>
  assert.notStrictEqual(dishOfTheWeek(win, new Date('2026-11-09')).id, dishOfTheWeek(win, new Date('2026-11-16')).id));
t('iso week of 9 Nov 2026 is 46', () => assert.strictEqual(isoWeek(new Date('2026-11-09T12:00:00')), 46));
t('empty window, no dish', () => assert.strictEqual(dishOfTheWeek([]), null));

t('typed step numbers are stripped', () => assert.deepStrictEqual(
  methodSteps('1. Brown the ribs.\n2) Add stock.\nStep 3: Plate.'), ['Brown the ribs.', 'Add stock.', 'Plate.']));
t('unnumbered lines kept', () => assert.deepStrictEqual(methodSteps('Roast the cauliflower.\n\n'), ['Roast the cauliflower.']));
t('tip lines survive', () => assert.deepStrictEqual(methodSteps('💡 Rest the meat.'), ['💡 Rest the meat.']));
t('a quantity at the start is not a step number', () => assert.deepStrictEqual(methodSteps('200g spinach wilted'), ['200g spinach wilted']));

t('pasta section reads edamame pasta', () => assert.strictEqual(sectionLabel('pasta'), 'Edamame pasta'));
t('unknown section capitalised', () => assert.strictEqual(sectionLabel('pies'), 'Pies'));
t('cost format', () => assert.strictEqual(formatCost(1.5), '£1.50'));
t('missing cost is a dash', () => assert.strictEqual(formatCost(null), '—'));

console.log(`recipeDisplay: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
