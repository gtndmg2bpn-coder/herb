// components/ReceiptCapture.js
'use client';

import { useRef, useState } from 'react';
import { ReceiptConfirmCard } from './ReceiptConfirmCard';

const GREEN = '#3b7d3b';
const MUTED = '#666';

// Contract B sample (brief §4) — development stand-in so the UI can be verified
// before the owner's vision route exists. Production: the Capture Bar fetches the
// route and passes the real proposal + ingredient master in as props.
const SAMPLE_PROPOSAL = {
  status: 'PROPOSE',
  store: 'Tesco',
  date: '2026-08-19',
  currency: 'GBP',
  total: '£42.10',
  lineCount: 3,
  needsReview: 1,
  lines: [
    {
      rawText: 'TESCO CKN BRST 650G',
      match: { ingredientId: 'i-chick', name: 'Chicken breast', score: 0.85 },
      status: 'PROPOSE',
      reason: null,
      quantity: 1,
      unit: null,
      packPricePence: 390,
      alternatives: [],
      addStockArgs: {
        itemKind: 'ingredient', ingredientId: 'i-chick', label: 'Chicken breast',
        quantity: 1, unit: null, location: null, costPence: 390, boughtDate: '2026-08-19',
      },
      priceArgs: {
        ingredientId: 'i-chick', packPricePence: 390, packSize: '650g',
        source: 'RECEIPT', fetchedAt: '2026-08-19',
      },
    },
    {
      rawText: 'MYSTERY ITEM 4U',
      match: { ingredientId: null, name: null, score: 0 },
      status: 'UNMATCHED',
      reason: 'no confident match — pick the ingredient',
      quantity: 1,
      unit: null,
      packPricePence: 999,
      alternatives: [],
      addStockArgs: null,
      priceArgs: null,
    },
  ],
};

// KIMI NOTE: dev-only master so the UNMATCHED search has something to pick from.
// The real master comes from the Capture Bar / page that renders this component.
const SAMPLE_INGREDIENTS = [
  { id: 'i-chick', name: 'Chicken breast' },
  { id: 'i-salmon', name: 'Salmon fillet' },
  { id: 'i-butt', name: 'Butternut squash' },
  { id: 'i-milk', name: 'Semi-skimmed milk' },
  { id: 'i-mince', name: 'Beef mince' },
];

export function ReceiptCapture({ proposal = SAMPLE_PROPOSAL, ingredients = SAMPLE_INGREDIENTS, onCommitted }) {
  const fileInputRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [activeProposal, setActiveProposal] = useState(null);
  const [error, setError] = useState(null);

  const openPicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFile = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setReading(true);
    // KIMI NOTE: the fetch to the owner's vision route is deliberately NOT wired here
    // (route + API key are owner-built). For development we show the reading state,
    // then render the Contract B sample so the confirm card can be verified end-to-end.
    window.setTimeout(() => {
      setReading(false);
      setActiveProposal(proposal);
    }, 700);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'inherit' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={reading}
        style={{
          border: '1px solid #ddd',
          borderRadius: 12,
          background: '#fff',
          padding: '10px 14px',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        Receipt photo
        <span style={{ display: 'block', fontSize: 12, color: MUTED, fontWeight: 400, marginTop: 2 }}>
          Take a photo or choose an image
        </span>
      </button>

      {reading ? (
        <div style={{ fontSize: 14, color: MUTED, border: '1px solid #ddd', borderRadius: 12, padding: 16, background: '#fff' }}>
          Reading your receipt…
        </div>
      ) : null}

      {error ? (
        <div style={{ fontSize: 13, color: '#a00000' }}>{error}</div>
      ) : null}

      {activeProposal && !reading ? (
        <ReceiptConfirmCard
          proposal={activeProposal}
          ingredients={ingredients}
          onCancel={() => setActiveProposal(null)}
          onCommitted={onCommitted}
        />
      ) : null}
    </div>
  );
}

export default ReceiptCapture;
