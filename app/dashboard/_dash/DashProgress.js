// app/dashboard/_dash/DashProgress.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { BLUE, CHART_H, CHART_W, CREAM, GREEN, HAIRLINE, INK, MUTED, PINK, ageFromDob, darkPillButton, formatDelta, formatWeight, inputStyle } from './dashShared';
import Link from 'next/link';

export function DashProgress({ p }) {
  const { busy, chart, checkin, currentWeight, goalKg, profile, saveProfile, setWeightInput, setWeightPounds, setWeightStones, submitWeight, weightHistory, weightInput, weightPounds, weightStones } = p;

  return (
      //── Progress banner ───────────────────────────────────────────
      <section
        className="dash-progress"
        style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 24, padding: 32, display: 'grid', gridTemplateColumns: '.95fr 1.35fr .8fr', gap: 28 }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: BLUE, marginBottom: 10 }}>Your progress</div>
          <h1 style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-.03em', margin: 0 }}>
            Hi, {profile?.display_name || 'there'}
          </h1>
          {profile?.sex && profile?.date_of_birth ? (
            <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: MUTED }}>
              {profile.sex === 'male' ? 'Male' : profile.sex === 'female' ? 'Female' : 'Other'} · {ageFromDob(profile.date_of_birth)} yrs
            </p>
          ) : null}
          {profile ? (
            <>
              <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
                <div>
                  <b style={{ display: 'block', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>{formatWeight(profile.start_weight_kg, profile.preferred_units)}</b>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTED, fontWeight: 600 }}>Start</span>
                </div>
                <div>
                  <b style={{ display: 'block', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: PINK }}>{formatWeight(currentWeight, profile.preferred_units)}</b>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTED, fontWeight: 600 }}>Now</span>
                </div>
                <div>
                  <b style={{ display: 'block', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>{formatWeight(profile.goal_weight_kg, profile.preferred_units)}</b>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTED, fontWeight: 600 }}>Goal</span>
                </div>
              </div>
              {checkin.hasData ? (
                <div style={{ marginTop: 18 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>
                    Last weigh-in {formatWeight(checkin.latestKg, profile.preferred_units)}
                  </span>
                  {checkin.deltaKg != null ? (
                    <span style={{ fontSize: 13, color: MUTED }}> · {formatDelta(checkin.deltaKg, profile.preferred_units)} since last</span>
                  ) : null}
                  {checkin.duePrompt ? (
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: GREEN }}>
                      Time to weigh in — it’s been {Math.floor(checkin.daysSince)} days.
                    </div>
                  ) : null}
                  {checkin.stale ? (
                    <div style={{ marginTop: 4, fontSize: 11, color: MUTED }}>
                      Your targets are based on this last reading.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{ marginTop: 18, fontSize: 13, color: MUTED }}>Log your first weigh-in to start tracking.</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                {profile.preferred_units === 'imperial' ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      placeholder="st"
                      value={weightStones}
                      onChange={(event) => setWeightStones(event.target.value)}
                      style={{ ...inputStyle, width: 64 }}
                    />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="13.9"
                      placeholder="lb"
                      value={weightPounds}
                      onChange={(event) => setWeightPounds(event.target.value)}
                      style={{ ...inputStyle, width: 64 }}
                    />
                  </>
                ) : (
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="Log weight (kg)"
                    value={weightInput}
                    onChange={(event) => setWeightInput(event.target.value)}
                    style={{ ...inputStyle, width: 160 }}
                  />
                )}
                <button type="button" disabled={busy} onClick={submitWeight} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
                  Log weight
                </button>
                {/* Weight units: display + input only. Storage stays kg end-to-end
                    (weight_log.weight_kg; logWeight({ weightKg })). This writes
                    profiles.preferred_units via saveProfile — the same write path
                    the allergen toggles use — and every weight surface (inputs,
                    start/now/goal, chart goal label) follows the preference. */}
                <div role="group" aria-label="Weight units" style={{ display: 'flex', border: `1.5px solid ${HAIRLINE}`, borderRadius: 100, overflow: 'hidden' }}>
                  {[
                    { value: 'imperial', label: 'st + lb' },
                    { value: 'metric', label: 'kg' },
                  ].map((option) => {
                    const activeUnit = (profile.preferred_units === 'imperial' ? 'imperial' : 'metric') === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={busy || activeUnit}
                        onClick={() => saveProfile({ preferred_units: option.value })}
                        style={{
                          border: 'none',
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: activeUnit ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          background: activeUnit ? INK : 'transparent',
                          color: activeUnit ? CREAM : MUTED,
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 14, color: MUTED }}>
              No profile found yet. <Link href="/onboarding" style={{ textDecoration: 'underline' }}>Complete onboarding first</Link>.
            </p>
          )}
        </div>

        <div className="dash-progress-col" style={{ borderLeft: `1px solid ${HAIRLINE}`, paddingLeft: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED }}>Weight trend</div>
            {chart?.etaLabel ? <div style={{ fontSize: 11, fontWeight: 600, color: BLUE }}>{chart.etaLabel}</div> : null}
          </div>
          {chart ? (
            <>
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', height: 130, overflow: 'visible' }} role="img" aria-label="Weight trend">
                {chart.goalY != null ? (
                  <>
                    <line x1="0" y1={chart.goalY} x2={CHART_W} y2={chart.goalY} stroke={HAIRLINE} strokeWidth="1" strokeDasharray="3,4" />
                    <text x={CHART_W} y={chart.goalTextY} textAnchor="end" fontSize="9" fontWeight="700" fill={MUTED}>
                      Goal {formatWeight(goalKg, profile?.preferred_units)}
                    </text>
                  </>
                ) : null}
                <path d={chart.predictedPath} fill="none" stroke={BLUE} strokeWidth="2.5" strokeDasharray="5,5" />
                <path d={chart.actualPath} fill="none" stroke={PINK} strokeWidth="2.5" />
                <circle cx={chart.lastX} cy={chart.lastY} r="4" fill={PINK" } />
              </svg>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 3, background: PINK, display: 'inline-block', borderRadius: 2 }} />Logged
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 3, background: BLUE, display: 'inline-block', borderRadius: 2 }} />Predicted
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
              {weightHistory.length === 1 ? 'One weigh-in logged — log again to see your trend.' : 'Log your weight to start your trend chart.'}
            </p>
          )}
        </div>

        <div className="dash-progress-col" style={{ borderLeft: `1px solid ${HAIRLINE}`, paddingLeft: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
            Daily target{profile?.diet ? ` · ${profile.diet}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 0' }}>
            <div style={{ textAlign: 'left', borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 8 }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_kcal ?? '—'}</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>kcal</span>
            </div>
            <div style={{ textAlign: 'right', borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 8 }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_protein_g ?? '—'}g</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>Protein</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_carbs_g ?? '—'}g</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>Carbs</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{profile?.target_fat_g ?? '—'}g</b>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, fontWeight: 600 }}>Fat</span>
            </div>
          </div>
        </div>
      </section>
  );
}