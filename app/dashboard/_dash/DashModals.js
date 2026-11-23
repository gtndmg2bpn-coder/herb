// app/dashboard/_dash/DashModals.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { CREAM, HAIRLINE, INK, MUTED, PINK, darkPillButton, formatDelta, formatWeight, outlinePillButton } from './dashShared';
import Link from 'next/link';

export function DashModals({ p }) {
  const { busy, confirmProposal, profile, proposal, proposalError, setProposal, setProposalError } = p;

  return (
proposal ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(42,41,50,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }}
          onClick={() => { if (!busy) { setProposal(null); setProposalError(''); } }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: CREAM, border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 26, maxWidth: 420, width: '100%', boxShadow: '0 18px 50px rgba(42,41,50,.25)' }}
          >
            {proposal.status === 'GOAL_REACHED' ? (
              <>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Goal reached 🎉</h2>
                <p style={{ margin: '8px 0 4px', fontSize: 14, color: MUTED }}>
                  You’ve hit your goal weight — moving you to maintenance.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>
                  You’re at {formatWeight(proposal.driverWeightKg, profile?.preferred_units)}
                </h2>
                <p style={{ margin: '8px 0 4px', fontSize: 14, color: MUTED }}>
                  {formatDelta(proposal.weightDeltaKg, profile?.preferred_units)
                    ? `${formatDelta(proposal.weightDeltaKg, profile?.preferred_units)} since your last weigh-in. Here are your updated daily targets.`
                    : 'Here are your updated daily targets.'}
                </p>
              </>
            )}

            <div style={{ marginTop: 14 }}>
              {[
                ['Calories', 'target_kcal', 'kcal'],
                ['Protein', 'target_protein_g', 'g'],
                ['Carbs', 'target_carbs_g', 'g'],
                ['Fat', 'target_fat_g', 'g'],
              ].map(([label, key, unit]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0', borderTop: `1px solid ${HAIRLINE}`, fontSize: 14 }}>
                  <span style={{ color: MUTED }}>{label}</span>
                  <span>
                    <span style={{ color: MUTED }}>{proposal.old[key] ?? '—'}</span>
                    <span style={{ color: MUTED, margin: '0 8px' }}>→</span>
                    <b style={{ color: INK }}>{proposal.new[key]}</b>
                    <span style={{ color: MUTED, fontSize: 12, marginLeft: 4 }}>{unit}</span>
                  </span>
                </div>
              ))}
            </div>

            {proposalError ? (
              <p role="alert" style={{ margin: '12px 0 0', color: '#b00020', fontSize: 13 }}>{proposalError}</p>
            ) : null}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={confirmProposal}
                disabled={busy}
                style={{ ...darkPillButton, background: PINK, color: INK, flex: 1, opacity: busy ? 0.7 : 1 }}
              >
                {proposal.status === 'GOAL_REACHED' ? 'Move to maintenance' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => { setProposal(null); setProposalError(''); }}
                disabled={busy}
                style={{ ...outlinePillButton }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null
  );
}