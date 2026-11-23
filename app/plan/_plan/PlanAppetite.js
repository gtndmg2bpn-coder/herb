// app/plan/_plan/PlanAppetite.js
'use client';

import { ALLERGENS, ALLERGEN_LABELS, CREAM, CUISINE_TAGS, Chip, DISH_TAGS, HAIRLINE, INK, MUTED, Toggle, eyebrowStyle } from './planShared';

// KIMI NOTE: module split of app/plan/page.js (2026-11-24) — bodies verbatim
// from the single-file spec-v2 build; props arrive as one bag (p).
export function PlanAppetite(p) {
  const {
    avoidMeat, dislikedCuisines, matchingLD, profileAllergens,
    setAvoidMeat, setDirty, setWeekCuisines, setWeekDishTypes,
    toggleCuisine, toggleDishType, toggleWeekAllergen, weekAllergens,
    weekCuisines, weekDishTypes,
  } = p;
  return (
    <section className="herb-card herb-card-bleed">
      <div style={eyebrowStyle}>This week&rsquo;s appetite</div>
      <Toggle on={avoidMeat} onChange={(value) => { setAvoidMeat(value); setDirty(true); }} label="Off meat this week" />
      <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
        Drops beef, pork, lamb and chicken. Fish and vegetarian dishes stay.
      </div>

      {/* Avoid this week — temporary, separate from your profile allergies */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Avoid this week</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
          Just for these seven days — vegan January, off gluten, too hot for heavy food.
          {profileAllergens.length > 0 ? ' Your profile allergies are always excluded and are not listed here.' : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ALLERGENS.filter((code) => !profileAllergens.includes(code)).map((code) => {
            const on = weekAllergens.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleWeekAllergen(code)}
                style={{
                  display: 'inline-flex', alignItems: 'center', minHeight: 40,
                  border: `1px solid ${on ? INK : HAIRLINE}`, background: on ? INK : '#fff',
                  color: on ? CREAM : INK, borderRadius: 100, padding: '5px 13px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {ALLERGEN_LABELS[code]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fancy something? Cuisine + dish-type chips ──────────
          These are TASTE steers and they bind LUNCH AND DINNER ONLY.
          Breakfasts, shakes and snacks carry the 'Anytime' cuisine
          because they have none, so steering them too would blank
          seven breakfasts and fourteen snacks the moment you tapped
          "Indian". Light meals are already exempt from the slot cap;
          they are exempt from this for the same reason. ── */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
          Fancy a cuisine? <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
          Steers lunch and dinner. Breakfast and snacks are never steered.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {/* KIMI NOTE: disliked cuisines are hidden from the steer chips
              (Karum, 16 Nov 2026) — a hard-excluded cuisine must not be
              offered as a steer. Unticking one for dislike removes its chip. */}
          {CUISINE_TAGS.filter((tag) => !dislikedCuisines.includes(tag)).map((tag) => (
            <Chip key={tag} on={weekCuisines.includes(tag)} onClick={() => toggleCuisine(tag)}>
              {tag}
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
          Fancy something in particular? <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
          A week of salads, a week of curries — the shape of the food rather than its flavour.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DISH_TAGS.map((d) => (
            <Chip key={d.key} on={weekDishTypes.includes(d.key)} onClick={() => toggleDishType(d.key)}>
              {d.label}
            </Chip>
          ))}
        </div>
        {(weekCuisines.length > 0 || weekDishTypes.length > 0) && (
          <button
            type="button"
            onClick={() => { setWeekCuisines([]); setWeekDishTypes([]); setDirty(true); }}
            style={{ marginTop: 10, border: 'none', background: 'none', color: MUTED, fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0, minHeight: 40 }}
          >
            Clear the steer
          </button>
        )}
        {matchingLD === 0 && (weekCuisines.length > 0 || weekDishTypes.length > 0) && (
          <div style={{ fontSize: 12, fontWeight: 600, color: '#C0392B', marginTop: 10 }}>
            Nothing in your book matches that for lunch or dinner — those slots would come back empty.
          </div>
        )}
      </div>
    </section>
  );
}
