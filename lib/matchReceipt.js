// lib/matchReceipt.js
// The receipt brain. Validates a vision model's per-line canonical guesses against
// the ingredient master, normalises quantity + price, and emits a typed proposal.
//
// Contract (see test/matchReceipt.test.js):
//   - NEVER emits COMMIT. Top status is PROPOSE | REJECT; line status is
//     PROPOSE | REVIEW | UNMATCHED. Committing is a deliberate user action in the
//     confirm card, never inferred here.
//   - Money is integer pence throughout. Quantity floors at 1.
//   - A matched line carries addStockArgs (shape the pantry write wants) and
//     priceArgs (shape set_ingredient_price wants). location is left null on
//     purpose — the UI must ask which shelf.
//   - No guess, or a guess with no confident match, is UNMATCHED with both arg
//     bundles null and a reason that tells the user to pick the ingredient.
//
// CommonJS on purpose: runs on bare Node for the test, and require()s cleanly
// from the server-side vision route.

const PROPOSE_MIN = 0.7; // strong match → propose to add
const REVIEW_MIN = 0.4;  // partial match → surface with alternatives to confirm

const UNMATCHED_REASON = 'no confident match — pick the ingredient';

// ── normalisers ────────────────────────────────────────────────────────────

// "£3.90" → 390 · 1.15 → 115 · "£1" → 100 · missing/garbage → null
function toPence(price) {
  if (price == null) return null;
  const num = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

// any missing / non-positive / non-finite quantity floors to 1
function toQty(quantity) {
  const n = Number(quantity);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function tokens(str) {
  return String(str || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// ── matching ───────────────────────────────────────────────────────────────

// Score a single guess against the whole master. Returns the best candidate plus
// runner-up alternatives (for the REVIEW band). Token-overlap relative to the
// guess, with a boost when either name fully contains the other.
function matchLine(guess, master) {
  const g = tokens(guess);
  const gset = new Set(g);
  const denom = Math.max(g.length, 1);
  const guessLower = String(guess || '').toLowerCase().trim();

  const scored = (master || [])
    .map((ing) => {
      const nameTokens = tokens(ing.name);
      const inter = nameTokens.filter((t) => gset.has(t)).length;
      let score = inter / denom;
      const nameLower = String(ing.name || '').toLowerCase();
      if (guessLower && (nameLower.includes(guessLower) || guessLower.includes(nameLower))) {
        score = Math.max(score, 0.9);
      }
      return { ingredientId: ing.id, name: ing.name, score: Number(score.toFixed(4)) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || { ingredientId: null, name: null, score: 0 };
  const alternatives = scored.slice(1).filter((s) => s.score > 0).slice(0, 4);
  return { ...best, alternatives };
}

// ── per-line interpretation ─────────────────────────────────────────────────

function unmatchedLine(rawText, quantity, unit, packPricePence) {
  return {
    rawText,
    match: { ingredientId: null, name: null, score: 0 },
    status: 'UNMATCHED',
    reason: UNMATCHED_REASON,
    quantity,
    unit,
    packPricePence,
    alternatives: [],
    addStockArgs: null,
    priceArgs: null,
  };
}

function interpretLine(line, master, purchaseDate) {
  const rawText = line.raw_text != null ? String(line.raw_text) : '';
  const packPricePence = toPence(line.price);
  const quantity = toQty(line.quantity);
  const unit = line.unit != null ? line.unit : null;
  const guess = String(line.canonical_guess || '').trim();

  // The model must name the item. Raw receipt text alone doesn't resolve.
  if (!guess) return unmatchedLine(rawText, quantity, unit, packPricePence);

  const m = matchLine(guess, master);

  if (m.score < REVIEW_MIN || !m.ingredientId) {
    return unmatchedLine(rawText, quantity, unit, packPricePence);
  }

  const status = m.score >= PROPOSE_MIN ? 'PROPOSE' : 'REVIEW';

  return {
    rawText,
    match: { ingredientId: m.ingredientId, name: m.name, score: m.score },
    status,
    reason: status === 'REVIEW' ? 'low-confidence match — confirm or swap' : null,
    quantity,
    unit,
    packPricePence,
    alternatives: status === 'REVIEW' ? m.alternatives : [],
    // Rebuilt again in the confirm card from the user-confirmed row; provided here
    // so a clean PROPOSE can commit with no edits once a location is chosen.
    addStockArgs: {
      itemKind: 'ingredient',
      ingredientId: m.ingredientId,
      label: m.name,
      quantity,
      unit,
      location: null, // UI must ask which shelf
      costPence: packPricePence != null ? packPricePence : null,
      boughtDate: purchaseDate != null ? purchaseDate : null,
    },
    priceArgs: {
      ingredientId: m.ingredientId,
      packPricePence: packPricePence != null ? packPricePence : null,
      packSize: line.pack_size != null ? line.pack_size : null,
      source: 'RECEIPT',
      fetchedAt: purchaseDate != null ? purchaseDate : null,
    },
  };
}

// ── receipt-level interpretation ─────────────────────────────────────────────

function interpretReceipt(vision, master) {
  // Guard: anything without a readable lines array is a hard REJECT (never throws).
  if (!vision || !Array.isArray(vision.lines)) {
    return {
      status: 'REJECT',
      store: (vision && vision.store) || null,
      date: (vision && vision.purchase_date) || null,
      currency: (vision && vision.currency) || 'GBP',
      total: (vision && vision.total) || null,
      lineCount: 0,
      needsReview: 0,
      lines: [],
      reason: 'no readable lines on this receipt',
    };
  }

  const purchaseDate = vision.purchase_date != null ? vision.purchase_date : null;
  const lines = vision.lines.map((line) => interpretLine(line || {}, master, purchaseDate));
  const needsReview = lines.filter((l) => l.status !== 'PROPOSE').length;

  return {
    status: 'PROPOSE',
    store: vision.store != null ? vision.store : null,
    date: purchaseDate,
    currency: vision.currency != null ? vision.currency : 'GBP',
    total: vision.total != null ? vision.total : null,
    lineCount: lines.length,
    needsReview,
    lines,
  };
}

module.exports = { interpretReceipt, matchLine, toPence, toQty };
