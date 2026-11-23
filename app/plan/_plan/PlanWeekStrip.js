// app/plan/_plan/PlanWeekStrip.js
'use client';

import { HAIRLINE, MUTED, inputStyle } from './planShared';
import { PlanSlotCard } from './PlanSlotCard';

// KIMI NOTE: module split (2026-11-24) — the strip is the spec-v2 week grid;
// each meal slot renders through PlanSlotCard (same DOM as the single-file build).
export function PlanWeekStrip(p) {
  const {
    addGuestFor, days, guests, mealsToPlan,
    recipeByIdMap, removeGuest, shortDayLabel, slots,
    updateGuest,
  } = p;
  // ── 2 · Your week — the strip (spec v2) ─────────────────
  //    The week IS the page: seven day cards, each active window a
  //    slot. A planned dish renders as a picture card with kcal and
  //    cost — tapping the card opens the recipe (the founder's
  //    core ask); the ⋯ button opens the slot sheet (out / eating
  //    out / swap / portions). An out constraint or an eating-out
  //    slot renders as a blue chip. Empty slots carry the two
  // pre-generation actions. Guests live on the day card.
  return (
    <section>
      <div className="herb-week">
        {days.map((date) => {
          const daySlots = slots.filter((s) => s.slot_date === date);
          const dayGuests = guests
            .map((guest, index) => ({ ...guest, index }))
            .filter((guest) => guest.date === date);
          const dayKcal = daySlots.reduce(
            (sum, s) => sum + (s.recipe_id ? (recipeByIdMap[s.recipe_id]?.kcal || 0) : (s.est_kcal || 0)),
            0
          );
          return (
            <div key={date} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 14, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{shortDayLabel(date)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {dayKcal > 0 ? (
                    <span className="herb-num" style={{ fontSize: 10.5, color: MUTED }}>{dayKcal} kcal</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => addGuestFor(date)}
                    style={{ border: `1px dashed ${HAIRLINE}`, background: '#fff', color: MUTED, borderRadius: 100, padding: '2px 10px', minHeight: 40, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                  >
                    + guests
                  </button>
                </span>
              </div>
              {mealsToPlan.map((meal) => (
                <PlanSlotCard key={meal} p={p} date={date} meal={meal} />
              ))}
              {dayGuests.map((guest) => (
                <div key={guest.index} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${HAIRLINE}`, paddingTop: 6 }}>
                  <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Guests</span>
                  <select
                    value={guest.meal || mealsToPlan[0]}
                    onChange={(event) => updateGuest(guest.index, { meal: event.target.value })}
                    style={{ ...inputStyle, background: '#fff', padding: '4px 8px', fontSize: 12, minHeight: 40 }}
                  >
                    {mealsToPlan.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={guest.count}
                    onChange={(event) => updateGuest(guest.index, { count: Number(event.target.value) })}
                    style={{ ...inputStyle, width: 56, background: '#fff', padding: '4px 8px', fontSize: 12, minHeight: 40 }}
                    aria-label="Number of guests"
                  />
                  <button type="button" onClick={() => removeGuest(guest.index)} style={{ border: 'none', background: 'none', color: MUTED, fontSize: 11.5, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', minHeight: 40, padding: 0 }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
