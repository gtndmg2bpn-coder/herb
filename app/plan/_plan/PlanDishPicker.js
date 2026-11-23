// app/plan/_plan/PlanDishPicker.js
'use client';

import { AMBER, CREAM, DISH_LABEL, GREEN, HAIRLINE, INK, MUTED, inputStyle } from './planShared';
import { recipeImageUrl } from '../../../lib/recipeImage';

// KIMI NOTE: module split of app/plan/page.js (2026-11-24) — bodies verbatim
// from the single-file spec-v2 build; props arrive as one bag (p).
export function PlanDishPicker({ p }) {
  const {
    includeIds, pinnedGaps, recipeList, recipeSearch,
    setDirty, setIncludeIds, setRecipeSearch, steerOn,
    toggleIncluded, visibleRecipes,
  } = p;
  // ── Pick specific dishes ────────────────────────────────
  //    Fifty-five rows in one scroll is not a chooser, it is a
  //    list. The chips above filter it, so picking "Indian" turns
  // a 55-row scroll into five.
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
        Only plan these dishes <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
        {includeIds.length === 0
          ? (steerOn
              ? `Nothing pinned — the planner uses anything matching the chips above.`
              : `Nothing pinned — the planner uses all ${recipeList.length} recipes.`)
          : `${includeIds.length} pinned — the week will be built from these only.`}
      </div>
      {includeIds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {includeIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleIncluded(id)}
              style={{ border: 'none', background: GREEN, color: '#fff', borderRadius: 100, padding: '5px 13px', minHeight: 40, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {recipeList.find((r) => r.id === id)?.name || 'Recipe'} ×
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setIncludeIds([]); setDirty(true); }}
            style={{ border: `1px solid ${HAIRLINE}`, background: '#fff', color: MUTED, borderRadius: 100, padding: '5px 13px', minHeight: 40, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Clear all
          </button>
        </div>
      )}
      {pinnedGaps.length > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: '#B26B00', background: '#FDF6E7', border: `1px solid ${AMBER}`, borderRadius: 10, padding: '9px 12px', marginBottom: 10 }}>
          Nothing you have pinned can serve {pinnedGaps.map((m) => m.label.toLowerCase()).join(', ')} —
          {pinnedGaps.length === 1 ? ' that slot' : ' those slots'} will come back empty. Pin something for
          {pinnedGaps.length === 1 ? ' it' : ' them'}, or untick {pinnedGaps.length === 1 ? 'it' : 'them'} above.
        </div>
      )}
      <input
        type="text"
        placeholder="Search your recipes…"
        value={recipeSearch}
        onChange={(event) => setRecipeSearch(event.target.value)}
        style={{ ...inputStyle, width: '100%', maxWidth: 380, background: '#fff', marginBottom: 8 }}
      />
      <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>
        Showing {visibleRecipes.length} of {recipeList.length}
        {steerOn ? ' · filtered by the chips above' : ''}
      </div>
      {/* ── Dish carousel ─────────────────────────────────────
          The chooser is a carousel of dish cards, not a text
          scroll — you pick with your eyes. Images come from
          recipeImageUrl (the single source of truth for image
          URLs); recipes with no image_id get an honest initial
          tile rather than a broken picture. Tap a card to pin
          it; the chips and search above filter it. */}
      {visibleRecipes.length === 0 ? (
        <div style={{ padding: '14px 12px', fontSize: 13, color: MUTED, border: `1px solid ${HAIRLINE}`, borderRadius: 12, background: '#fff' }}>
          No dishes match. Clear a chip or the search box.
        </div>
      ) : (
        <div className="herb-carousel">
          {visibleRecipes.map((r) => {
            const pinned = includeIds.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleIncluded(r.id)}
                aria-pressed={pinned}
                style={{
                  width: 136, border: `2px solid ${pinned ? INK : HAIRLINE}`,
                  borderRadius: 14, background: '#fff', padding: 0,
                  overflow: 'hidden', cursor: 'pointer', fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                {r.image_id ? (
                  <span style={{ position: 'relative', display: 'block', aspectRatio: '4 / 3', backgroundColor: '#F1E7D5', backgroundImage: `url('${recipeImageUrl(r.image_id)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    {pinned && (
                      <span style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: INK, color: CREAM, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>✓</span>
                    )}
                  </span>
                ) : (
                  <span style={{ position: 'relative', display: 'grid', placeItems: 'center', aspectRatio: '4 / 3', backgroundColor: '#F1E7D5', color: MUTED, fontFamily: 'var(--font-newsreader), Georgia, serif', fontStyle: 'italic', fontSize: 34 }}>
                    {r.name.charAt(0)}
                    {pinned && (
                      <span style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: INK, color: CREAM, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>✓</span>
                    )}
                  </span>
                )}
                <span style={{ display: 'block', padding: '8px 10px 10px' }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, color: INK, fontFamily: 'var(--font-newsreader), Georgia, serif', fontStyle: 'italic' }}>
                    {r.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 3 }}>
                    {[r.cuisine, r.dish_type ? DISH_LABEL[r.dish_type] || r.dish_type : null]
                      .filter(Boolean).join(' · ') || 'untagged'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
