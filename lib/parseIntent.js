// lib/parseIntent.js
// THE INTENT ROUTER — the pure "brain" behind the Capture Bar's text + voice.
//
// Flow:  utterance --(model, elsewhere)--> raw guess --(THIS FILE)--> proposal.
// A model turns free text ("add 2 chicken breasts to the freezer") into a rough
// structured guess. interpretIntent() validates that guess against HERB's FIXED
// action vocabulary (lib/actions.js), resolves ingredient names to canonical
// ids, normalises money / weight / location, scores confidence, and decides
// PROPOSE (show a confirm card) vs FALLBACK (drop to the guided form) vs REJECT.
//
// It is the exact mirror of matchReceipt.js: model does the fuzzy part, this
// does the deterministic, testable mapping. NO network. NO writes. NEVER commits
// — status is only ever PROPOSE / FALLBACK / REJECT. The UI commits on user tap.
//
// Voice is not special: transcript -> same model -> same interpretIntent().

'use strict';

// Confidence at/above which we show a one-tap confirm card. Below it we drop to
// the guided form pre-filled with whatever we did manage to parse. Tunable.
const MIN_CONFIDENCE = 0.6;

// Words the model might emit -> canonical pantry locations.
// NOTE FOR KARUM: confirm these three match the DB's allowed location values.
// If your enum differs, this map is the single place to change it.
const LOCATION_MAP = {
  freezer: 'freezer', frozen: 'freezer',
  fridge: 'fridge', refrigerator: 'fridge', chilled: 'fridge',
  cupboard: 'cupboard', pantry: 'cupboard', larder: 'cupboard', shelf: 'cupboard',
};

// RESERVED — a future fourth location, intentionally DORMANT. It is NOT in
// LOCATION_MAP and NOT surfaced in any UI, so no utterance can resolve to it
// and it can never produce a write the DB would reject. To activate it later,
// in this order:
//   1. add the value to the DB location enum / constraint,
//   2. add its word-mappings to LOCATION_MAP above,
//   3. surface it in the Capture Bar UI.
// Placeholder name — rename when you build it (worktop / bread bin / fruit bowl).
const RESERVED_LOCATION = 'counter';

// Free-text spend category -> the log_spend enum (grocery | eating_out | sundry).
const CATEGORY_MAP = {
  grocery: 'grocery', groceries: 'grocery', shopping: 'grocery', shop: 'grocery',
  'eating out': 'eating_out', eating_out: 'eating_out', takeaway: 'eating_out',
  restaurant: 'eating_out', lunch: 'eating_out', dinner: 'eating_out', meal: 'eating_out',
  sundry: 'sundry', other: 'sundry', misc: 'sundry',
};

// Plausible human bodyweight in kg. Outside this, we don't trust the parse.
const WEIGHT_MIN_KG = 20;
const WEIGHT_MAX_KG = 400;

// --- small pure helpers -----------------------------------------------------

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

// "£12", "12.50", 12.5, "12.5 pounds" -> integer pence, or null if not sane.
function moneyToPence(value) {
  if (value == null) return null;
  let n;
  if (typeof value === 'number') n = value;
  else {
    const cleaned = String(value).replace(/[£$,\s]/g, '').replace(/pounds?/i, '');
    n = Number(cleaned);
  }
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// "82", "82.4kg", 82.4 -> float kg, or null.
function weightToKg(value) {
  if (value == null) return null;
  let n;
  if (typeof value === 'number') n = value;
  else n = Number(String(value).replace(/kgs?|kilograms?/i, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normLocation(word) {
  if (!word) return null;
  return LOCATION_MAP[String(word).trim().toLowerCase()] || null;
}

function normCategory(word) {
  if (!word) return 'grocery'; // sensible default; user can flip it on the card
  return CATEGORY_MAP[String(word).trim().toLowerCase()] || null;
}

// Normalise an ingredient string for matching: lowercase, strip trailing plural
// 's', collapse whitespace, drop obvious noise tokens.
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function singular(tok) { return tok.endsWith('s') && tok.length > 3 ? tok.slice(0, -1) : tok; }

// --- shared ingredient resolver (matchReceipt.js will reuse this shape) ------
//
// master: array of { id, name }. Returns { id, name, score, alternatives }.
// score is 0..1. Deterministic: exact > full-substring > token overlap.
function resolveIngredient(query, master) {
  const q = normName(query);
  if (!q || !Array.isArray(master) || master.length === 0) {
    return { id: null, name: null, score: 0, alternatives: [] };
  }
  const qTokens = q.split(' ').map(singular).filter(Boolean);
  const scored = master.map((row) => {
    const name = normName(row.name);
    const nTokens = name.split(' ').map(singular).filter(Boolean);
    let score;
    if (name === q) score = 1;
    else if (name.includes(q) || q.includes(name)) score = 0.85;
    else {
      const overlap = qTokens.filter((t) => nTokens.includes(t)).length;
      const denom = Math.max(qTokens.length, nTokens.length) || 1;
      score = 0.7 * (overlap / denom);
    }
    return { id: row.id, name: row.name, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const alternatives = scored.slice(1, 4).filter((s) => s.score > 0.15);
  return { id: best.score > 0 ? best.id : null, name: best.name, score: best.score, alternatives };
}

// --- proposal builders (one per supported intent) ---------------------------
//
// v1 vocabulary — the highest-frequency, lowest-ambiguity commands:
//   add_stock -> addPantryItems   bin_stock -> binStock
//   log_spend -> logSpend         log_weight -> logWeight
//   log_off_plan -> logOffPlanIntake
// Deferred to the guided form (recipe/plan-slot targeting is its own problem):
//   eating out, meal swaps, portion edits, eat-a-portion.

function fallback(intent, args, reason, confidence = 0) {
  return { status: 'FALLBACK', intent: intent || null, action: null, args: args || {}, display: null, confidence, reason, alternatives: [] };
}
function reject(intent, reason) {
  return { status: 'REJECT', intent: intent || null, action: null, args: {}, display: null, confidence: 0, reason, alternatives: [] };
}

function buildAddStock(raw, master, mc) {
  const loc = normLocation(raw.location);
  if (!loc) return fallback('add_stock', { rawLocation: raw.location || null }, 'unrecognised location', mc * 0.5);
  const match = resolveIngredient(raw.ingredient, master);
  const qty = Number(raw.quantity);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;

  if (!match.id || match.score < 0.5) {
    return {
      status: 'FALLBACK', intent: 'add_stock', action: null,
      args: { ingredientId: null, label: raw.ingredient || null, quantity, unit: raw.unit || null, location: loc },
      display: null, confidence: clamp01(mc * match.score),
      reason: match.id ? 'low-confidence ingredient match' : 'ingredient not found',
      alternatives: match.alternatives,
    };
  }
  const confidence = clamp01(mc * match.score);
  const args = {
    items: [{
      itemKind: 'ingredient', ingredientId: match.id, label: match.name,
      quantity, unit: raw.unit || null, location: loc,
      costPence: moneyToPence(raw.cost), boughtDate: raw.date || null,
    }],
  };
  const proposal = {
    status: confidence >= MIN_CONFIDENCE ? 'PROPOSE' : 'FALLBACK',
    intent: 'add_stock', action: 'addPantryItems', args,
    display: `Add ${quantity}${raw.unit ? ' ' + raw.unit : '×'} ${match.name} to the ${loc}`,
    confidence, reason: confidence >= MIN_CONFIDENCE ? null : 'below confidence threshold',
    alternatives: match.alternatives,
  };
  return proposal;
}

function buildBinStock(raw, master, mc) {
  const loc = normLocation(raw.location) || 'fridge';
  const match = resolveIngredient(raw.ingredient, master);
  const qty = Number(raw.quantity);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
  if (!match.id || match.score < 0.5) {
    return fallback('bin_stock',
      { ingredientId: null, label: raw.ingredient || null, quantity, location: loc },
      match.id ? 'low-confidence ingredient match' : 'ingredient not found', clamp01(mc * match.score));
  }
  const confidence = clamp01(mc * match.score);
  return {
    status: confidence >= MIN_CONFIDENCE ? 'PROPOSE' : 'FALLBACK',
    intent: 'bin_stock', action: 'binStock',
    args: { itemKind: 'ingredient', ingredientId: match.id, label: match.name, quantity, location: loc },
    display: `Bin ${quantity}× ${match.name} from the ${loc}`,
    confidence, reason: confidence >= MIN_CONFIDENCE ? null : 'below confidence threshold',
    alternatives: match.alternatives,
  };
}

function buildLogSpend(raw, mc) {
  const pence = moneyToPence(raw.amount);
  if (pence == null) return fallback('log_spend', {}, 'no valid amount', mc * 0.4);
  if (pence === 0) return reject('log_spend', 'zero amount');
  const category = normCategory(raw.category);
  if (!category) return fallback('log_spend', { amountPence: pence, note: raw.note || null }, 'unrecognised category', mc * 0.6);
  const confidence = clamp01(mc);
  return {
    status: confidence >= MIN_CONFIDENCE ? 'PROPOSE' : 'FALLBACK',
    intent: 'log_spend', action: 'logSpend',
    args: { amountPence: pence, category, spendDate: raw.date || null, note: raw.note || null },
    display: `Log £${(pence / 100).toFixed(2)} — ${category.replace('_', ' ')}`,
    confidence, reason: confidence >= MIN_CONFIDENCE ? null : 'below confidence threshold', alternatives: [],
  };
}

function buildLogWeight(raw, mc) {
  const kg = weightToKg(raw.weight);
  if (kg == null) return fallback('log_weight', {}, 'no valid weight', mc * 0.4);
  if (kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
    return fallback('log_weight', { weightKg: kg }, 'weight outside plausible range', mc * 0.5);
  }
  const confidence = clamp01(mc);
  return {
    status: confidence >= MIN_CONFIDENCE ? 'PROPOSE' : 'FALLBACK',
    intent: 'log_weight', action: 'logWeight',
    args: { weightKg: kg, note: raw.note || null },
    display: `Log weight ${kg} kg`,
    confidence, reason: confidence >= MIN_CONFIDENCE ? null : 'below confidence threshold', alternatives: [],
  };
}

function buildLogOffPlan(raw, mc) {
  const description = (raw.description || raw.ingredient || '').trim();
  if (!description) return fallback('log_off_plan', {}, 'no description', mc * 0.4);
  const confidence = clamp01(mc);
  return {
    status: confidence >= MIN_CONFIDENCE ? 'PROPOSE' : 'FALLBACK',
    intent: 'log_off_plan', action: 'logOffPlanIntake',
    args: {
      description,
      kcal: Number.isFinite(Number(raw.kcal)) ? Number(raw.kcal) : null,
      confidence: 'ESTIMATED', source: 'capture_bar',
      intakeDate: raw.date || null, costPence: moneyToPence(raw.cost),
    },
    display: `Log off-plan: ${description}`,
    confidence, reason: confidence >= MIN_CONFIDENCE ? null : 'below confidence threshold', alternatives: [],
  };
}

// --- the entry point --------------------------------------------------------
//
// raw:    the model's structured guess. Shape (all optional except intent):
//         { intent, ingredient, quantity, unit, location, amount, category,
//           weight, description, kcal, cost, date, note, modelConfidence }
// master: array of { id, name } — the canonical ingredient list (inject it;
//         never fetch here). Tests pass a small fixture.
function interpretIntent(raw, master = [], opts = {}) {
  const minConf = typeof opts.minConfidence === 'number' ? opts.minConfidence : MIN_CONFIDENCE;
  // Bind the threshold for the builders via a closure-free approach: builders
  // read the module MIN_CONFIDENCE, so honour an override by post-adjusting.
  if (!raw || typeof raw !== 'object' || !raw.intent) {
    return fallback(null, {}, 'no intent parsed', 0);
  }
  const mc = typeof raw.modelConfidence === 'number' ? clamp01(raw.modelConfidence) : 0.8;

  let out;
  switch (raw.intent) {
    case 'add_stock': out = buildAddStock(raw, master, mc); break;
    case 'bin_stock': out = buildBinStock(raw, master, mc); break;
    case 'log_spend': out = buildLogSpend(raw, mc); break;
    case 'log_weight': out = buildLogWeight(raw, mc); break;
    case 'log_off_plan': out = buildLogOffPlan(raw, mc); break;
    default: return fallback(raw.intent, {}, 'unsupported intent — use guided form', mc * 0.3);
  }
  // Apply a caller threshold override (e.g. stricter on voice) after the fact.
  if (out.status === 'PROPOSE' && out.confidence < minConf) {
    out.status = 'FALLBACK';
    out.reason = 'below confidence threshold';
  }
  return out;
}

module.exports = { interpretIntent, resolveIngredient, moneyToPence, weightToKg, MIN_CONFIDENCE, RESERVED_LOCATION };
