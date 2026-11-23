// app/dashboard/_dash/DashWeekGrid.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { CREAM, ChipAction, HAIRLINE, INK, MEALS, MEAL_LABELS, MEAL_WASHES, MUTED, dayLabelShort, money, slotKey } from './dashShared';
import { Link } from 'next/link';
import { dayLabel } from '../../../lib/dates';

export function DashWeekGrid({ p }) {
  const { busy, costByRecipe, eatSlot, editPortions, householdPortions, openChooser, recipeById, setCookingSlot, setEatingForm, slotByKey, today, weekDays } = p;

  return (
      //── This week: 7-day meal grid ────────────────────────────────
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <h2 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.03em', margin: 0 }}>This week</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/plan" style={{ background: INK, color: CREAM, borderRadius: 100, padding: '10px 18px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Plan my week →</Link>
            <Link href="/shopping" style={{ fontSize: 13, fontWeight: 600, textDecoration: 'underline' }}>View shopping list →</Link>
          </div>
        </div>
        <div className="dash-week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
          {weekDays.map((slotDate) => (
            <div key={slotDate} style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{dayLabelShort(slotDate)}</div>
              {MEALS.map((meal) => {
                const slot = slotByKey[slotKey(slotDate, meal)];
                const recipe = slot?.recipe_id ? recipeById[slot.recipe_id] : null;

                // ── Cook-day guard ────────────────────────────────────────────
                // A slot may only offer "Cooked" when it IS the cook: a batch or
                // fresh cook whose cook_date is this very day. Everything else is
                // a portion coming out of stock — you EAT it, you don't cook it.
                // Legacy rows (fill_source null, written before the column
                // existed) keep the old behaviour so nothing pre-guard changes.
                const isLegacySlot = !slot || slot.fill_source == null;
                // A cook day is not enough — the day must also have ARRIVED.
                // Without `<= today` the button is live on a slot days out, and
                // tapping it drains the pantry, mints portions and welds the day
                // shut, because regeneration only ever deletes UNCOOKED slots.
                // Four slots in the 28 Aug week were cooked early this way, one
                // of them three days early. Same mechanism as the 27 Aug
                // incident, which the cook-day guard alone did not close.
                //
                // TWO DIFFERENT QUESTIONS, which were being answered by one flag.
                //   isOwnCook — IS this slot its own cook? A property of the
                //     slot, nothing to do with what day it is today. Decides the
                //     LABEL.
                //   isCookDay — may the Cook BUTTON be live? The cook day AND a
                //     day that has arrived. That is the guard above and it keeps
                //     its date test, unchanged.
                // Sharing one flag meant every FUTURE cook read "leftover from
                // <its own date>" — a Saturday dish labelled as a leftover of
                // Saturday. The guard was right; it was just also being asked a
                // question it has no business answering.
                const isOwnCook =
                  (slot?.fill_source === 'batch_cook' || slot?.fill_source === 'fresh_cook') &&
                  slot?.cook_date === slot?.slot_date;
                const isCookDay = isOwnCook && slot?.slot_date <= today;
                const canCook = (isLegacySlot && slotDate <= today) || isCookDay;
                const sourceLabel = isLegacySlot || !slot ? null
                  : isOwnCook ? 'cook this'
                  : slot.fill_source === 'freezer_pull' ? 'from the freezer'
                  : slot.fill_source === 'batch_freeze' ? (slot.cook_date ? `frozen from ${dayLabel(slot.cook_date)}'s batch` : 'from the freezer')
                  : slot.fill_source === 'fridge_pull' ? 'from the fridge'
                  : slot.fill_source === 'batch_cook' && slot.cook_date ? `from ${dayLabel(slot.cook_date)}'s batch`
                  : slot.fill_source === 'fresh_cook' && slot.cook_date ? `leftover from ${dayLabel(slot.cook_date)}`
                  : null;

                return (
                  <div key={meal} style={{ background: MEAL_WASHES[meal], borderRadius: 10, padding: 8, fontSize: 11 }}>
                    <div style={{ textTransform: 'uppercase', letterSpacing: '.05em', color: MUTED, fontWeight: 600, fontSize: 9 }}>{MEAL_LABELS[meal] || meal}</div>

                    {slot?.eating_out ? (
                      <>
                        <div style={{ fontWeight: 700, marginTop: 2, color: INK }}>{slot.eating_out_label || 'Eating out'}</div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                          est. {money(slot.est_cost_pence)} · {slot.est_kcal ?? '—'} kcal
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <ChipAction disabled={busy} onClick={() => setEatingForm({ slotDate, meal, label: slot.eating_out_label || '', costPounds: slot.est_cost_pence != null ? String(slot.est_cost_pence / 100) : '', kcal: slot.est_kcal ?? '', proteinG: slot.est_protein_g ?? '', carbsG: slot.est_carbs_g ?? '', fatG: slot.est_fat_g ?? '' })}>Edit</ChipAction>
                        </div>
                      </>
                    ) : recipe ? (
                      <>
                        <div style={{ fontWeight: 700, marginTop: 2, color: INK }}>{recipe.name}</div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                          {recipe.kcal ?? '—'} kcal · {money(Math.round((costByRecipe[recipe.id] ?? 0) * 100 * (slot.portions ?? householdPortions)))}
                          {slot.cooked_at ? (
                            <span style={{ color: '#3b7d3b', fontWeight: 700 }}>
                              {' '}· Cooked ✓
                              {(slot.banked_fresh != null || slot.banked_freeze != null)
                                ? ` · ${(slot.banked_fresh ?? 0) + (slot.banked_freeze ?? 0)} banked (${slot.banked_fresh ?? 0} fridge · ${slot.banked_freeze ?? 0} freezer)`
                                : ''}
                            </span>
                          ) : null}
                          {!slot.cooked_at && sourceLabel ? (
                            <span style={{ color: MUTED, fontWeight: 600 }}>{' '}· {sourceLabel}</span>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <Link href={`/recipe/${recipe.id}`} style={{ fontSize: 9, fontWeight: 700, textDecoration: 'underline', color: INK }}>View</Link>
                          <ChipAction disabled={busy} onClick={() => openChooser(slotDate, meal, recipe.id)}>Swap</ChipAction>
                          <ChipAction disabled={busy} onClick={() => editPortions(slot)}>×{slot.portions ?? householdPortions}</ChipAction>
                          {slot.cooked_at || !canCook ? (
                            <ChipAction disabled={busy} onClick={() => eatSlot(slot)} colour={INK}>Eaten</ChipAction>
                          ) : (
                            <ChipAction disabled={busy} onClick={() => setCookingSlot({ ...slot, recipe })} colour={INK}>Cooked</ChipAction>
                          )}
                          <ChipAction disabled={busy} onClick={() => setEatingForm({ slotDate, meal, label: '', costPounds: '', kcal: '', proteinG: '', carbsG: '', fatG: '' })}>Eating out</ChipAction>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <ChipAction disabled={busy} onClick={() => openChooser(slotDate, meal, null)} colour={INK}>+ plan a meal</ChipAction>
                          <ChipAction disabled={busy} onClick={() => setEatingForm({ slotDate, meal, label: '', costPounds: '', kcal: '', proteinG: '', carbsG: '', fatG: '' })}>Eating out</ChipAction>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
  );
}
