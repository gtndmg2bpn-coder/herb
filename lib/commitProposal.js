// lib/commitProposal.js
// THE ONE COMMIT CALL for the Capture Bar's text + voice proposals.
//
// A parseIntent proposal names an action ('addPantryItems' | 'binStock' |
// 'logSpend' | 'logWeight' | 'logOffPlanIntake') and carries ready-to-commit
// args. This maps proposal -> the correct lib/actions.js function with the
// correct argument SHAPE, so the confirm-card UI has one dead-simple call and
// zero knowledge of the write layer.
//
// The seam this exists to hide: parseIntent wraps add_stock as
//   args = { items: [ {...} ] }
// but actions.addPantryItems takes the bare array. Every other intent's args is
// already the exact object its action destructures. commitProposal unwraps the
// one odd case so the caller never has to.
//
// Contract: returns { data, error } (mirrors actions.js — never throws). The UI
// calls this ONLY after the user taps Confirm. It never writes on its own.
//
// CommonJS to match the brains + their node test-runner. `actions` is loaded via
// dynamic import so tests can inject a fake and never pull in the browser client.

'use strict';

async function commitProposal(proposal, actionsOverride) {
  if (!proposal || typeof proposal !== 'object') {
    return { data: null, error: { message: 'no proposal to commit' } };
  }
  const { action, args } = proposal;
  if (!action || !args || typeof args !== 'object') {
    return { data: null, error: { message: 'proposal has no committable action' } };
  }

  const actions = actionsOverride || (await import('./actions'));

  try {
    switch (action) {
      case 'addPantryItems':
        // seam: parseIntent gives { items: [...] }; addPantryItems takes the array
        return await actions.addPantryItems(Array.isArray(args.items) ? args.items : []);
      case 'binStock':
        return await actions.binStock(args);
      case 'logSpend':
        return await actions.logSpend(args);
      case 'logWeight':
        return await actions.logWeight(args);
      case 'logOffPlanIntake':
        return await actions.logOffPlanIntake(args);
      default:
        return { data: null, error: { message: `unknown action: ${action}` } };
    }
  } catch (e) {
    // actions.js is not supposed to throw, but guard anyway so the UI always
    // gets a clean { data, error } to branch on.
    return { data: null, error: { message: String((e && e.message) || e) } };
  }
}

module.exports = { commitProposal };
