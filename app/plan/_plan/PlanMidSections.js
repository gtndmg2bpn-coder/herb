// app/plan/_plan/PlanMidSections.js
'use client';

import { GREEN, INK, MUTED, Toggle, eyebrowStyle } from './planShared';
import Link from 'next/link';
import { dayLabel } from '../../../lib/dates';

// KIMI NOTE: module split of app/plan/page.js (2026-11-24) — bodies verbatim
// from the single-file spec-v2 build; props arrive as one bag (p).
export function PlanFreezerFirst({ p }) {
  const {
    freezerFirst, freezerLots, setDirty, setFreezerFirst,
  } = p;
  // ── 4 · Freezer first ───────────────────────────────────
  return (
    <section className="herb-card">
      <div style={eyebrowStyle}>Freezer first</div>
      {freezerLots.length === 0 ? (
        <div style={{ fontSize: 14, color: MUTED }}>No freezer portions to use up this week.</div>
      ) : (
        <div style={{ display: 'grid' }}>
          {freezerLots.map((lot, index) => (
            <div key={`${lot.recipe_id}-${index}`} className="shop-row" style={{ cursor: 'default' }}>
              <span className="shop-name">{lot.recipeName}</span>
              <span className="shop-price">
                {lot.quantity} portion{lot.quantity === 1 ? '' : 's'} · use by {dayLabel(lot.expiry_date)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <Toggle on={freezerFirst} onChange={(value) => { setFreezerFirst(value); setDirty(true); }} label="Use these up first" />
      </div>
    </section>
  );
}

export function PlanCta({ p }) {
  const {
    dirty, error, generateNow, generating,
    lastSave, planResult, save, saving,
    seed, setSeed,
  } = p;
  // ── CTA bar ─────────────────────────────────────────────
  //    One primary action: Generate my plan (ink, full width on a
  //    phone, sticky at the foot of the viewport — .herb-page
  //    reserves the 96px). "Save preferences" is the secondary.
  //    After a generate the bar switches to Regenerate + the
  //    dashboard link; the result panel header announces that the
  //    week IS saved. Three saved states, three messages (spec §4.6);
  // the "coming soon" sentence is deleted everywhere.
  return (
    <div className="herb-cta">
      {!planResult ? (
        <>
          <button
            type="button"
            className="herb-btn herb-btn-primary"
            disabled={generating}
            onClick={() => generateNow(seed)}
          >
            {generating ? 'Generating…' : 'Generate my plan'}
          </button>
          <button
            type="button"
            className="herb-btn herb-btn-secondary"
            disabled={saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="herb-btn herb-btn-secondary"
            disabled={saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
          <button
            type="button"
            className="herb-btn herb-btn-secondary"
            disabled={generating}
            onClick={() => { const n = seed + 1; setSeed(n); generateNow(n); }}
          >
            Regenerate (different plan)
          </button>
          <Link href="/dashboard" style={{ fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'underline', minHeight: 40, display: 'inline-flex', alignItems: 'center' }}>
            View plan on dashboard →
          </Link>
        </>
      )}
      {!dirty && lastSave === 'preferences' && (
        <span style={{ fontSize: 14, fontWeight: 600, color: GREEN }}>✓ Preferences saved.</span>
      )}
      {dirty && lastSave === 'preferences' && (
        <span style={{ fontSize: 13, color: MUTED }}>You have unsaved changes.</span>
      )}
      {dirty && lastSave === 'generated' && (
        <span style={{ fontSize: 13, color: MUTED }}>Changes not yet saved to your week.</span>
      )}
      {error && (
        <span style={{ fontSize: 14, fontWeight: 600, color: '#C0392B' }}>{error}</span>
      )}
    </div>
  );
}
