// app/dashboard/page.js
'use client';
// app/dashboard/page.js

import { useEffect } from 'react';
import { useDashData } from './_dash/useDashData';
import { computeDashDerived } from './_dash/dashDerived';
import { createDashActions } from './_dash/dashActions';
import { createDashPantry } from './_dash/dashPantry';
import { DashModals } from './_dash/DashModals';
import { DashProgress } from './_dash/DashProgress';
import { DashSpend } from './_dash/DashSpend';
import { DashWeekGrid } from './_dash/DashWeekGrid';
import { DashChooser } from './_dash/DashChooser';
import { DashEatingForm } from './_dash/DashEatingForm';
import { DashPantry } from './_dash/DashPantry';
import { DashAllergens } from './_dash/DashAllergens';
import { DashOffPlan } from './_dash/DashOffPlan';
import { DashFooter } from './_dash/DashFooter';
import { DashCookModal } from './_dash/DashCookModal';
import { INK, HAIRLINE, GREEN } from './_dash/dashShared';

export default function DashboardPage() {
  const bag = useDashData();
  Object.assign(bag, createDashActions(bag));
  Object.assign(bag, createDashPantry(bag));

  // If the chooser is open when allergens/dislikes change, rebuild its options
  // with the new filters so the list is never stale. (Moved from the hook —
  // openChooser lives in the actions factory, assigned above.)
  useEffect(() => {
    if (bag.chooser) bag.openChooser(bag.chooser.slotDate, bag.chooser.meal, bag.chooser.currentRecipeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bag.profile]);

  if (bag.checking || !bag.session) return null;

  Object.assign(bag, computeDashDerived(bag));

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 80px', display: 'flex', flexDirection: 'column', gap: 36, color: INK }}>
      <style>{`
        @media (max-width: 900px) {
          .dash-progress { grid-template-columns: 1fr !important; }
          .dash-progress-col { border-left: none !important; padding-left: 0 !important; border-top: 1px solid ${HAIRLINE}; padding-top: 24px; }
          .dash-week { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-pantry { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 901px) and (max-width: 1150px) {
          .dash-week { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>

      {bag.error ? (
        <p role="alert" style={{ margin: 0, background: '#FDECEA', border: '1px solid #F5C6C0', color: '#b00020', borderRadius: 12, padding: '12px 16px', fontSize: 14 }}>
          {bag.error}
        </p>
      ) : null}

      {bag.notice ? (
        <p role="status" style={{ margin: 0, background: '#EAF1EB', border: `1px solid ${GREEN}`, color: GREEN, borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 700 }}>
          {bag.notice}
        </p>
      ) : null}

      <DashModals p={bag} />
      <DashProgress p={bag} />
      <DashSpend p={bag} />
      <DashWeekGrid p={bag} />
      <DashChooser p={bag} />
      <DashEatingForm p={bag} />
      <DashPantry p={bag} />
      <DashAllergens p={bag} />
      <DashOffPlan p={bag} />
      <DashFooter p={bag} />
      <DashCookModal p={bag} />
    </main>
  );
}
