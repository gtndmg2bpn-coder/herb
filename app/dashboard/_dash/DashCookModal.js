// app/dashboard/_dash/DashCookModal.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { CookStepper } from '../../../components/CookStepper';

export function DashCookModal({ p }) {
  const { cookingSlot, refreshAfterAction, setCookingSlot } = p;

  return (
cookingSlot && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,27,24,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, maxWidth: 420, width: '100%' }}>
            <CookStepper
              slotDate={cookingSlot.slot_date}
              mealName={cookingSlot.meal}
              freezes={cookingSlot.recipe?.freezes ?? true}
              batchPortions={cookingSlot.recipe?.batch_portions ?? 4}
              freshPortions={cookingSlot.recipe?.fresh_portions ?? 2}
              onSuccess={async () => { setCookingSlot(null); await refreshAfterAction(); }}
              onCancel={() => setCookingSlot(null)}
            />
          </div>
        </div>
      )
  );
}
