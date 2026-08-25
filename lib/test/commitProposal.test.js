// test/commitProposal.test.js — run: node test/commitProposal.test.js
// Verifies the proposal -> action mapping (incl. the add_stock array unwrap)
// without touching Supabase: a fake actions object records every call.
const assert = require('assert');
const { commitProposal } = require('../commitProposal');

// A fake action layer. Each fn records its single argument and returns the
// {data,error} shape the real actions.js returns.
function makeSpy() {
  const calls = {};
  const mk = (name, ret = { data: { ok: true }, error: null }) => (arg) => {
    calls[name] = arg;
    return Promise.resolve(ret);
  };
  const actions = {
    addPantryItems: mk('addPantryItems'),
    binStock: mk('binStock'),
    logSpend: mk('logSpend'),
    logWeight: mk('logWeight'),
    logOffPlanIntake: mk('logOffPlanIntake'),
  };
  return { actions, calls };
}

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } }

(async () => {
  // --- add_stock: the seam. args={items:[...]} must reach addPantryItems as the ARRAY
  await t('add_stock unwraps {items:[…]} to the bare array', async () => {
    const { actions, calls } = makeSpy();
    const item = { itemKind: 'ingredient', ingredientId: 'i-chick', quantity: 2, location: 'freezer' };
    const res = await commitProposal(
      { status: 'PROPOSE', action: 'addPantryItems', args: { items: [item] } }, actions);
    assert.ok(Array.isArray(calls.addPantryItems), 'addPantryItems got a non-array');
    assert.strictEqual(calls.addPantryItems.length, 1);
    assert.deepStrictEqual(calls.addPantryItems[0], item);
    assert.strictEqual(res.error, null);
  });

  await t('add_stock with missing items -> empty array, no throw', async () => {
    const { actions, calls } = makeSpy();
    await commitProposal({ action: 'addPantryItems', args: {} }, actions);
    assert.deepStrictEqual(calls.addPantryItems, []);
  });

  // --- the four object-shaped intents pass args straight through
  await t('bin_stock passes args object through', async () => {
    const { actions, calls } = makeSpy();
    const args = { itemKind: 'ingredient', ingredientId: 'i-spin', quantity: 1, location: 'fridge' };
    await commitProposal({ action: 'binStock', args }, actions);
    assert.deepStrictEqual(calls.binStock, args);
  });
  await t('log_spend passes args object through', async () => {
    const { actions, calls } = makeSpy();
    const args = { amountPence: 1000, category: 'grocery', spendDate: null, note: null };
    await commitProposal({ action: 'logSpend', args }, actions);
    assert.deepStrictEqual(calls.logSpend, args);
  });
  await t('log_weight passes args object through', async () => {
    const { actions, calls } = makeSpy();
    const args = { weightKg: 82.4, note: null };
    await commitProposal({ action: 'logWeight', args }, actions);
    assert.deepStrictEqual(calls.logWeight, args);
  });
  await t('log_off_plan passes args object through', async () => {
    const { actions, calls } = makeSpy();
    const args = { description: 'pizza', kcal: 900, confidence: 'ESTIMATED', source: 'capture_bar' };
    await commitProposal({ action: 'logOffPlanIntake', args }, actions);
    assert.deepStrictEqual(calls.logOffPlanIntake, args);
  });

  // --- only the named action fires (no cross-talk)
  await t('only the mapped action is called', async () => {
    const { actions, calls } = makeSpy();
    await commitProposal({ action: 'logSpend', args: { amountPence: 500 } }, actions);
    assert.deepStrictEqual(Object.keys(calls), ['logSpend']);
  });

  // --- guards: never throw, always {data,error}
  await t('unknown action -> error, nothing called', async () => {
    const { actions, calls } = makeSpy();
    const res = await commitProposal({ action: 'nukeEverything', args: {} }, actions);
    assert.strictEqual(res.data, null);
    assert.ok(/unknown action/.test(res.error.message));
    assert.deepStrictEqual(Object.keys(calls), []);
  });
  await t('no action -> error', async () => {
    const res = await commitProposal({ args: { x: 1 } }, {});
    assert.ok(/no committable action/.test(res.error.message));
  });
  await t('no proposal -> error', async () => {
    const res = await commitProposal(null, {});
    assert.ok(/no proposal/.test(res.error.message));
  });
  await t('action-layer error is returned, not thrown', async () => {
    const actions = { logWeight: () => Promise.resolve({ data: null, error: { message: 'RLS denied' } }) };
    const res = await commitProposal({ action: 'logWeight', args: { weightKg: 80 } }, actions);
    assert.strictEqual(res.error.message, 'RLS denied');
  });
  await t('a throwing action is caught into {error}', async () => {
    const actions = { logSpend: () => { throw new Error('boom'); } };
    const res = await commitProposal({ action: 'logSpend', args: { amountPence: 1 } }, actions);
    assert.strictEqual(res.data, null);
    assert.strictEqual(res.error.message, 'boom');
  });

  console.log(`\n${pass}/${pass + fail} passing` + (fail ? `  (${fail} FAILED)` : '  ✓'));
  process.exit(fail ? 1 : 0);
})();
