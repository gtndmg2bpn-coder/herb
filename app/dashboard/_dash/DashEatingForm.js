// app/dashboard/_dash/DashEatingForm.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { HAIRLINE, INK, darkPillButton, dayLabelShort, inputStyle } from './dashShared';

export function DashEatingForm({ p }) {
  const { busy, eatingForm, eatingFormRef, setEatingForm, submitEatingOut } = p;

  return (
      //── Eating out form ───────────────────────────────────────────
eatingForm ? (
        <section ref={eatingFormRef} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, display: 'grid', gap: 12, scrollMarginTop: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>
              Eating out — {dayLabelShort(eatingForm.slotDate)} {eatingForm.meal}
            </h2>
            <button type="button" onClick={() => setEatingForm(null)} style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
              Cancel
            </button>
          </div>
          <input placeholder="Label (e.g. pub dinner)" value={eatingForm.label} onChange={(event) => setEatingForm({ ...eatingForm, label: event.target.value })} style={inputStyle} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Est. cost (£)" value={eatingForm.costPounds} onChange={(event) => setEatingForm({ ...eatingForm, costPounds: event.target.value })} style={{ ...inputStyle, width: 130 }} />
            <input placeholder="kcal" value={eatingForm.kcal} onChange={(event) => setEatingForm({ ...eatingForm, kcal: event.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input placeholder="protein g" value={eatingForm.proteinG} onChange={(event) => setEatingForm({ ...eatingForm, proteinG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input placeholder="carbs g" value={eatingForm.carbsG} onChange={(event) => setEatingForm({ ...eatingForm, carbsG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input placeholder="fat g" value={eatingForm.fatG} onChange={(event) => setEatingForm({ ...eatingForm, fatG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          </div>
          <div>
            <button type="button" disabled={busy} onClick={submitEatingOut} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
              Save eating out
            </button>
          </div>
        </section>
      ) : null
  );
}
