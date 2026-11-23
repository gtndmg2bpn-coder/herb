// app/dashboard/_dash/DashOffPlan.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { HAIRLINE, MUTED, darkPillButton, inputStyle, money } from './dashShared';

export function DashOffPlan({ p }) {
  const { busy, ingredients, intakeForm, intakeRows, setIntakeForm, submitIntake, wasteRows } = p;

  return (
      //── Log off-plan / Log eat / Log bin ──────────────────────────
      <section style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 20, padding: 24, display: 'grid', gap: 12 }}>
        <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', margin: 0 }}>Log off-plan</h2>
        <input placeholder="Description" value={intakeForm.description} onChange={(event) => setIntakeForm({ ...intakeForm, description: event.target.value })} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="kcal" value={intakeForm.kcal} onChange={(event) => setIntakeForm({ ...intakeForm, kcal: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="protein g" value={intakeForm.proteinG} onChange={(event) => setIntakeForm({ ...intakeForm, proteinG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="carbs g" value={intakeForm.carbsG} onChange={(event) => setIntakeForm({ ...intakeForm, carbsG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="fat g" value={intakeForm.fatG} onChange={(event) => setIntakeForm({ ...intakeForm, fatG: event.target.value })} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="Cost (£, optional)" value={intakeForm.costPounds} onChange={(event) => setIntakeForm({ ...intakeForm, costPounds: event.target.value })} style={{ ...inputStyle, width: 140 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: MUTED }}>Used from pantry (optional):</span>
          <select value={intakeForm.pantryIngredientId} onChange={(event) => setIntakeForm({ ...intakeForm, pantryIngredientId: event.target.value })} style={inputStyle}>
            <option value="">Choose ingredient…</option>
            {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
          </select>
          <input placeholder="Qty" style={{ ...inputStyle, width: 72 }} value={intakeForm.pantryQuantity} onChange={(event) => setIntakeForm({ ...intakeForm, pantryQuantity: event.target.value })} />
        </div>
        <div>
          <button type="button" disabled={busy} onClick={submitIntake} style={{ ...darkPillButton, opacity: busy ? 0.7 : 1 }}>
            Log intake
          </button>
        </div>

        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.02em', margin: '12px 0 0' }}>Log eat</h3>
        {intakeRows.length ? intakeRows.map((row) => (
          <p key={row.id} style={{ margin: 0, color: MUTED, fontSize: 13 }}>
            {row.intake_date}: {row.description} — {row.kcal ?? '—'} kcal
            {row.cost_pence != null ? ` · ${money(row.cost_pence)}` : ''}
            {row.confidence === 'ESTIMATED' ? ' (estimated — confirm?)' : ''}
          </p>
        )) : <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Nothing eaten logged yet.</p>}

        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.02em', margin: '12px 0 0' }}>Log bin</h3>
        {wasteRows.length ? wasteRows.map((row) => (
          <p key={row.id} style={{ margin: 0, color: MUTED, fontSize: 13 }}>
            {row.wasted_date}: {row.label || 'Binned item'} — {row.quantity}{row.unit ? ` ${row.unit}` : ''}
            {row.cost_pence != null ? ` · ${money(row.cost_pence)} wasted` : ''}
          </p>
        )) : <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Nothing binned this week. Nice.</p>}
      </section>
  );
}
