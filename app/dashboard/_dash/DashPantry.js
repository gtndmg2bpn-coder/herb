// app/dashboard/_dash/DashPantry.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { LOCATIONS, MUTED, darkPillButton, inputStyle } from './dashShared';

export function DashPantry({ p }) {
  const { busy, ingredients, pantryForm, pantryStock, recipes, renderPantryRow, setPantryForm, submitPantryAdd } = p;

  return (
      //── Pantry: appliance cards ───────────────────────────────────
      <section>
        <h2 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.03em', margin: '0 0 18px' }}>Pantry</h2>
        {/* One card per location (spec v2 §5) — the appliance graphics
            are gone; fridge/freezer/cupboard now read like every other
            surface: white card, eyebrow header with a count, cooked meals
            then ingredients, hairline rows. */}
        <div className="dash-pantry" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {LOCATIONS.map((location) => {
            const rows = pantryStock.filter((row) => row.location === location);
            const cookedRows = rows.filter((row) => row.item_kind === 'cooked_portion');
            const ingredientRows = rows.filter((row) => row.item_kind !== 'cooked_portion');
            return (
              <div key={location} className="herb-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED }}>{location}</div>
                  <span className="herb-num" style={{ fontSize: 12, color: MUTED }}>{rows.length} item{rows.length === 1 ? '' : 's'}</span>
                </div>
                {rows.length === 0 ? <p style={{ color: MUTED, margin: '4px 0', fontSize: 13 }}>No stock.</p> : (
                  <>
                    {cookedRows.length > 0 ? (
                      <>
                        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, margin: '6px 0 0' }}>Cooked meals</div>
                        {cookedRows.map(renderPantryRow)}
                      </>
                    ) : null}
                    {ingredientRows.length > 0 ? (
                      <>
                        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, margin: cookedRows.length > 0 ? '12px 0 0' : '6px 0 0' }}>Ingredients</div>
                        {ingredientRows.map(renderPantryRow)}
                      </>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Add stock */}
        <div className="herb-card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.02em', margin: 0 }}>Add stock</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={pantryForm.itemKind} onChange={(event) => setPantryForm({ ...pantryForm, itemKind: event.target.value })} style={inputStyle}>
              <option value="ingredient">ingredient</option>
              <option value="cooked_portion">cooked_portion</option>
            </select>
            {pantryForm.itemKind === 'ingredient' ? (
              <select value={pantryForm.ingredientId} onChange={(event) => setPantryForm({ ...pantryForm, ingredientId: event.target.value })} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">Choose ingredient…</option>
                {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
              </select>
            ) : (
              <select value={pantryForm.recipeId} onChange={(event) => setPantryForm({ ...pantryForm, recipeId: event.target.value })} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">Choose recipe…</option>
                {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
              </select>
            )}
            <input placeholder="Label fallback (optional)" value={pantryForm.label} onChange={(event) => setPantryForm({ ...pantryForm, label: event.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Quantity" value={pantryForm.quantity} onChange={(event) => setPantryForm({ ...pantryForm, quantity: event.target.value })} style={{ ...inputStyle, width: 100 }} />
            <input placeholder="Unit" value={pantryForm.unit} onChange={(event) => setPantryForm({ ...pantryForm, unit: event.target.value })} style={{ ...inputStyle, width: 80 }} />
            <select value={pantryForm.location} onChange={(event) => setPantryForm({ ...pantryForm, location: event.target.value })} style={inputStyle}>
              {LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
            <input placeholder="Cost (£)" value={pantryForm.costPounds} onChange={(event) => setPantryForm({ ...pantryForm, costPounds: event.target.value })} style={{ ...inputStyle, width: 100 }} />
            <label style={{ fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
              Bought/cooked
              <input type="date" value={pantryForm.boughtDate} onChange={(event) => setPantryForm({ ...pantryForm, boughtDate: event.target.value })} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
              Expiry (auto if blank)
              <input type="date" value={pantryForm.expiryDate} onChange={(event) => setPantryForm({ ...pantryForm, expiryDate: event.target.value })} style={inputStyle} />
            </label>
          </div>
          <div>
            <button type="button" disabled={busy} onClick={submitPantryAdd} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
              Add pantry item
            </button>
          </div>
        </div>
      </section>
  );
}
