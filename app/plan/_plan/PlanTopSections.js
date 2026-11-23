// app/plan/_plan/PlanTopSections.js
'use client';

import { CREAM, HAIRLINE, INK, MUTED, PINK, PLANNABLE_MEALS, eyebrowStyle, inputStyle } from './planShared';
import { dayLabel } from '../../../lib/dates';

// KIMI NOTE: module split of app/plan/page.js (2026-11-24) — bodies verbatim
// from the single-file spec-v2 build; props arrive as one bag (p).
export function PlanHeader(p) {
  const {
    changeStart, days, weekStart,
  } = p;
  return (
    <header>
      <div style={{ ...eyebrowStyle, color: PINK, marginBottom: 6 }}>Plan my week</div>
      <h1 className="herb-h1">
        {dayLabel(days[0])} — {dayLabel(days[6])}
      </h1>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 13, fontWeight: 600 }}>
        <span style={{ color: MUTED }}>Plan from</span>
        <input
          type="date"
          value={weekStart || ''}
          onChange={(e) => changeStart(e.target.value)}
          style={{ ...inputStyle, padding: '8px 12px' }}
        />
        <span style={{ color: MUTED, fontWeight: 400 }}>for the next 7 days</span>
      </label>
    </header>
  );
}

export function PlanShapeCard(p) {
  const {
    mealsToPlan, setWindowsSheetOpen,
  } = p;
  // ── 1 · This week's shape ───────────────────────────────
  //    A summary, not a form — the five windows as chips with a
  //    Change button that opens the bottom sheet. Dessert counts as
  //    a snack: the engine has no dessert tag, a dessert IS a
  //    snack-tagged dish, so the two snack windows already carry
  // desserts (copy only, no data change).
  return (
    <section className="herb-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={eyebrowStyle}>This week&rsquo;s shape</div>
        <button
          type="button"
          onClick={() => setWindowsSheetOpen(true)}
          className="herb-btn herb-btn-secondary herb-btn-inline"
        >
          Change
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {PLANNABLE_MEALS.map((m) => {
          const on = mealsToPlan.includes(m.key);
          return (
            <span
              key={m.key}
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 40,
                border: `1px solid ${on ? INK : HAIRLINE}`,
                background: on ? INK : '#fff',
                color: on ? CREAM : MUTED,
                borderRadius: 100,
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {m.label}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
        Three mains, two snacks &amp; dessert — the snack windows carry puddings too. Tap Change to set your own default.
      </div>
    </section>
  );
}

export function PlanBatchDays(p) {
  const {
    batchDays, days, setBatchDays, setDirty,
  } = p;
  // ── Batch-cook days ─────────────────────────────────────
  return (
    <section className="herb-card">
      <div style={eyebrowStyle}>Batch-cook days</div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
        Batch dishes are cooked on these days and banked for the week.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {days.map((date) => {
          const isBatch = batchDays.includes(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => {
                if (isBatch) {
                  setBatchDays(batchDays.filter((d) => d !== date));
                } else {
                  setBatchDays([...batchDays, date]);
                }
                setDirty(true);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 40,
                border: `1px solid ${isBatch ? INK : HAIRLINE}`,
                background: isBatch ? INK : '#fff',
                color: isBatch ? CREAM : INK,
                borderRadius: 100,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {dayLabel(date)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => { setBatchDays([]); setDirty(true); }}
          style={{
            display: 'inline-flex', alignItems: 'center', minHeight: 40,
            border: `1px solid ${batchDays.length === 0 ? INK : HAIRLINE}`,
            background: batchDays.length === 0 ? INK : '#fff',
            color: batchDays.length === 0 ? CREAM : MUTED,
            borderRadius: 100,
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          None
        </button>
      </div>
    </section>
  );
}
