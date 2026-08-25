// lib/matchReceipt.js
// THE RECEIPT BRAIN — the pure "brain" behind the Capture Bar's image/camera path.
//
// Flow:  photo --(vision model, in a server route)--> extraction --(THIS FILE)--> plan.
// The vision model reads the receipt image and returns a STRUCTURED extraction
// (retailer, date, stated total, and per-line: raw text + a plain-English product
// guess + quantity + prices). matchReceipt() then does the deterministic part:
// resolve each line to a canonical ingredient, grade the match, reconcile the
// total, and assemble a COMMIT PLAN mapped to lib/actions.js.
//
// Exact mirror of parseIntent.js: the model does the fuzzy read; this does the
// testable mapping to the fixed vocabulary. NO network. NO writes. It NEVER
// commits — it returns a plan the review UI executes on the user's confirmation.
//
// Shares one matcher with the intent router: resolveIngredient lives in
// parseIntent.js so text, voice and receipts all resolve ingredients identically.

'use strict';

const { resolveIngredient, moneyToPence } = require('./parseIntent');

// Match-grade thresholds. Strong -> auto-proposed; weak -> human glance; none -> pick.
const STRONG_MATCH = 0.85;
const WEAK_MATCH = 0.5;

// --- small pure helpers -----------------------------------------------------

function toIntPence(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  // allow "£3.20" style strings via the shared money parser
  return moneyToPence(v);
}

function posNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Per-line observed PACK price (what was paid for one pack of this item).
// Prefer an explicit unit price; else derive from line total / quantity.
function packPricePence(line) {
  const unit = toIntPence(line.unitPricePence);
  if (unit != null && unit > 0) return unit;
  const total = toIntPence(line.lineTotalPence);
  const qty = posNum(line.quantity, 1);
  if (total != null && total > 0) return Math.round(total / qty);
  return null;
}

// --- per-line matcher -------------------------------------------------------

function matchLine(line, master) {
  const query = (line.productGuess || line.rawText || '').trim();
  const m = resolveIngredient(query, master);
  const lineTotalPence = toIntPence(line.lineTotalPence);
  const observedPricePence = packPricePence(line);

  let status;
  if (m.id && m.score >= STRONG_MATCH) status = 'PROPOSE';
  else if (m.id && m.score >= WEAK_MATCH) status = 'REVIEW';
  else status = 'UNMATCHED';

  // Pull display + default storage location from the matched master row, if any.
  const row = m.id ? master.find((r) => r.id === m.id) : null;

  return {
    rawText: line.rawText || null,
    productGuess: line.productGuess || null,
    status,
    ingredientId: m.id || null,
    ingredientName: row ? row.name : null,
    confidence: m.score,
    quantity: posNum(line.quantity, 1),
    unit: line.unit || null,
    unitPricePence: toIntPence(line.unitPricePence),
    lineTotalPence,
    observedPricePence,
    defaultLocation: row && row.storage_location ? row.storage_location : null,
    alternatives: m.alternatives || [],
  };
}

// --- entry point ------------------------------------------------------------
//
// extraction: the vision model's structured read. Shape:
//   {
//     retailer:      string | null,
//     purchaseDate:  'YYYY-MM-DD' | null,
//     totalPence:    integer | null,        // the total PRINTED on the receipt
//     lines: [ {
//       rawText:        string,             // as printed, e.g. "TESCO BTNT SQ 500G"
//       productGuess:   string,             // model's plain-English guess, e.g. "butternut squash"
//       quantity:       number | null,      // packs (defaults to 1)
//       unit:           string | null,
//       unitPricePence: integer | null,     // price for one pack, if printed
//       lineTotalPence: integer | null      // line total, if printed
//     } ]
//   }
//
// master: array of canonical ingredients { id, name, storage_location? } — inject it.
//
// Returns a plan (NEVER a commit):
//   {
//     retailer, purchaseDate,
//     lines:  [ per-line result, see matchLine ],
//     totals: { statedTotalPence, lineSumPence, reconciled, discrepancyPence },
//     commitPlan: {
//       spend:        { amountPence, category:'grocery', spendDate, note } | null,
//       pantryItems:  [ addPantryItems item shape ],   // PROPOSE + REVIEW w/ an id
//       priceUpdates: [ setIngredientPrice+source shape ]
//     },
//     summary: { lineCount, matched, review, unmatched }
//   }
function matchReceipt(extraction, master = [], opts = {}) {
  const strong = typeof opts.strongMatch === 'number' ? opts.strongMatch : STRONG_MATCH;

  const safe = extraction && typeof extraction === 'object' ? extraction : {};
  const retailer = safe.retailer || null;
  const purchaseDate = safe.purchaseDate || null;
  const rawLines = Array.isArray(safe.lines) ? safe.lines : [];

  const lines = rawLines.map((l) => {
    const res = matchLine(l, master);
    // honour a stricter caller threshold
    if (res.status === 'PROPOSE' && res.confidence < strong) res.status = 'REVIEW';
    return res;
  });

  // --- reconcile the total. NEVER silently fix a mismatch: flag it. ----------
  const statedTotalPence = toIntPence(safe.totalPence);
  const lineSumPence = lines.reduce((s, l) => s + (l.lineTotalPence || 0), 0);
  const haveStated = statedTotalPence != null;
  const discrepancyPence = haveStated ? statedTotalPence - lineSumPence : null;
  const reconciled = haveStated ? discrepancyPence === 0 : false;

  // --- spend row. The receipt total is the truth for what was paid. ----------
  // Use the stated total when present; otherwise fall back to the line sum and
  // leave reconciled=false so the UI shows it needs a human check.
  const spendAmount = haveStated ? statedTotalPence : (lineSumPence || null);
  const spend = spendAmount != null && spendAmount > 0 ? {
    amountPence: spendAmount,
    category: 'grocery',
    spendDate: purchaseDate,
    note: `Receipt${retailer ? ' — ' + retailer : ''}`,
  } : null;

  // --- pantry lots: every PROPOSE/REVIEW line that resolved to an ingredient.
  // UNMATCHED lines still count toward spend but never touch pantry or price.
  const pantryItems = lines
    .filter((l) => l.ingredientId && (l.status === 'PROPOSE' || l.status === 'REVIEW'))
    .map((l) => ({
      itemKind: 'ingredient',
      ingredientId: l.ingredientId,
      label: l.ingredientName,
      quantity: l.quantity,
      unit: l.unit,
      location: l.defaultLocation,   // null -> confirm card must set it
      costPence: l.observedPricePence,
      expiryDate: null,              // auto-derives server-side from shelf_life_days
      boughtDate: purchaseDate,
      note: null,
    }));

  // --- price updates: the moat feed. Only from resolved lines with a real
  // observed pack price. source='RECEIPT', dated to the purchase.
  // NOTE: packSize is passed through only when the extraction gives a real one;
  // null means "keep the ingredient's existing pack_size" (the extended
  // set_ingredient_price RPC must treat null packSize as leave-unchanged).
  const priceUpdates = lines
    .filter((l) => l.ingredientId && (l.status === 'PROPOSE' || l.status === 'REVIEW') && l.observedPricePence != null)
    .map((l) => ({
      ingredientId: l.ingredientId,
      pricePence: l.observedPricePence,     // as-bought pack price
      packSize: null,                       // see note above
      source: 'RECEIPT',
      fetchedAt: purchaseDate,
    }));

  const summary = {
    lineCount: lines.length,
    matched: lines.filter((l) => l.status === 'PROPOSE').length,
    review: lines.filter((l) => l.status === 'REVIEW').length,
    unmatched: lines.filter((l) => l.status === 'UNMATCHED').length,
  };

  return {
    retailer,
    purchaseDate,
    lines,
    totals: { statedTotalPence, lineSumPence, reconciled, discrepancyPence },
    commitPlan: { spend, pantryItems, priceUpdates },
    summary,
  };
}

// interpretReceipt is the symmetric name (mirrors parseIntent's interpretIntent)
// and is what app/api/receipt/route.js and app/capture/page.js import. Keep
// matchReceipt too so the receipt test-suite (which calls it by that name) is unchanged.
const interpretReceipt = matchReceipt;

module.exports = { matchReceipt, interpretReceipt, matchLine, packPricePence, STRONG_MATCH, WEAK_MATCH };
