// components/ReceiptConfirmCard.js
'use client';

import { useMemo, useState } from 'react';
import { addPantryItems, setIngredientPrice } from '../lib/actions';

const LOCATIONS = ['fridge', 'freezer', 'cupboard'];

const CARD = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 12,
  padding: 16,
  fontFamily: 'inherit',
};

const MUTED = '#666';
const GREEN = '#3b7d3b';

const input = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: '#fff',
  boxSizing: 'border-box',
};

const smallButton = {
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#fff',
  padding: '6px 10px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// Convert a receipt pack-size string ("650g", "1kg", "2L") into a plain number
// expressed in the ingredient's own unit — the shape set_ingredient_price wants
// (pack_size is a number in the ingredient's `unit`, e.g. 650 when unit is 'g').
// Returns null when it can't convert safely, so the price-write is skipped rather
// than writing a wrong per-unit basis. Same-family conversions only (g↔kg, ml↔l).
const G = { g: 1, kg: 1000 };
const ML = { ml: 1, cl: 10, l: 1000 };
function packSizeToNumber(text, ingredientUnit) {
  if (text == null) return null;
  const m = String(text).trim().toLowerCase().match(/([0-9]*\.?[0-9]+)\s*([a-z]+)?/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const from = m[2] || '';
  const to = (ingredientUnit || '').toLowerCase();
  if (!from || !to || from === to) return value;      // already in the right unit (or no unit info)
  if (from in G && to in G) return (value * G[from]) / G[to];
  if (from in ML && to in ML) return (value * ML[from]) / ML[to];
  return null;                                          // cross-family / unknown → don't guess
}

function money(pence) {
  if (pence == null) return '—';
  return `£${(Number(pence) / 100).toFixed(2)}`;
}

function statusChip(status) {
  const base = {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 999,
    padding: '2px 8px',
    border: '1px solid #ddd',
    color: MUTED,
    background: '#fff',
  };
  if (status === 'PROPOSE') return { ...base, color: GREEN, borderColor: GREEN };
  if (status === 'REVIEW') return { ...base, color: '#8a5a00', borderColor: '#8a5a00' };
  return { ...base, color: '#a00000', borderColor: '#a00000' };
}

// KIMI NOTE: the card keeps priceArgs on the row but never calls the price write —
// set_ingredient_price is not live yet (see brief §5.3). Commit sends addStockArgs only.
export function ReceiptConfirmCard({ proposal, ingredients = [], onCommitted, onCancel }) {
  const [rows, setRows] = useState(() => (proposal?.lines || []).map((line) => ({
    ...line,
    included: line.status === 'PROPOSE' || line.status === 'REVIEW',
    quantity: line.quantity ?? 1,
    location: line.addStockArgs?.location ?? '',
    matchedIngredientId: line.match?.ingredientId ?? null,
    matchedName: line.match?.name ?? null,
    search: '',
    showAlternatives: false,
  })));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [committed, setCommitted] = useState(false);

  const ingredientNameById = useMemo(
    () => Object.fromEntries((ingredients || []).map((ing) => [ing.id, ing.name])),
    [ingredients],
  );

  const ingredientUnitById = useMemo(
    () => Object.fromEntries((ingredients || []).map((ing) => [ing.id, ing.unit ?? null])),
    [ingredients],
  );

  // Price-write args for a confirmed row, or null to skip it. Uses the CONFIRMED
  // ingredient (so a REVIEW/UNMATCHED swap writes the right one) and only when the
  // pack size resolves to the ingredient's unit. Skipping never blocks the commit.
  const buildPriceArgs = (row) => {
    if (!row.matchedIngredientId || row.packPricePence == null) return null;
    const sizeText = (row.priceArgs && row.priceArgs.packSize) || row.pack_size || null;
    const packSize = packSizeToNumber(sizeText, ingredientUnitById[row.matchedIngredientId]);
    if (packSize == null) return null;
    return {
      ingredientId: row.matchedIngredientId,
      pricePence: row.packPricePence,
      packSize,
      source: 'RECEIPT',
      fetchedAt: proposal?.date ?? null,
    };
  };

  const updateRow = (index, patch) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const pickIngredient = (index, ingredient) => {
    updateRow(index, {
      matchedIngredientId: ingredient.id,
      matchedName: ingredient.name,
      search: '',
      included: true,
      status: 'PROPOSE',
      reason: null,
    });
  };

  const buildAddStockArgs = (row) => {
    if (!row.matchedIngredientId) return null;
    if (!row.location) return null;
    // KIMI NOTE: rebuilt from the confirmed row state (not passed through blindly) so
    // UNMATCHED picks, REVIEW swaps, quantity edits and the required location all land
    // in the same shape matchReceipt emits for PROPOSE lines.
    return {
      itemKind: 'ingredient',
      ingredientId: row.matchedIngredientId,
      label: row.matchedName || ingredientNameById[row.matchedIngredientId] || row.rawText,
      quantity: Number(row.quantity) > 0 ? Number(row.quantity) : 1,
      unit: row.unit ?? null,
      location: row.location,
      costPence: row.packPricePence ?? null,
      boughtDate: proposal?.date ?? null,
    };
  };

  const includedRows = rows.filter((row) => row.included);
  const committable = includedRows.filter((row) => buildAddStockArgs(row) !== null);
  const blockedCount = includedRows.length - committable.length;

  const handleCommit = async () => {
    if (busy || committed || committable.length === 0 || blockedCount > 0) return;
    setBusy(true);
    setResult(null);
    const { data, error } = await addPantryItems(committable.map(buildAddStockArgs));
    if (error) {
      setBusy(false);
      setResult({ ok: false, message: error.message || 'Could not add those items.' });
      return;
    }

    // Best-effort price-write. Stock is already banked, so a failed/skipped price
    // update must never fail the commit — we settle all and ignore the outcomes.
    const priceArgs = committable.map(buildPriceArgs).filter(Boolean);
    if (priceArgs.length) {
      await Promise.allSettled(priceArgs.map((args) => setIngredientPrice(args)));
    }

    setBusy(false);
    setCommitted(true);
    setResult({ ok: true, message: `Added ${committable.length} item${committable.length === 1 ? '' : 's'} to your pantry.` });
    if (onCommitted) onCommitted(data);
  };

  if (!proposal) return null;

  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Check your receipt</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            {[proposal.store, proposal.date, `${proposal.lineCount ?? rows.length} lines`].filter(Boolean).join(' · ')}
            {proposal.needsReview ? ` · ${proposal.needsReview} need a look` : ''}
          </div>
        </div>
        {onCancel ? (
          <button type="button" onClick={onCancel} style={{ ...smallButton, border: 'none', fontSize: 16, padding: '2px 6px' }}>
            ✕
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row, index) => {
          const matches = (ingredients || []).filter((ing) => {
            if (!row.search) return true;
            return ing.name.toLowerCase().includes(row.search.toLowerCase());
          }).slice(0, 6);

          return (
            <div key={`${row.rawText}-${index}`} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, opacity: row.included ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, color: MUTED }}>{row.rawText}</div>
                <span style={statusChip(row.status)}>{row.status}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={(event) => updateRow(index, { included: event.target.checked })}
                  />
                  Include
                </label>

                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {row.matchedName || 'Pick an ingredient'}
                </span>

                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: MUTED }}>
                  Qty
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={row.quantity}
                    onChange={(event) => updateRow(index, { quantity: event.target.value })}
                    style={{ ...input, width: 64, padding: '4px 8px' }}
                  />
                </label>

                <select
                  value={row.location}
                  onChange={(event) => updateRow(index, { location: event.target.value })}
                  style={{ ...input, padding: '4px 8px' }}
                >
                  <option value="">Location…</option>
                  {LOCATIONS.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>

                <span style={{ marginLeft: 'auto', fontSize: 14 }}>{money(row.packPricePence)}</span>
              </div>

              {row.reason ? (
                <div style={{ fontSize: 12, color: '#a00000', marginTop: 6 }}>{row.reason}</div>
              ) : null}

              {row.status === 'REVIEW' && (row.alternatives || []).length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <button type="button" style={smallButton} onClick={() => updateRow(index, { showAlternatives: !row.showAlternatives })}>
                    {row.showAlternatives ? 'Hide alternatives' : 'Swap match'}
                  </button>
                  {row.showAlternatives ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {row.alternatives.map((alt) => (
                        <button
                          key={alt.ingredientId}
                          type="button"
                          style={smallButton}
                          onClick={() => pickIngredient(index, { id: alt.ingredientId, name: alt.name })}
                        >
                          {alt.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {row.status === 'UNMATCHED' ? (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    value={row.search}
                    placeholder="Search ingredients…"
                    onChange={(event) => updateRow(index, { search: event.target.value })}
                    style={{ ...input, width: '100%' }}
                  />
                  {row.search ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {matches.length === 0 ? (
                        <span style={{ fontSize: 12, color: MUTED }}>No matches — keep typing.</span>
                      ) : matches.map((ing) => (
                        <button key={ing.id} type="button" style={smallButton} onClick={() => pickIngredient(index, ing)}>
                          {ing.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {blockedCount > 0 ? (
        <div style={{ fontSize: 12, color: '#a00000' }}>
          {blockedCount} included row{blockedCount === 1 ? '' : 's'} still need{blockedCount === 1 ? 's' : ''} an ingredient or a location.
        </div>
      ) : null}

      {result ? (
        <div style={{ fontSize: 13, color: result.ok ? GREEN : '#a00000' }}>{result.message}</div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel ? (
          <button type="button" onClick={onCancel} style={smallButton} disabled={busy}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleCommit}
          disabled={busy || committed || committable.length === 0 || blockedCount > 0}
          style={{
            ...smallButton,
            border: 'none',
            background: GREEN,
            color: '#fff',
            fontWeight: 700,
            padding: '10px 16px',
            opacity: busy || committed || committable.length === 0 || blockedCount > 0 ? 0.5 : 1,
          }}
        >
          {busy ? 'Adding…' : committed ? 'Added' : `Add ${committable.length} item${committable.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

export default ReceiptConfirmCard;
