'use client';

import React, { useState } from 'react';
import { getBrowserClient } from '../lib/supabaseBrowser';

const supabase = getBrowserClient();

export function CookStepper({ slotDate, mealName, onSuccess, onCancel }) {
  const [fresh, setFresh] = useState(2);
  const [freeze, setFreeze] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('cook_meal', {
        p_slot_date: slotDate,
        p_meal: mealName,
        p_fresh: fresh,
        p_freeze: freeze,
      });

      if (rpcError) {
        setError(rpcError.message || 'Failed to record cooked meal.');
        setBusy(false);
        return;
      }

      if (onSuccess) {
        await onSuccess(data);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Cook Meal</h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: 14, color: '#555' }}>
        <strong>{mealName}</strong> — {slotDate}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14 }}>Fresh portions to bank:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setFresh((prev) => Math.max(0, prev - 1))}
              disabled={busy}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
            >
              -
            </button>
            <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{fresh}</span>
            <button
              type="button"
              onClick={() => setFresh((prev) => prev + 1)}
              disabled={busy}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
            >
              +
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14 }}>Freeze portions to bank:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setFreeze((prev) => Math.max(0, prev - 1))}
              disabled={busy}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
            >
              -
            </button>
            <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{freeze}</span>
            <button
              type="button"
              onClick={() => setFreeze((prev) => prev + 1)}
              disabled={busy}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: 13, background: '#fef2f2', padding: 8, borderRadius: 6 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#1e1b18',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {busy ? 'Saving...' : 'Confirm Cook'}
        </button>
      </div>
    </div>
  );
}

export default CookStepper;
