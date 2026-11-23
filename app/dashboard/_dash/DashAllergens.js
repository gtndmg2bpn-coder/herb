// app/dashboard/_dash/DashAllergens.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { ALLERGENS, ALLERGEN_LABELS, CREAM, CUISINES, HAIRLINE, INK, MUTED, inputStyle } from './dashShared';

export function DashAllergens({ p }) {
  const { addDislikedIngredient, busy, ingredientById, ingredients, profile, removeDislikedIngredient, toggleAllergen, toggleCuisine } = p;

  return (
      //── Allergens & dislikes ──────────────────────────────────────
      <section style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, display: 'grid', gap: 16 }}>
        <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>Allergens &amp; dislikes</h2>
        <div>
          <strong style={{ fontSize: 13 }}>Allergens — tap to toggle. Recipes containing them are hidden, safely.</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {ALLERGENS.map((allergen) => {
              const active = (profile?.allergens || []).includes(allergen);
              return (
                <button
                  key={allergen}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleAllergen(allergen)}
                  style={{
                    borderRadius: 100,
                    padding: '6px 14px',
                    border: `1.5px solid ${active ? INK : HAIRLINE}`,
                    cursor: 'pointer',
                    background: active ? INK : '#fff',
                    color: active ? CREAM : INK,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                  }}
                >
                  {ALLERGEN_LABELS[allergen] ?? allergen}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <strong style={{ fontSize: 13 }}>Cuisines — like or dislike. Disliked cuisines are never planned or offered as swaps; liked ones steer your week.</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {CUISINES.map((cuisine) => {
              const liked = (profile?.liked_cuisines || []).includes(cuisine);
              const disliked = (profile?.disliked_cuisines || []).includes(cuisine);
              return (
                <span
                  key={cuisine}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    borderRadius: 100, padding: '5px 6px 5px 14px',
                    border: `1.5px solid ${disliked ? '#F5C6C0' : liked ? INK : HAIRLINE}`,
                    background: disliked ? '#FDECEA' : liked ? INK : '#fff',
                    color: disliked ? '#b00020' : liked ? CREAM : INK,
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  }}
                >
                  {cuisine}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleCuisine(cuisine, 'like')}
                    style={{
                      border: 'none', borderRadius: 100, padding: '3px 10px', fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: liked ? CREAM : 'transparent',
                      color: liked ? INK : liked || disliked ? 'rgba(251,247,241,.75)' : MUTED,
                      textDecoration: liked ? 'none' : 'underline',
                    }}
                  >
                    Like
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleCuisine(cuisine, 'dislike')}
                    style={{
                      border: 'none', borderRadius: 100, padding: '3px 10px', fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: disliked ? '#b00020' : 'transparent',
                      color: disliked ? '#fff' : liked ? 'rgba(251,247,241,.75)' : MUTED,
                      textDecoration: disliked ? 'none' : 'underline',
                    }}
                  >
                    Dislike
                  </button>
                </span>
              );
            })}
          </div>
        </div>
        <div>
          <strong style={{ fontSize: 13 }}>Disliked ingredients — hidden from your meal choices.</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            {(profile?.disliked_ingredient_ids || []).map((id) => (
              <span key={id} style={{ borderRadius: 100, padding: '6px 12px', border: `1.5px solid ${HAIRLINE}`, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {ingredientById[id]?.name ?? 'Ingredient'}
                <button type="button" disabled={busy} onClick={() => removeDislikedIngredient(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: MUTED, padding: 0, fontFamily: 'inherit' }}>×</button>
              </span>
            ))}
            <select value="" disabled={busy} onChange={(event) => addDislikedIngredient(event.target.value)} style={{ ...inputStyle, padding: '6px 12px', fontSize: 12 }}>
              <option value="">+ add ingredient…</option>
              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
            </select>
          </div>
          {(profile?.dislikes || []).length > 0 ? (
            <p style={{ fontSize: 12, color: MUTED, margin: '8px 0 0' }}>
              Typed dislikes ({(profile?.dislikes || []).join(', ')}) don&rsquo;t filter choices — re-add them with the picker above.
            </p>
          ) : null}
        </div>
      </section>
  );
}
