// app/dashboard/_dash/DashChooser.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { HAIRLINE, INK, MUTED, darkPillButton, dayLabelShort, outlinePillButton } from './dashShared';

export function DashChooser({ p }) {
  const { busy, chooseSwap, chooser, chooserRef, setChooser } = p;

  return (
      //── Swap / plan chooser ───────────────────────────────────────
chooser ? (
        <section ref={chooserRef} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, scrollMarginTop: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>
              {chooser.currentRecipeId ? `Swap ${dayLabelShort(chooser.slotDate)} ${chooser.meal}` : `Plan ${dayLabelShort(chooser.slotDate)} ${chooser.meal}`}
            </h2>
            <button type="button" onClick={() => setChooser(null)} style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
              Close
            </button>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>
            Showing {chooser.options.length} of {chooser.total ?? chooser.options.length} recipes — scroll inside the box to see them all.
            {chooser.hiddenAllergens > 0 ? ` ${chooser.hiddenAllergens} hidden by your allergens.` : ''}
            {chooser.hiddenCuisines > 0 ? ` ${chooser.hiddenCuisines} hidden by your disliked cuisines.` : ''}
            {chooser.hiddenDisliked > 0 ? ` ${chooser.hiddenDisliked} hidden by "never again".` : ''}
            {chooser.hiddenIngDislikes > 0 ? ` ${chooser.hiddenIngDislikes} hidden by your disliked ingredients.` : ''}
          </p>
          <div style={{ maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {chooser.options.length ? chooser.options.map((option) => (
              <div key={option.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${HAIRLINE}`, padding: '12px 0', gap: 12 }}>
                <span style={{ fontSize: 14 }}>
                  {option.name} <span style={{ color: MUTED, fontSize: 13 }}>({option.kcal ?? '—'} kcal)</span>
                </span>
                <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button type="button" disabled={busy} onClick={() => chooseSwap(option, false)} style={{ ...darkPillButton, padding: '8px 16px', fontSize: 12, opacity: busy ? 0.7 : 1 }}>
                    {chooser.currentRecipeId ? 'Just this once' : 'Plan it'}
                  </button>
                  {chooser.currentRecipeId ? (
                    <button type="button" disabled={busy} onClick={() => chooseSwap(option, true)} style={{ ...outlinePillButton, opacity: busy ? 0.7 : 1 }}>
                      Never again
                    </button>
                  ) : null}
                </span>
              </div>
            )) : <p style={{ color: MUTED, fontSize: 14 }}>No safe recipes found with the current allergens/dislikes.</p>}
          </div>
        </section>
      ) : null
  );
}
