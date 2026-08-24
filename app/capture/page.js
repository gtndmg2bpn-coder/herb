// app/capture/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { ReceiptCapture } from '../../components/ReceiptCapture';
import { ReceiptConfirmCard } from '../../components/ReceiptConfirmCard';
import { interpretReceipt } from '../../lib/matchReceipt';

// Editorial chrome tokens (match /plan and /dashboard).
const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';
const GREEN = '#7BB88F';

const cardStyle = { background: '#FFFFFF', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: '24px 28px' };
const eyebrowStyle = { fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 };

// Parse one typed line into the same shape the vision model would emit, so it runs
// through the identical brain. The confirm card is the safety net for anything the
// parser gets wrong — the user can re-pick the ingredient, fix quantity, etc.
function parseManualLine(raw) {
  const text = String(raw).trim();
  if (!text) return null;
  let work = ` ${text} `;

  let price = null;
  const gbp = work.match(/£\s*\d+(?:\.\d{1,2})?/);
  if (gbp) { price = gbp[0].replace(/\s+/g, ''); work = work.replace(gbp[0], ' '); }
  else {
    const trail = work.match(/(\d+\.\d{1,2})\s*$/);
    if (trail) { price = `£${trail[1]}`; work = work.replace(trail[0], ' '); }
  }

  let pack_size = null;
  const pack = work.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/i);
  if (pack) { pack_size = `${pack[1]}${pack[2].toLowerCase()}`; work = work.replace(pack[0], ' '); }

  let quantity = 1;
  const qty = work.match(/^\s*(\d+)\s*[x×]\s*/i);
  if (qty) { quantity = parseInt(qty[1], 10) || 1; work = work.replace(qty[0], ' '); }

  const guess = work.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { raw_text: text, canonical_guess: guess || null, quantity, pack_size, price };
}

function buildManualProposal(text, master) {
  const lines = String(text).split('\n').map(parseManualLine).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  return interpretReceipt({ store: 'Typed in', purchase_date: today, currency: 'GBP', total: null, lines }, master);
}

export default function CapturePage() {
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [addedCount, setAddedCount] = useState(0);

  const [mode, setMode] = useState('type');        // 'type' works now; 'photo' needs the vision key
  const [text, setText] = useState('');
  const [manualProposal, setManualProposal] = useState(null);
  const [manualNote, setManualNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = getBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!cancelled) { setLoggedOut(true); setLoading(false); } return; }
      // `unit` is loaded so the price-write can express pack size in the ingredient's unit.
      const { data: rows } = await supabase.from('ingredients').select('id, name, unit').order('name');
      if (cancelled) return;
      setIngredients(rows || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const onCommitted = (data) => setAddedCount((c) => c + (Array.isArray(data) ? data.length : 1));

  const readLines = () => {
    setManualNote(null);
    const proposal = buildManualProposal(text, ingredients);
    if (!proposal || proposal.lineCount === 0) {
      setManualNote('Type one item per line, e.g. "chicken breast 650g £3.90".');
      return;
    }
    setManualProposal(proposal);
  };

  const resetManual = () => { setManualProposal(null); setText(''); };

  const toggle = (m) => ({
    padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', borderRadius: 100,
    border: `1.5px solid ${HAIRLINE}`, fontFamily: 'inherit',
    background: mode === m ? INK : 'transparent', color: mode === m ? CREAM : MUTED,
  });

  return (
    <main style={{ background: CREAM, minHeight: '100vh', color: INK }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 64px' }}>
        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: MUTED, textDecoration: 'none' }}>← Dashboard</Link>

        {loading ? (
          <div style={{ ...cardStyle, marginTop: 24, color: MUTED, fontSize: 14 }}>Loading…</div>
        ) : loggedOut ? (
          <div style={{ ...cardStyle, marginTop: 24 }}>
            <div style={eyebrowStyle}>Add shopping</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sign in to add shopping.</div>
          </div>
        ) : (
          <>
            <header style={{ marginTop: 24, marginBottom: 24 }}>
              <div style={{ ...eyebrowStyle, color: PINK }}>Add shopping</div>
              <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>Add to your pantry</h1>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>
                Type what you bought and Herb matches it to your ingredients, with prices — then it lands in your pantry.
              </div>
            </header>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button type="button" style={toggle('type')} onClick={() => setMode('type')}>Type it in</button>
              <button type="button" style={toggle('photo')} onClick={() => setMode('photo')}>Photo</button>
            </div>

            {mode === 'type' ? (
              manualProposal ? (
                <section style={cardStyle}>
                  <ReceiptConfirmCard
                    proposal={manualProposal}
                    ingredients={ingredients}
                    onCommitted={(d) => { onCommitted(d); resetManual(); }}
                    onCancel={resetManual}
                  />
                </section>
              ) : (
                <section style={cardStyle}>
                  <label style={{ ...eyebrowStyle }}>One item per line</label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    placeholder={'chicken breast 650g £3.90\nsemi-skimmed milk 2L £1.45\n2 x tinned tomatoes 400g £0.90'}
                    style={{ width: '100%', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: 12, fontSize: 14, fontFamily: 'inherit', color: INK, boxSizing: 'border-box', resize: 'vertical' }}
                  />
                  {manualNote ? <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>{manualNote}</div> : null}
                  <button
                    type="button"
                    onClick={readLines}
                    style={{ marginTop: 14, background: INK, color: CREAM, border: 'none', borderRadius: 100, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Read these lines
                  </button>
                </section>
              )
            ) : (
              <section style={cardStyle}>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
                  Photo scanning uses the vision model and needs the API key set up — parked for now. Use <b style={{ color: INK }}>Type it in</b> in the meantime; it runs through the same matching and pricing.
                </div>
                <ReceiptCapture ingredients={ingredients} onCommitted={onCommitted} />
              </section>
            )}

            {addedCount > 0 ? (
              <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: GREEN }}>
                Added {addedCount} item{addedCount === 1 ? '' : 's'} to your pantry so far.
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
