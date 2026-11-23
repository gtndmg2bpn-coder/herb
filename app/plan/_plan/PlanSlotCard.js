// app/plan/_plan/PlanSlotCard.js
'use client';

import { BLUE, CREAM, HAIRLINE, INK, MUTED, PLANNABLE_MEALS } from './planShared';
import Link from 'next/link';
import { recipeImageUrl } from '../../../lib/recipeImage';

// KIMI NOTE: module split (2026-11-24) — one slot of the week strip, verbatim
// from the single-file build; date/meal arrive as props, everything else via p.
export function PlanSlotCard({ p, date, meal }) {
  const {
    costPenceById, openSlotSheet, outs, recipeByIdMap,
    slotBadge, slotFor, toggleOutSlot,
  } = p;
  const slot = slotFor(date, meal);
  const recipe = slot?.recipe_id ? recipeByIdMap[slot.recipe_id] : null;
  const isOut = outs.some((o) => o.date === date && o.meal === meal);
  const mealLabel = PLANNABLE_MEALS.find((m) => m.key === meal)?.label || meal;

  if (slot?.eating_out) {
    return (
      <button
        key={meal}
        type="button"
        onClick={() => openSlotSheet(date, meal, 'menu')}
        style={{ border: 'none', borderRadius: 12, background: BLUE, color: CREAM, padding: '10px', minHeight: 40, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}
      >
        <span style={{ display: 'block', fontSize: 11, fontWeight: 700 }}>
          Out — {slot.eating_out_label || 'Eating out'}
        </span>
        <span className="herb-num" style={{ display: 'block', fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>
          {[slot.est_cost_pence != null ? `£${(Number(slot.est_cost_pence) / 100).toFixed(2)}` : null, slot.est_kcal != null ? `${slot.est_kcal} kcal` : null]
            .filter(Boolean).join(' · ')}
        </span>
      </button>
    );
  }

  if (recipe) {
    const costPence = costPenceById[recipe.id];
    return (
      <div key={meal} style={{ position: 'relative', border: `1.5px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <Link href={`/recipe/${recipe.id}`} style={{ textDecoration: 'none', color: INK, display: 'block' }}>
          {recipe.image_id ? (
            <span style={{ display: 'block', aspectRatio: '4 / 3', backgroundColor: '#F1E7D5', backgroundImage: `url('${recipeImageUrl(recipe.image_id)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          ) : (
            <span style={{ display: 'grid', placeItems: 'center', aspectRatio: '4 / 3', backgroundColor: '#F1E7D5', color: MUTED, fontFamily: 'var(--font-newsreader), Georgia, serif', fontStyle: 'italic', fontSize: 26 }}>
              {recipe.name.charAt(0)}
            </span>
          )}
          <span style={{ display: 'block', padding: '6px 8px 8px' }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, fontFamily: 'var(--font-newsreader), Georgia, serif', fontStyle: 'italic' }}>
              {recipe.name}
            </span>
            <span className="herb-num" style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 2 }}>
              {recipe.kcal ?? '—'} kcal{costPence != null ? ` · £${(costPence / 100).toFixed(2)}` : ''}{slotBadge(slot)}
            </span>
          </span>
        </Link>
        <button
          type="button"
          aria-label={`Edit ${mealLabel}`}
          onClick={() => openSlotSheet(date, meal, 'menu')}
          style={{ position: 'absolute', top: 6, right: 6, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(42,41,50,.55)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}
        >
          ⋯
        </button>
      </div>
    );
  }

  if (isOut) {
    return (
      <button
        key={meal}
        type="button"
        onClick={() => openSlotSheet(date, meal, 'menu')}
        style={{ border: `1.5px dashed ${BLUE}`, borderRadius: 12, background: 'transparent', color: MUTED, padding: '10px', minHeight: 40, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}
      >
        Out for {mealLabel}
      </button>
    );
  }

  return (
    <div key={meal} style={{ border: `1.5px dashed ${HAIRLINE}`, borderRadius: 12, padding: '0 8px', display: 'grid' }}>
      <span style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', paddingTop: 6 }}>{mealLabel}</span>
      <div style={{ display: 'flex', gap: 14 }}>
        <button type="button" onClick={() => toggleOutSlot(date, meal)} style={{ border: 'none', background: 'none', color: MUTED, fontSize: 11.5, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', minHeight: 40, padding: 0 }}>
          Out
        </button>
        <button type="button" onClick={() => openSlotSheet(date, meal, 'swap')} style={{ border: 'none', background: 'none', color: INK, fontSize: 11.5, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', minHeight: 40, padding: 0 }}>
          Pick a dish
        </button>
      </div>
    </div>
  );
}
