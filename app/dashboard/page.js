'use client';

import React, { useState, useEffect } from 'react';
import { CookStepper } from '../../components/CookStepper';
import { getBrowserClient } from '../../lib/supabaseBrowser';

const supabase = getBrowserClient();
const INK = '#1e1b18';

export default function DashboardPage() {
  const [slots, setSlots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cookingSlot, setCookingSlot] = useState(null);

  const refreshAfterAction = async () => {
    const { data } = await supabase.from('meal_slots').select('*').order('slot_date', { ascending: true });
    if (data) setSlots(data);
  };

  useEffect(() => {
    refreshAfterAction();
  }, []);

  // Preserved for Slice B cleanup
  const cookSlot = async (slot) => {
    setBusy(true);
    try {
      await supabase.rpc('cook_meal', {
        p_slot_date: slot.slot_date,
        p_meal: slot.meal,
        p_fresh: 2,
        p_freeze: 2,
      });
      await refreshAfterAction();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Meal Plan Dashboard</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slots.map((slot) => (
          <div
            key={`${slot.slot_date}-${slot.meal}`}
            style={{
              padding: 16,
              borderRadius: 12,
              border: '1px solid #e5e5e5',
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{slot.meal}</div>
              <div style={{ fontSize: 13, color: '#666' }}>{slot.slot_date}</div>
            </div>

            <div>
              {!slot.cooked_at ? (
                <button
                  disabled={busy}
                  onClick={() => setCookingSlot(slot)}
                  style={{
                    background: INK,
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 20,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  Cooked
                </button>
              ) : (
                <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 14 }}>Cooked ✓</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {cookingSlot && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(30,27,24,.45)',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, maxWidth: 420, width: '100%' }}>
            <CookStepper
              slotDate={cookingSlot.slot_date}
              mealName={cookingSlot.meal}
              onSuccess={async () => {
                setCookingSlot(null);
                await refreshAfterAction();
              }}
              onCancel={() => setCookingSlot(null)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
