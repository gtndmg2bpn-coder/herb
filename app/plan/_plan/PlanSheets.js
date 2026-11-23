// app/plan/_plan/PlanSheets.js
'use client';

import { GREEN, HAIRLINE, INK, MUTED, PLANNABLE_MEALS, Toggle, eyebrowStyle, inputStyle } from './planShared';
import Link from 'next/link';

// KIMI NOTE: module split of app/plan/page.js (2026-11-24) — bodies verbatim
// from the single-file spec-v2 build; props arrive as one bag (p).
export function PlanShapeSheet({ p }) {
  const {
    defaultWindowsOn, mealsToPlan, profileWindows, saveWindowsDefault,
    setDefaultWindowsOn, setWindowsSheetOpen, toggleMeal, windowsSheetOpen,
  } = p;
  // ── This week's shape sheet ─────────────────────────────
  //    Bottom sheet on a phone, centred card on desktop (the
  //    herb-sheet classes). Toggling a window edits this week
  //    immediately — mealsToPlan is the same state the outs pills,
  //    guest rows and payloads have always derived from.
  return (windowsSheetOpen && (
    <div className="herb-sheet-scrim" onClick={() => setWindowsSheetOpen(false)}>
      {/* stopPropagation so tapping inside the sheet doesn't close it */}
      <div className="herb-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={eyebrowStyle}>This week&rsquo;s shape</div>
        <div style={{ display: 'grid' }}>
          {PLANNABLE_MEALS.map((m) => {
            const on = mealsToPlan.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  // At least one window must stay on — a week with
                  // zero planned meals plans nothing.
                  if (on && mealsToPlan.length === 1) return;
                  toggleMeal(m.key);
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  minHeight: 52, border: 'none', borderBottom: `1px solid ${HAIRLINE}`,
                  background: 'none', padding: '6px 0', fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{m.label}</span>
                <span style={{ width: 44, height: 24, borderRadius: 100, background: on ? GREEN : HAIRLINE, position: 'relative', transition: 'background .15s' }}>
                  <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
          Dessert counts as a snack — anything snack-tagged can land in either snack window.
        </div>
        <Toggle on={defaultWindowsOn} onChange={setDefaultWindowsOn} label="Always plan these meals" />
        {profileWindows && defaultWindowsOn && (
          <div style={{ fontSize: 12, color: MUTED }}>
            Saves to your profile — every new week starts with these windows.
          </div>
        )}
        <button
          type="button"
          className="herb-btn herb-btn-primary"
          onClick={async () => {
            if (defaultWindowsOn) await saveWindowsDefault();
            setWindowsSheetOpen(false);
          }}
        >
          Done
        </button>
      </div>
    </div>
    ));
}

export function PlanSlotSheet({ p }) {
  const {
    allergensByRecipe, dislikedIds, eatingForm, openEatingForm,
    outs, profileAllergens, recipeByIdMap, recipeList,
    setEatingForm, setSheetSearch, setSlotSheet, sheetEatingOut,
    sheetPortions, sheetSearch, sheetSwap, shortDayLabel,
    slotFor, slotSheet, toggleOutSlot,
  } = p;
  // ── Slot sheet ──────────────────────────────────────────
  //    One sheet for every slot state (spec v2 §2). KIMI NOTE: there
  //    is no "clear eating-out" RPC — a labelled eating-out slot can
  //    be swapped or overwritten by a regenerate, and a constraint
  //    out can be cleared here; that asymmetry is recorded, not
  // hidden.
  return (slotSheet && (() => {
    const { date, meal, mode } = slotSheet;
    const slot = slotFor(date, meal);
    const currentRecipe = slot?.recipe_id ? recipeByIdMap[slot.recipe_id] : null;
    const isOutConstraint = outs.some((o) => o.date === date && o.meal === meal);
    const mealLabel = PLANNABLE_MEALS.find((m) => m.key === meal)?.label || meal;

    if (mode === 'swap') {
      const disliked = new Set(dislikedIds);
      const safe = recipeList.filter((r) => {
        if (currentRecipe && r.id === currentRecipe.id) return false;
        if (disliked.has(r.id)) return false;
        const contains = allergensByRecipe[r.id] || [];
        return !contains.some((a) => profileAllergens.includes(a));
      });
      const q = sheetSearch.trim().toLowerCase();
      const options = safe.filter((r) => !q || r.name.toLowerCase().includes(q));
      return (
        <div className="herb-sheet-scrim" onClick={() => setSlotSheet(null)}>
          <div className="herb-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={eyebrowStyle}>Pick a dish — {shortDayLabel(date)} · {mealLabel}</div>
            <input
              autoFocus
              type="text"
              placeholder="Search your recipes…"
              value={sheetSearch}
              onChange={(event) => setSheetSearch(event.target.value)}
              style={{ ...inputStyle, width: '100%', background: '#fff' }}
            />
            <div style={{ fontSize: 12, color: MUTED }}>
              {options.length} shown — the rest are hidden by your allergens, dislikes and pinned filters.
            </div>
            <div style={{ display: 'grid', maxHeight: 320, overflowY: 'auto' }}>
              {options.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => sheetSwap(r.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48, border: 'none', borderTop: `1px solid ${HAIRLINE}`, background: 'none', padding: '8px 0', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{r.name}</span>
                  <span className="herb-num" style={{ fontSize: 12, color: MUTED }}>{r.kcal ?? '—'} kcal</span>
                </button>
              ))}
              {options.length === 0 ? (
                <div style={{ fontSize: 13, color: MUTED, padding: '12px 0' }}>Nothing matches that search.</div>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    if (mode === 'eating') {
      return (
        <div className="herb-sheet-scrim" onClick={() => setSlotSheet(null)}>
          <div className="herb-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={eyebrowStyle}>Eating out — {shortDayLabel(date)} · {mealLabel}</div>
            <input
              placeholder="Label (e.g. pub dinner)"
              value={eatingForm.label}
              onChange={(event) => setEatingForm({ ...eatingForm, label: event.target.value })}
              style={{ ...inputStyle, width: '100%', background: '#fff' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Est. cost (£)"
                value={eatingForm.costPounds}
                onChange={(event) => setEatingForm({ ...eatingForm, costPounds: event.target.value })}
                style={{ ...inputStyle, width: '50%', background: '#fff' }}
              />
              <input
                placeholder="kcal (optional)"
                value={eatingForm.kcal}
                onChange={(event) => setEatingForm({ ...eatingForm, kcal: event.target.value })}
                style={{ ...inputStyle, width: '50%', background: '#fff' }}
              />
            </div>
            <button type="button" className="herb-btn herb-btn-primary" onClick={sheetEatingOut}>
              Save eating out
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="herb-sheet-scrim" onClick={() => setSlotSheet(null)}>
        <div className="herb-sheet" onClick={(e) => e.stopPropagation()}>
          <div style={eyebrowStyle}>{shortDayLabel(date)} · {mealLabel}</div>
          {currentRecipe ? (
            <>
              <Link
                href={`/recipe/${currentRecipe.id}`}
                className="herb-btn herb-btn-primary"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setSlotSheet(null)}
              >
                View recipe
              </Link>
              <button type="button" className="herb-btn herb-btn-secondary" onClick={() => setSlotSheet({ date, meal, mode: 'swap' })}>
                Swap this dish
              </button>
            </>
          ) : (
            <button type="button" className="herb-btn herb-btn-primary" onClick={() => setSlotSheet({ date, meal, mode: 'swap' })}>
              Pick a dish
            </button>
          )}
          {slot || isOutConstraint ? (
            <button type="button" className="herb-btn herb-btn-secondary" onClick={() => openEatingForm(date, meal)}>
              Eating out…
            </button>
          ) : (
            <button type="button" className="herb-btn herb-btn-secondary" onClick={() => { toggleOutSlot(date, meal); setSlotSheet(null); }}>
              Mark out
            </button>
          )}
          {isOutConstraint ? (
            <button type="button" className="herb-btn herb-btn-secondary" onClick={() => { toggleOutSlot(date, meal); setSlotSheet(null); }}>
              Clear out
            </button>
          ) : null}
          {slot ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Portions</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  aria-label="Fewer portions"
                  onClick={() => sheetPortions(-1)}
                  style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${HAIRLINE}`, background: '#fff', color: INK, fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}
                >
                  −
                </button>
                <b className="herb-num" style={{ fontSize: 16 }}>{slot.portions ?? 1}</b>
                <button
                  type="button"
                  aria-label="More portions"
                  onClick={() => sheetPortions(1)}
                  style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${HAIRLINE}`, background: '#fff', color: INK, fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}
                >
                  +
                </button>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );
    })());
}
