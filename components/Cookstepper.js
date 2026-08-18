'use client';

// components/CookStepper.js
// HERB — Cook stepper: fresh/freeze split control for cooking a planned slot.
// Calls cook_meal(p_slot_date, p_meal, p_fresh, p_freeze). Self-contained.

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Self-contained browser client. Picks up the logged-in session automatically
// from the same storage the app uses, so auth.uid() resolves to the current user.
// (If you'd rather reuse your existing app client, replace these three lines with
//  your own import, e.g. `import { supabase } from '../lib/supabaseClient';`.)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function CookStepper({ slotDate, mealName, onSuccess, onCancel }) {
  const [fresh, setFresh] = useState(2);
  const [freeze, setFreeze] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const total = fresh + freeze;
  const isValid = total >= 1 && fresh >= 0 && freeze >= 0;

  const handleAdjust = (type, delta) => {
    if (type === 'fresh') {
      setFresh((prev) => Math.min(12, Math.max(0, prev + delta)));
    } else {
      setFreeze((prev) => Math.min(12, Math.max(0, prev + delta)));
    }
  };

  const handleCook = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('cook_meal', {
        p_slot_date: slotDate,
        p_meal: mealName,
        p_fresh: Math.floor(fresh),
        p_freeze: Math.floor(freeze),
      });

      if (rpcError) throw rpcError;

      setResult(data);
      if (onSuccess) onSuccess(data);
    } catch (err) {
      setError((err && err.message) || 'Failed to execute cook action');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const hasShortfalls = result.shortfalls && result.shortfalls.length > 0;
    return (
      <div style={styles.card}>
        <div style={styles.successTitle}>
          Cooked {result.portions_total} portions
        </div>
        <div style={styles.subtext}>
          {result.portions_fresh} in the fridge (expires +3d) • {result.portions_freeze} in the freezer (expires +45d)
        </div>

        {hasShortfalls && (
          <div style={styles.shortfallBox}>
            <strong style={{ color: '#b91c1c' }}>Pantry shortfalls:</strong>
            <ul style={styles.shortfallList}>
              {result.shortfalls.map((s, idx) => (
                <li key={s.ingredient_id || idx}>
                  Short on {s.short}{s.unit} {s.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button style={styles.primaryButton} onClick={onCancel}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.title}>Batch cook split</span>
        <span style={styles.totalBadge}>{total} {total === 1 ? 'portion' : 'portions'}</span>
      </div>

      {/* Fresh */}
      <div style={styles.row}>
        <div>
          <div style={styles.label}>Fresh (fridge)</div>
          <div style={styles.subtext}>Expires in 3 days</div>
        </div>
        <div style={styles.stepperControls}>
          <button
            type="button"
            style={{ ...styles.stepBtn, opacity: fresh <= 0 ? 0.4 : 1 }}
            disabled={fresh <= 0}
            onClick={() => handleAdjust('fresh', -1)}
          >
            −
          </button>
          <span style={styles.value}>{fresh}</span>
          <button
            type="button"
            style={{ ...styles.stepBtn, opacity: fresh >= 12 ? 0.4 : 1 }}
            disabled={fresh >= 12}
            onClick={() => handleAdjust('fresh', 1)}
          >
            +
          </button>
        </div>
      </div>

      {/* Freeze */}
      <div style={styles.row}>
        <div>
          <div style={styles.label}>Freeze (freezer)</div>
          <div style={styles.subtext}>Expires in 45 days</div>
        </div>
        <div style={styles.stepperControls}>
          <button
            type="button"
            style={{ ...styles.stepBtn, opacity: freeze <= 0 ? 0.4 : 1 }}
            disabled={freeze <= 0}
            onClick={() => handleAdjust('freeze', -1)}
          >
            −
          </button>
          <span style={styles.value}>{freeze}</span>
          <button
            type="button"
            style={{ ...styles.stepBtn, opacity: freeze >= 12 ? 0.4 : 1 }}
            disabled={freeze >= 12}
            onClick={() => handleAdjust('freeze', 1)}
          >
            +
          </button>
        </div>
      </div>

      {error && <div style={styles.errorText}>{error}</div>}

      <div style={styles.actions}>
        {onCancel && (
          <button type="button" style={styles.secondaryButton} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        )}
        <button
          type="button"
          style={{
            ...styles.primaryButton,
            opacity: !isValid || loading ? 0.5 : 1,
            cursor: !isValid || loading ? 'not-allowed' : 'pointer',
          }}
          disabled={!isValid || loading}
          onClick={handleCook}
        >
          {loading ? 'Cooking…' : `Cook ${total} portions`}
        </button>
      </div>
    </div>
  );
}

// Functional white-card system: #ddd borders, 12px radius, #666 secondary, green accent.
const styles = {
  card: {
    background: '#ffffff',
    border: '1px solid #dddddd',
    borderRadius: '12px',
    padding: '16px',
    maxWidth: '400px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #eeeeee',
  },
  title: { fontSize: '16px', fontWeight: 600, color: '#111111' },
  totalBadge: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#15803d',
    backgroundColor: '#f0fdf4',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  label: { fontSize: '14px', fontWeight: 500, color: '#222222' },
  subtext: { fontSize: '12px', color: '#666666', marginTop: '2px' },
  stepperControls: { display: 'flex', alignItems: 'center', gap: '8px' },
  stepBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '8px',
    border: '1px solid #dddddd',
    background: '#ffffff',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
  },
  value: { fontSize: '16px', fontWeight: 600, minWidth: '24px', textAlign: 'center' },
  actions: { display: 'flex', gap: '8px', marginTop: '16px' },
  primaryButton: {
    flex: 1,
    height: '44px',
    backgroundColor: '#15803d',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryButton: {
    height: '44px',
    padding: '0 16px',
    backgroundColor: '#ffffff',
    color: '#666666',
    border: '1px solid #dddddd',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  errorText: { color: '#dc2626', fontSize: '12px', marginBottom: '12px' },
  successTitle: { fontSize: '16px', fontWeight: 600, color: '#15803d', marginBottom: '4px' },
  shortfallBox: {
    marginTop: '12px',
    padding: '10px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    fontSize: '12px',
  },
  shortfallList: { margin: '4px 0 0 16px', padding: 0, color: '#991b1b' },
};

export default CookStepper;
