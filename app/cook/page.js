// GitHub path:  app/cook/page.js          ← NEW FILE. Creates nothing else, overwrites nothing.
// Route:        /cook
//
// "I cooked something" — bank a cook that was never in the plan.
//
// This is the missing entry point. cook_meal() can only bank a cook that matches
// a planned slot on a planned day; this banks a pot you actually made, planned or
// not, and it is the only reason the cooked_portion ledger can ever be non-empty.
//
// DELIBERATELY does NOT assume you eat it today. Cooking is a production event;
// eating is a separate consumption event against the stock this creates. Cook a
// casserole Sunday, eat it Tuesday — the ledger holds the portions in between.

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';

const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const GREEN = '#7BB88F';
const AMBER = '#C99A5B';

export default function CookPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [query, setQuery] = useState('');
  const [recipeId, setRecipeId] = useState('');
  const [fresh, setFresh] = useState(2);
  const [freeze, setFreeze] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      const supabase = getBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data, error: readErr } = await supabase
        .from('recipes')
        .select('id, name, freezes, batch_portions, fresh_portions, fresh_shelf_days')
        .order('name');
      if (readErr) setError(readErr.message);
      setRecipes(data || []);
      setLoading(false);
    })();
  }, [router]);

  const recipe = useMemo(
    () => recipes.find((r) => r.id === recipeId) || null,
    [recipes, recipeId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? recipes.filter((r) => r.name.toLowerCase().includes(q)) : recipes;
  }, [recipes, query]);

  // Pre-fill the split from the recipe's own cook rules whenever it changes.
  function chooseRecipe(id) {
    setRecipeId(id);
    setResult(null);
    setError(null);
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    const batch = r.batch_portions ?? 4;
    const f = r.fresh_portions ?? 2;
    setFresh(f);
    setFreeze(r.freezes === false ? 0 : Math.max(batch - f, 0));
  }

  async function bankIt() {
    if (!recipe) { setError('Pick what you cooked first.'); return; }
    if (fresh + freeze < 1) { setError('That has to be at least one portion.'); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const supabase = getBrowserClient();
      const { data, error: rpcError } = await supabase.rpc('bank_cooked_portions', {
        p_recipe_id: recipe.id,
        p_fresh: fresh,
        p_freeze: recipe.freezes === false ? 0 : freeze,
        p_drain_ingredients: true,
        p_cook_date: null, // today
      });
      if (rpcError) { setError(rpcError.message); return; }
      setResult(data);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const card = {
    background: '#fff', border: `1px solid ${HAIRLINE}`,
    borderRadius: 14, padding: 16, marginBottom: 14,
  };
  const stepBtn = {
    border: `1px solid ${HAIRLINE}`, background: CREAM, color: INK,
    borderRadius: 10, padding: '6px 14px', fontSize: 18, fontWeight: 700,
    cursor: 'pointer', lineHeight: 1,
  };

  if (loading) {
    return <main style={{ background: CREAM, minHeight: '100vh', padding: 24, color: MUTED }}>Loading…</main>;
  }

  const total = fresh + (recipe?.freezes === false ? 0 : freeze);
  const shelf = recipe?.fresh_shelf_days ?? 3;

  return (
    <main style={{
      background: CREAM, minHeight: '100vh', color: INK, padding: '24px 18px 60px',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
      maxWidth: 620, margin: '0 auto',
    }}>
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 28, margin: '0 0 4px' }}>I cooked something</h1>
      <p style={{ color: MUTED, fontSize: 13, margin: '0 0 18px' }}>
        Bank a cook whether or not it was in the plan. This is what puts portions in your
        fridge and freezer — it doesn&rsquo;t assume you&rsquo;re eating it tonight.
      </p>

      {/* 1 · what did you cook */}
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: MUTED, marginBottom: 8 }}>
          1 · WHAT DID YOU COOK?
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your recipes…"
          style={{
            width: '100%', border: `1px solid ${HAIRLINE}`, background: CREAM, color: INK,
            borderRadius: 10, padding: '10px 12px', fontSize: 15, marginBottom: 8,
          }}
        />
        <select
          value={recipeId}
          onChange={(e) => chooseRecipe(e.target.value)}
          size={Math.min(Math.max(filtered.length, 2), 7)}
          style={{
            width: '100%', border: `1px solid ${HAIRLINE}`, background: '#fff', color: INK,
            borderRadius: 10, padding: 6, fontSize: 15,
          }}
        >
          {filtered.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}{r.freezes === false ? '  · fresh only' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 2 · how many portions */}
      {recipe && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: MUTED, marginBottom: 10 }}>
            2 · HOW MANY PORTIONS DID IT MAKE?
          </div>

          <Row
            label="Into the fridge"
            note={`keeps ${shelf} day${shelf === 1 ? '' : 's'} — eat across those days, no rush tonight`}
            value={fresh} onChange={setFresh} stepBtn={stepBtn}
          />

          {recipe.freezes === false ? (
            <p style={{ fontSize: 12, color: AMBER, margin: '10px 0 0', fontWeight: 600 }}>
              {recipe.name} doesn&rsquo;t freeze — all portions stay fresh.
            </p>
          ) : (
            <Row
              label="Straight into the freezer"
              note="banked now, 45-day life — this is your buffer"
              value={freeze} onChange={setFreeze} stepBtn={stepBtn}
            />
          )}

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${HAIRLINE}`, fontSize: 13, color: MUTED }}>
            {total} portion{total === 1 ? '' : 's'} total — the ingredients for all {total} come
            out of your pantry now.
          </div>
        </div>
      )}

      {/* 3 · bank it */}
      {recipe && (
        <button
          onClick={bankIt}
          disabled={busy}
          style={{
            width: '100%', border: 'none', borderRadius: 12, padding: '14px 16px',
            background: busy ? MUTED : INK, color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Banking…' : `Bank ${total} portion${total === 1 ? '' : 's'}`}
        </button>
      )}

      {error && (
        <div style={{ ...card, marginTop: 14, borderColor: '#C25B4E', color: '#C25B4E', fontSize: 14 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ ...card, marginTop: 14, borderColor: GREEN }}>
          <div style={{ fontWeight: 800, color: GREEN, marginBottom: 6 }}>
            ✓ Banked — {result.portions_total} portion{result.portions_total === 1 ? '' : 's'} of {result.recipe_name}
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            {result.portions_fresh} in the fridge · {result.portions_freeze} in the freezer.
            {' '}They&rsquo;re stock now — the planner can see them, and you eat them whenever you like.
          </div>
          {Array.isArray(result.shortfalls) && result.shortfalls.length > 0 && (
            <div style={{ fontSize: 12, color: AMBER, marginTop: 8, fontWeight: 600 }}>
              Your pantry was short on:{' '}
              {result.shortfalls.map((s) => `${s.name ?? 'an ingredient'} (${s.short}${s.unit ? ` ${s.unit}` : ''})`).join(', ')}.
              {' '}Banked anyway — top the pantry up when you shop.
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 14, fontSize: 13, fontWeight: 700 }}>
            <Link href="/dashboard" style={{ textDecoration: 'underline', color: INK }}>Dashboard</Link>
            <button
              onClick={() => { setResult(null); setRecipeId(''); setQuery(''); }}
              style={{ background: 'none', border: 'none', padding: 0, color: INK, fontSize: 13, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Bank another
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 22, fontSize: 13 }}>
        <Link href="/dashboard" style={{ textDecoration: 'underline', color: INK }}>← Back to dashboard</Link>
      </div>
    </main>
  );
}

function Row({ label, note, value, onChange, stepBtn }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#5B5966' }}>{note}</div>
      </div>
      <button style={stepBtn} onClick={() => onChange(Math.max(0, value - 1))} aria-label={`fewer ${label}`}>−</button>
      <div style={{ minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: 800 }}>{value}</div>
      <button style={stepBtn} onClick={() => onChange(value + 1)} aria-label={`more ${label}`}>+</button>
    </div>
  );
}
