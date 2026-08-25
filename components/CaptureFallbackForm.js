// components/CaptureFallbackForm.js
'use client';

// The FALLBACK guided form: the brain understood the intent but not enough to
// one-tap it, so we render a small form for proposal.intent, pre-filled from
// proposal.args, with the ingredient picker seeded from proposal.alternatives
// (falling back to the full ingredients list). Every field binds to the exact
// args key the commit expects — no keys are renamed. Save hands the mutated
// args back to the parent, which commits through commitProposal (the only
// write path).

import { useState } from 'react';

const INK = '#2A2932';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';

const cardStyle = { background: '#FFFFFF', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: '24px 28px' };
const eyebrowStyle = { fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 };
const inputStyle = {
  width: '100%', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: '10px 12px',
  fontSize: 14, fontFamily: 'inherit', color: INK, background: '#FFFFFF', boxSizing: 'border-box',
};
const fieldWrap = { marginBottom: 14 };

// Exactly three pantry locations — there is no fourth option (spec §6c).
const LOCATIONS = ['fridge', 'freezer', 'cupboard'];
const CATEGORIES = ['grocery', 'eating_out', 'sundry'];

const INTENT_TITLES = {
  add_stock: 'Add to pantry',
  bin_stock: 'Bin stock',
  log_spend: 'Log a spend',
  log_weight: 'Log weight',
  log_off_plan: 'Log an off-plan meal',
};

function defaultArgsFor(intent) {
  switch (intent) {
    case 'add_stock':
      return { items: [{ itemKind: 'ingredient', ingredientId: null, label: '', quantity: 1, unit: '', location: 'fridge', costPence: null, boughtDate: '' }] };
    case 'bin_stock':
      return { itemKind: 'ingredient', ingredientId: null, label: '', quantity: 1, location: 'fridge' };
    case 'log_spend':
      return { amountPence: null, category: 'grocery', spendDate: '', note: '' };
    case 'log_weight':
      return { weightKg: null, note: '' };
    case 'log_off_plan':
      return { description: '', kcal: null, confidence: 'ESTIMATED', source: 'capture_bar', intakeDate: '', costPence: null };
    default:
      return {};
  }
}

function penceToPounds(pence) {
  return typeof pence === 'number' ? (pence / 100).toFixed(2) : '';
}

function poundsToPence(str) {
  const n = parseFloat(str);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Drop optional keys left empty so the committed args keep the brain's shape
// (omitted, not empty strings). Required keys are validated before this runs.
function omitEmpty(obj, keys) {
  const out = { ...obj };
  for (const k of keys) {
    if (out[k] === '' || out[k] === null || out[k] === undefined) delete out[k];
  }
  return out;
}

// Picker seeded from the brain's candidate list, with the full master
// underneath. Only ids from these two lists can ever be chosen — never typed.
function IngredientPicker({ value, alternatives, ingredients, onPick }) {
  const alts = Array.isArray(alternatives) ? alternatives : [];
  const altIds = new Set(alts.map((a) => a.id));
  const rest = (ingredients || []).filter((i) => !altIds.has(i.id));
  const handle = (e) => {
    const id = e.target.value;
    const found = alts.find((a) => a.id === id) || (ingredients || []).find((i) => i.id === id);
    onPick(found ? { id: found.id, name: found.name, unit: found.unit || '' } : null);
  };
  return (
    <select value={value || ''} onChange={handle} style={inputStyle}>
      <option value="">Pick an ingredient…</option>
      {alts.length > 0 ? (
        <optgroup label="Suggestions">
          {alts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </optgroup>
      ) : null}
      <optgroup label={alts.length > 0 ? 'All ingredients' : 'Ingredients'}>
        {rest.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </optgroup>
    </select>
  );
}

export default function CaptureFallbackForm({ proposal, ingredients, busy, error, onSave, onCancel }) {
  const [intent, setIntent] = useState(proposal.intent || null);
  const [args, setArgs] = useState(() => (proposal.args ? JSON.parse(JSON.stringify(proposal.args)) : {}));
  const [formError, setFormError] = useState(null);

  // intent === null: the brain couldn't tell which log — let the user pick.
  const pickIntent = (next) => {
    setIntent(next);
    setArgs({ ...defaultArgsFor(next), ...(proposal.args || {}) });
    setFormError(null);
  };

  const patch = (p) => setArgs((a) => ({ ...a, ...p }));

  // add_stock carries an items array; the form edits the first (usually only) item.
  const item0 = (args.items && args.items[0]) || defaultArgsFor('add_stock').items[0];
  const patchItem = (p) => setArgs((a) => ({
    ...a,
    items: [{ ...((a.items && a.items[0]) || defaultArgsFor('add_stock').items[0]), ...p }],
  }));

  const pickIngredient = (target) => (picked) => {
    if (!picked) return;
    if (target === 'item') {
      // Pre-fill the unit from the master when the brain didn't supply one.
      patchItem({ ingredientId: picked.id, label: picked.name, unit: item0.unit || picked.unit || '' });
    } else {
      patch({ ingredientId: picked.id, label: picked.name });
    }
  };

  const save = () => {
    setFormError(null);
    let next;
    if (intent === 'add_stock') {
      if (!item0.ingredientId) { setFormError('Pick an ingredient.'); return; }
      if (!item0.location) { setFormError('Pick a location.'); return; }
      const qty = Number(item0.quantity);
      const clean = omitEmpty(
        { ...item0, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1 },
        ['unit', 'costPence', 'boughtDate'],
      );
      next = { ...args, items: [clean] };
    } else if (intent === 'bin_stock') {
      if (!args.ingredientId) { setFormError('Pick an ingredient.'); return; }
      const qty = Number(args.quantity);
      next = { ...args, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1 };
    } else if (intent === 'log_spend') {
      if (!(typeof args.amountPence === 'number' && args.amountPence > 0)) { setFormError('Enter an amount.'); return; }
      next = omitEmpty(args, ['spendDate', 'note']);
    } else if (intent === 'log_weight') {
      const w = Number(args.weightKg);
      if (!Number.isFinite(w) || w <= 0) { setFormError('Enter your weight in kg.'); return; }
      next = omitEmpty({ ...args, weightKg: w }, ['note']);
    } else if (intent === 'log_off_plan') {
      if (!String(args.description || '').trim()) { setFormError('Describe what you had.'); return; }
      next = omitEmpty({ ...args, description: String(args.description).trim() }, ['intakeDate', 'costPence', 'kcal']);
    } else {
      return;
    }
    onSave(next);
  };

  const shown = formError || error;

  // ---- intent === null: small mode menu ----
  if (!intent) {
    return (
      <section style={cardStyle}>
        <div style={eyebrowStyle}>What are you logging?</div>
        {proposal.reason ? (
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>{proposal.reason}</div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.keys(INTENT_TITLES).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => pickIntent(key)}
              style={{
                textAlign: 'left', cursor: 'pointer', background: '#FFFFFF',
                border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: '12px 14px',
                fontSize: 14, fontWeight: 700, color: INK, fontFamily: 'inherit',
              }}
            >
              {INTENT_TITLES[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            marginTop: 14, background: 'transparent', color: MUTED, border: `1.5px solid ${HAIRLINE}`,
            borderRadius: 100, padding: '10px 22px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
      </section>
    );
  }

  // ---- the guided form ----
  return (
    <section style={cardStyle}>
      <div style={eyebrowStyle}>A few details — {INTENT_TITLES[intent] || intent}</div>
      {proposal.reason ? (
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>{proposal.reason}</div>
      ) : null}

      {intent === 'add_stock' ? (
        <>
          <div style={fieldWrap}>
            <label style={labelStyle}>Ingredient</label>
            <IngredientPicker
              value={item0.ingredientId}
              alternatives={proposal.alternatives}
              ingredients={ingredients}
              onPick={pickIngredient('item')}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Quantity</label>
            <input
              type="number" min="0" step="any" value={item0.quantity ?? 1}
              onChange={(e) => patchItem({ quantity: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Unit (optional)</label>
            <input
              type="text" value={item0.unit || ''} placeholder="e.g. pack, 650g"
              onChange={(e) => patchItem({ unit: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Location</label>
            <select value={item0.location || 'fridge'} onChange={(e) => patchItem({ location: e.target.value })} style={inputStyle}>
              {LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Cost £ (optional)</label>
            <input
              type="number" min="0" step="0.01" value={penceToPounds(item0.costPence)} placeholder="0.00"
              onChange={(e) => patchItem({ costPence: poundsToPence(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Date (optional)</label>
            <input
              type="date" value={item0.boughtDate || ''}
              onChange={(e) => patchItem({ boughtDate: e.target.value })}
              style={inputStyle}
            />
          </div>
        </>
      ) : null}

      {intent === 'bin_stock' ? (
        <>
          <div style={fieldWrap}>
            <label style={labelStyle}>Ingredient</label>
            <IngredientPicker
              value={args.ingredientId}
              alternatives={proposal.alternatives}
              ingredients={ingredients}
              onPick={pickIngredient('args')}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Quantity</label>
            <input
              type="number" min="0" step="any" value={args.quantity ?? 1}
              onChange={(e) => patch({ quantity: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Location</label>
            <select value={args.location || 'fridge'} onChange={(e) => patch({ location: e.target.value })} style={inputStyle}>
              {LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
        </>
      ) : null}

      {intent === 'log_spend' ? (
        <>
          <div style={fieldWrap}>
            <label style={labelStyle}>Amount £</label>
            <input
              type="number" min="0" step="0.01" value={penceToPounds(args.amountPence)} placeholder="0.00"
              onChange={(e) => patch({ amountPence: poundsToPence(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Category</label>
            <select value={args.category || 'grocery'} onChange={(e) => patch({ category: e.target.value })} style={inputStyle}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Date (optional)</label>
            <input
              type="date" value={args.spendDate || ''}
              onChange={(e) => patch({ spendDate: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Note (optional)</label>
            <input
              type="text" value={args.note || ''}
              onChange={(e) => patch({ note: e.target.value })}
              style={inputStyle}
            />
          </div>
        </>
      ) : null}

      {intent === 'log_weight' ? (
        <>
          <div style={fieldWrap}>
            <label style={labelStyle}>Weight (kg)</label>
            <input
              type="number" min="0" step="any" value={args.weightKg ?? ''} placeholder="e.g. 82.4"
              onChange={(e) => patch({ weightKg: e.target.value === '' ? null : parseFloat(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Note (optional)</label>
            <input
              type="text" value={args.note || ''}
              onChange={(e) => patch({ note: e.target.value })}
              style={inputStyle}
            />
          </div>
        </>
      ) : null}

      {intent === 'log_off_plan' ? (
        <>
          <div style={fieldWrap}>
            <label style={labelStyle}>What did you have?</label>
            <input
              type="text" value={args.description || ''} placeholder="e.g. pub fish and chips"
              onChange={(e) => patch({ description: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Calories (optional)</label>
            <input
              type="number" min="0" step="1" value={args.kcal ?? ''}
              onChange={(e) => patch({ kcal: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Cost £ (optional)</label>
            <input
              type="number" min="0" step="0.01" value={penceToPounds(args.costPence)} placeholder="0.00"
              onChange={(e) => patch({ costPence: poundsToPence(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Date (optional)</label>
            <input
              type="date" value={args.intakeDate || ''}
              onChange={(e) => patch({ intakeDate: e.target.value })}
              style={inputStyle}
            />
          </div>
        </>
      ) : null}

      {shown ? (
        <div style={{ fontSize: 13, color: '#a00000', marginBottom: 12 }}>{shown}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            background: PINK, color: INK, border: 'none', borderRadius: 100,
            padding: '10px 22px', fontSize: 14, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            background: 'transparent', color: MUTED, border: `1.5px solid ${HAIRLINE}`,
            borderRadius: 100, padding: '10px 22px', fontSize: 14, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
