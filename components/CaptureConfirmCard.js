// components/CaptureConfirmCard.js
'use client';

// The PROPOSE confirm card: shows the brain's ready-made `display` sentence
// verbatim and commits only on the Confirm tap. On a commit error the card
// stays open with the message inline so the user can retry or cancel.

const INK = '#2A2932';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';

const cardStyle = { background: '#FFFFFF', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: '24px 28px' };
const eyebrowStyle = { fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 };

export default function CaptureConfirmCard({ proposal, busy, error, onConfirm, onCancel }) {
  return (
    <section style={cardStyle}>
      <div style={eyebrowStyle}>Check before it saves</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: INK, lineHeight: 1.35 }}>
        {proposal.display}
      </div>
      {error ? (
        <div style={{ marginTop: 10, fontSize: 13, color: '#a00000' }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            background: PINK, color: INK, border: 'none', borderRadius: 100,
            padding: '10px 22px', fontSize: 14, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Confirm'}
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
