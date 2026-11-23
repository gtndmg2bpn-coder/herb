// app/plan/_plan/PlanResultPanel.js
'use client';

import { AMBER, GREEN, HAIRLINE, INK, MUTED, eyebrowStyle } from './planShared';
import Link from 'next/link';
import { dayLabel } from '../../../lib/dates';

// KIMI NOTE: module split of app/plan/page.js (2026-11-24) — bodies verbatim
// from the single-file spec-v2 build; props arrive as one bag (p).
export function PlanResultPanel({ p }) {
  const {
    days, planResult,
  } = p;
  // ── Generate Result Panel ────────────────────────────────────────────
  return (planResult && (
    <div className="herb-card">
      {/* "This week is saved" — the panel header says the week IS
          saved, and names any holes rather than reading as "this
          week has N slots". */}
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        {(() => {
          const planned = planResult.macros
            ? planResult.macros.per_day.reduce((n, d) => n + d.slots_planned, 0)
            : null;
          const set = planResult.slotsWritten;
          const range = `${dayLabel(days[0])} — ${dayLabel(days[6])}`;
          return planned && planned !== set
            ? `This week is saved — ${set} of ${planned} slots for ${range}, ${planned - set} left empty.`
            : `This week is saved — ${set} slots for ${range}.`;
        })()}
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, color: MUTED, fontSize: 14, lineHeight: 1.6 }}>
        {planResult.rationale.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      {/* ── Against your targets (bridge items 4-6) ──────────────
          A plan that hit its numbers and a plan that had no numbers
          to hit must not look the same on screen. When targets are
          missing this panel says so and says WHICH silence it is;
          when they are present it shows the day-by-day result, so
          "did my new targets reach this plan?" is answered by
          looking rather than by regenerating and squinting. ── */}
      {planResult.macros && !planResult.macros.targeting && (
        <div style={{ marginTop: 16, background: '#FDF6E7', border: `1px solid ${AMBER}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B26B00', marginBottom: 6 }}>
            Planned without targets
          </div>
          <div style={{ fontSize: 13, color: '#7A4A00', lineHeight: 1.6 }}>
            {planResult.macros.source === 'no_profile'
              ? 'No profile was found, so calories and protein were not taken into account.'
              : 'Your profile has no calorie or protein target saved, so calories and protein were not taken into account.'}
          </div>
          <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 600, color: '#7A4A00' }}>
            Set your targets on the dashboard →
          </Link>
        </div>
      )}

      {planResult.macros && planResult.macros.targeting && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
          <div style={eyebrowStyle}>Against your targets</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
            {planResult.macros.target_kcal} kcal · {planResult.macros.target_protein_g} g protein ·
            {' '}carbs capped at {planResult.macros.carb_ceiling_g} g a day
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {planResult.macros.per_day.map((d) => {
              const ceiling = planResult.macros.carb_ceiling_g || 35;
              const carbPct = Math.min(100, Math.round((d.carbs_g / ceiling) * 100));
              return (
                <div key={d.slot_date} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ width: 96, color: MUTED, flexShrink: 0 }}>{dayLabel(d.slot_date)}</span>
                  <span style={{ width: 68, fontWeight: 600, color: d.kcal_in_band === false ? '#B26B00' : INK, flexShrink: 0 }}>
                    {d.kcal} kcal
                  </span>
                  {/* Amber only for a REAL miss. A day 3 g under a
                      183 g floor is hit; flagging it identically to
                      a day 33 g under buries the only one worth
                      acting on. The gap is named in grams, so the
                      SIZE of the miss is visible and not just its
                      existence. */}
                  <span style={{ width: 84, fontWeight: 600, color: d.protein_met === false ? '#B26B00' : INK, flexShrink: 0 }}>
                    {d.protein_g} g P
                    {d.protein_met === false && d.protein_short_g > 0 ? (
                      <span style={{ fontWeight: 500 }}> &minus;{d.protein_short_g}</span>
                    ) : null}
                  </span>
                  {/* The carb meter is the one number with a hard
                      edge, so it gets the only bar: a full bar is
                      the ceiling, not a target to reach. */}
                  <span style={{ flex: 1, minWidth: 40, height: 6, background: HAIRLINE, borderRadius: 3, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${carbPct}%`, height: '100%', background: carbPct >= 90 ? AMBER : GREEN }} />
                  </span>
                  <span style={{ width: 54, textAlign: 'right', color: MUTED, flexShrink: 0 }}>
                    {d.carbs_g} g C
                  </span>
                  {/* The fat lever, stated in grams. "Add some oil"
                      is not a plan; "+12 g olive oil" is. */}
                  <span style={{ width: 46, textAlign: 'right', color: d.fat_top_up_g > 0 ? INK : HAIRLINE, flexShrink: 0 }}>
                    {d.fat_top_up_g > 0 ? `+${d.fat_top_up_g} g` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
            The week averages {planResult.macros.avg_daily_kcal} kcal a day
            {planResult.macros.week_in_band ? ', inside' : ', outside'} the weekly band.
            Protein is driven, carbs are capped, and calories are closed
            {planResult.macros.fat_lever
              ? ` with ${planResult.macros.fat_lever.label} — ${planResult.macros.fat_added_total_g} g across the week, spread over the meals above.`
              : ' by the dishes alone; this diet sets no fat lever, so short days stay short.'}
          </div>
        </div>
      )}

      {/* ── Prep cooks ───────────────────────────────────────────
          A component never occupies a slot, so it would otherwise be
          invisible: the plan would quietly assume pulled chicken
          exists without ever telling you to roast the bird. This is
          where the plan asks for it. ── */}
      {planResult.components && planResult.components.cooks.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
          <div style={eyebrowStyle}>Prep to cook</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {planResult.components.cooks.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {c.component_name}
                </span>
                <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>
                  {dayLabel(c.cook_date)} · makes {c.yield_qty}{c.yield_unit} · use by {dayLabel(c.expiry_date)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
            Cooked alongside your batch day and used across the week — it fills no meal slot of its own.
          </div>
        </div>
      )}

      {planResult.components && planResult.components.shortfalls.length > 0 && (
        <div style={{ marginTop: 16, background: '#FDF6E7', border: `1px solid ${AMBER}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B26B00', marginBottom: 6 }}>
            Not everything is covered
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#7A4A00', lineHeight: 1.6 }}>
            {planResult.components.shortfalls.map((s, i) => (
              <li key={i}>
                {Math.round(s.short_by)}g short for {s.meal} on {dayLabel(s.date)} — {s.reason}.
              </li>
            ))}
          </ul>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
            Buy it ready-made or move the dish. Nothing is substituted for you.
          </div>
        </div>
      )}
    </div>
    ));
}
