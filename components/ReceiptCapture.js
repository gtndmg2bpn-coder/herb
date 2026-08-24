// components/ReceiptCapture.js
'use client';

import { useRef, useState } from 'react';
import { ReceiptConfirmCard } from './ReceiptConfirmCard';

const MUTED = '#666';

// Dev-only fallback so the UNMATCHED search has something to pick from if this
// component is ever rendered without a real master. In the app, the capture page
// loads the real ingredient master and passes it in.
const SAMPLE_INGREDIENTS = [
  { id: 'i-chick', name: 'Chicken breast' },
  { id: 'i-salmon', name: 'Salmon fillet' },
  { id: 'i-butt', name: 'Butternut squash' },
  { id: 'i-milk', name: 'Semi-skimmed milk' },
  { id: 'i-mince', name: 'Beef mince' },
];

// Read a File into raw base64 (strips the "data:...;base64," prefix).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

export function ReceiptCapture({ ingredients = SAMPLE_INGREDIENTS, onCommitted }) {
  const fileInputRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [activeProposal, setActiveProposal] = useState(null);
  const [error, setError] = useState(null);

  const openPicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setActiveProposal(null);
    setReading(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const response = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mediaType: file.type || 'image/jpeg',
          ingredients,
        }),
      });
      const proposal = await response.json().catch(() => null);
      if (!response.ok || !proposal) {
        setError((proposal && proposal.reason) || 'Could not read that receipt. Try a clearer photo.');
        return;
      }
      if (proposal.status === 'REJECT') {
        setError(proposal.reason || 'No readable items on that receipt.');
        return;
      }
      setActiveProposal(proposal);
    } catch (e) {
      setError(e && e.message ? e.message : 'Something went wrong reading that receipt.');
    } finally {
      setReading(false);
    }
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
          cursor: reading ? 'default' : 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          opacity: reading ? 0.6 : 1,
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
