// app/plan/page.js
'use client';

import Link from 'next/link';
import { usePlanData } from './_plan/usePlanData';
import { computeDerived } from './_plan/planDerived';
import { createPlanSlotActions } from './_plan/planSlotActions';
import { createPlanSaveGuests } from './_plan/planSaveGuests';
import { createPlanGenerate } from './_plan/planGenerate';
import { PlanHeader, PlanShapeCard, PlanBatchDays } from './_plan/PlanTopSections';
import { PlanWeekStrip } from './_plan/PlanWeekStrip';
import { PlanAppetite } from './_plan/PlanAppetite';
import { PlanDishPicker } from './_plan/PlanDishPicker';
import { PlanFreezerFirst, PlanCta } from './_plan/PlanMidSections';
import { PlanResultPanel } from './_plan/PlanResultPanel';
import { PlanShapeSheet, PlanSlotSheet } from './_plan/PlanSheets';
import { INK, CREAM, MUTED, eyebrowStyle } from './_plan/planShared';

// KIMI NOTE: module split (2026-11-24). The spec-v2 single-file build of this
// page exceeded the GitHub push transport size limit, so the page ships as
// ./_plan/*.js modules composed here. Component bodies are verbatim from the
// single-file build; the logic modules close over a per-render bag, so every
// closure sees current state — the same semantics as component-scope functions.
export default function PlanPage() {
  const bag = usePlanData();
  Object.assign(bag, computeDerived(bag));
  Object.assign(bag, createPlanSlotActions(bag));
  Object.assign(bag, createPlanSaveGuests(bag));
  Object.assign(bag, createPlanGenerate(bag));
  return (
    <main style={{ background: CREAM, minHeight: '100vh', color: INK }}>
      <div className="herb-page">
        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: MUTED, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        {bag.loading ? (
          <div className="herb-card" style={{ color: MUTED, fontSize: 14 }}>Loading your week…</div>
        ) : bag.loggedOut ? (
          <div className="herb-card">
            <div style={eyebrowStyle}>Plan my week</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sign in to plan your week.</div>
            {/* Dev-phase demo entry — no account needed (Karum, 22 Nov 2026). */}
            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="herb-btn herb-btn-primary" onClick={bag.onDemo} disabled={bag.demoBusy}>
                {bag.demoBusy ? 'Setting up your demo…' : 'Enter the demo — no account needed'}
              </button>
              <Link href="/login" className="herb-btn herb-btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Log in
              </Link>
            </div>
          </div>
        ) : (
          <>
            <PlanHeader p={bag} />
            <PlanShapeCard p={bag} />
            <PlanWeekStrip p={bag} />
            <PlanBatchDays p={bag} />
            <PlanAppetite p={bag} />
            <PlanDishPicker p={bag} />
            <PlanFreezerFirst p={bag} />
            <PlanCta p={bag} />
            <PlanResultPanel p={bag} />
            <PlanShapeSheet p={bag} />
            <PlanSlotSheet p={bag} />
          </>
        )}
      </div>
    </main>
  );
}
