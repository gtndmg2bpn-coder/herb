// lib/countItems.test.js — run: node lib/countItems.test.js
//
// Karum, 8 Nov 2026: "It should say 2 sausages, not 2 grams." and eggs are
// counted, not weighed. No half egg, no half sausage.

const assert = require('assert');
const { itemCount, itemNoun, countLabel } = require('./countItems');

let passed = 0;
let failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; } catch (e) { failed += 1; console.error(`FAIL ${name}\n  ${e.message}`); }
}

// Live rows, 8 Nov: Pork sausages 75.67 g each, Eggs 58 g each.
t('two sausages from 151.34 g', () => assert.strictEqual(countLabel(151.34, 75.67, 'Pork sausages'), '2 sausages'));
t('two eggs from 116 g', () => assert.strictEqual(countLabel(116, 58, 'Eggs'), '2 eggs'));
t('three eggs from 174 g', () => assert.strictEqual(countLabel(174, 58, 'Eggs'), '3 eggs'));
t('one egg is singular', () => assert.strictEqual(countLabel(58, 58, 'Eggs'), '1 egg'));
t('one sausage is singular', () => assert.strictEqual(countLabel(75.67, 75.67, 'Pork sausages'), '1 sausage'));
t('pack of six eggs', () => assert.strictEqual(itemCount(348, 58), 6));
t('454 g of sausages is six', () => assert.strictEqual(itemCount(454, 75.67), 6));
t('never less than one item', () => assert.strictEqual(itemCount(15, 58), 1));
t('shopping rounds up: 1.3 eggs is 2', () => assert.strictEqual(itemCount(75, 58, 'up'), 2));
t('float noise does not round up a whole count', () => assert.strictEqual(itemCount(151.34, 75.67, 'up'), 2));
t('not counted -> null', () => assert.strictEqual(countLabel(200, null, 'Onion'), null));
t('zero grams -> null', () => assert.strictEqual(itemCount(0, 58), null));
t('noun pluralises a singular name', () => assert.strictEqual(itemNoun('Lime', 2), 'limes'));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
