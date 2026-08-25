// components/CaptureBar.js
'use client';

// Global capture bar — fixed to the bottom of every page (mounted in app/layout.js).
// Pure presentation: renders proposals from /api/intent and fires commits on a tap.
// It never builds a write itself — commitProposal (text/voice) and <ReceiptCapture>
// (photo) are the only commit paths used here.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../lib/supabaseBrowser';
import { ReceiptCapture } from './ReceiptCapture';
import CaptureTextPanel from './CaptureTextPanel';

// Editorial chrome tokens (match /plan, /dashboard and app/capture/page.js).
const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';
const GREEN = '#7BB88F';

const eyebrowStyle = { fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 };

export default function CaptureBar() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null (menu) | 'text' | 'voice' | 'photo'
  const [toast, setToast] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const toastTimer = useRef(null);
  const dragStartY = useRef(null);

  // Load the session + canonical ingredient master once, for both text/voice
  // (sent in the /api/intent body) and photo (passed into <ReceiptCapture>).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { if (!cancelled) { setLoggedIn(false); setLoading(false); } return; }
        const { data: rows } = await supabase
          .from('ingredients').select('id, name, unit').order('name');
        if (cancelled) return;
        setIngredients(rows || []);
        setLoggedIn(true);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Esc closes the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Clean up any pending toast timer on unmount.
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = (msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const openSheet = () => {
    if (!loading && !loggedIn) { router.push('/login'); return; }
    setMode(null);
    setOpen(true);
  };

  const closeSheet = () => {
    setOpen(false);
    setMode(null);
    setDragOffset(0);
    dragStartY.current = null;
  };

  // Photo mode: <ReceiptCapture> owns the whole flow; we just react to the commit.
  const handleCommitted = () => {
    closeSheet();
    showToast('Added.');
  };

  // Drag-down to close, tracked on the grab handle only so the sheet body still scrolls.
  const onHandleTouchStart = (e) => { dragStartY.current = e.touches[0].clientY; };
  const onHandleTouchMove = (e) => {
    if (dragStartY.current == null) return;
    setDragOffset(Math.max(0, e.touches[0].clientY - dragStartY.current));
  };
  const onHandleTouchEnd = () => {
    if (dragOffset > 90) closeSheet();
    else setDragOffset(0);
    dragStartY.current = null;
  };

  const modeButton = (m, label, hint) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: '#FFFFFF', border: `1px solid ${HAIRLINE}`, borderRadius: 16,
        padding: '14px 16px', fontFamily: 'inherit', color: INK,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700 }}>{label}</span>
      <span style={{ display: 'block', fontSize: 13, color: MUTED, marginTop: 2 }}>{hint}</span>
    </button>
  );

  return (
    <>
      {/* In-flow spacer so page content is never trapped behind the fixed bar. */}
      <div aria-hidden="true" style={{ height: 'calc(72px + env(safe-area-inset-bottom))' }} />

      {/* The bar itself. */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
          background: CREAM, borderTop: `1px solid ${HAIRLINE}`,
          padding: '10px 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={openSheet}
            aria-label="Add anything"
            style={{
              width: 44, height: 44, borderRadius: 100, border: 'none', cursor: 'pointer',
              background: PINK, color: INK, fontSize: 24, fontWeight: 700, lineHeight: 1,
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={openSheet}
            style={{
              flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: MUTED, fontFamily: 'inherit', padding: 0,
            }}
          >
            Add anything…
          </button>
        </div>
      </div>

      {/* Success toast (GREEN), floats above the bar. */}
      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 60,
            bottom: 'calc(92px + env(safe-area-inset-bottom))',
            background: GREEN, color: '#FFFFFF', borderRadius: 100,
            padding: '10px 20px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            boxShadow: '0 6px 24px rgba(42,41,50,0.18)', whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      ) : null}

      {/* Bottom sheet: tap the dim backdrop to dismiss. */}
      {open ? (
        <div
          onClick={closeSheet}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(42,41,50,0.35)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              maxWidth: 640, margin: '0 auto',
              background: CREAM, borderTop: `1px solid ${HAIRLINE}`,
              borderRadius: '20px 20px 0 0',
              padding: '8px 20px 20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
              maxHeight: '85vh', overflowY: 'auto',
              transform: `translateY(${dragOffset}px)`,
            }}
          >
            {/* Grab handle — tap-out, drag-down or Esc all dismiss the sheet. */}
            <div
              onTouchStart={onHandleTouchStart}
              onTouchMove={onHandleTouchMove}
              onTouchEnd={onHandleTouchEnd}
              style={{ padding: '8px 0 12px', cursor: 'grab', touchAction: 'none' }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 100, background: HAIRLINE, margin: '0 auto' }} />
            </div>

            {loading ? (
              <div style={{ fontSize: 14, color: MUTED, padding: '12px 4px 20px' }}>Loading…</div>
            ) : mode === null ? (
              <div>
                <div style={eyebrowStyle}>Add anything</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {modeButton('text', 'Text', 'Type it — “2 chicken breasts to the freezer”')}
                  {modeButton('voice', 'Voice', 'Say it, check it, send it')}
                  {modeButton('photo', 'Photo', 'Snap a receipt and Herb reads it')}
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px',
                    fontSize: 13, fontWeight: 600, color: MUTED, fontFamily: 'inherit',
                  }}
                >
                  ← All options
                </button>
                {mode === 'photo' ? (
                  <ReceiptCapture ingredients={ingredients} onCommitted={handleCommitted} />
                ) : (
                  <CaptureTextPanel
                    mode={mode}
                    ingredients={ingredients}
                    onToast={showToast}
                    onClose={closeSheet}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
