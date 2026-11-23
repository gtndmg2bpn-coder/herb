// app/dashboard/_dash/dashPantry.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { addPantryItems, eatPortions, binStock, movePantryStock, cookMeal } from '../../../lib/actions';
import { addDays, dayLabel } from '../../../lib/dates';
import { HAIRLINE, INK, poundsToPence, ChipAction } from './dashShared';

export function createDashPantry(deps) {
  const { busy, ingredientById, pantryForm, pantryLots, recipeById, runAction, setError, setPantryForm, today } = deps;

  async function submitPantryAdd() {
    const quantity = Number(pantryForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Pantry quantity must be positive.');
      return;
    }
    if (pantryForm.itemKind === 'ingredient' && !pantryForm.ingredientId) {
      setError('Choose an ingredient, or use a label.');
      return;
    }
    if (pantryForm.itemKind === 'cooked_portion' && !pantryForm.recipeId) {
      setError('Choose a recipe, or use a label.');
      return;
    }

    await runAction('Add this pantry stock?', () => addPantryItems([{
      itemKind: pantryForm.itemKind,
      ingredientId: pantryForm.ingredientId || null,
      recipeId: pantryForm.recipeId || null,
      label: pantryForm.label.trim() || null,
      quantity,
      unit: pantryForm.unit.trim() || null,
      location: pantryForm.location,
      costPence: poundsToPence(pantryForm.costPounds),
      expiryDate: pantryForm.expiryDate || null,
      boughtDate: pantryForm.boughtDate || null,
    }]));

    setPantryForm({ itemKind: 'ingredient', ingredientId: '', recipeId: '', label: '', quantity: '', unit: '', location: 'fridge', costPounds: '', expiryDate: '', boughtDate: '' });
  }

  async function binStockRow(row) {
    const proposed = window.prompt(`Bin how much of ${stockName(row)}?`, String(row.quantity));
    if (proposed == null) return;
    const quantity = Number(proposed);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Bin quantity must be positive.');
      return;
    }
    await runAction(`Bin ${quantity} of ${stockName(row)}? This logs the waste cost.`, () => binStock({
      itemKind: row.item_kind,
      quantity,
      location: row.location,
      ingredientId: row.ingredient_id,
      recipeId: row.recipe_id,
    }));
  }

  // Fridge <-> freezer. The destination lot gets a fresh rule-derived expiry
  // (cooked portions: 3 days fridge, 30 days freezer).
  async function moveStock(row) {
    const to = row.location === 'fridge' ? 'freezer' : 'fridge';
    const proposed = window.prompt(`Move how much of ${stockName(row)} to the ${to}?`, String(row.quantity));
    if (proposed == null) return;
    const quantity = Number(proposed);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Move quantity must be positive.');
      return;
    }
    await runAction(`Move ${quantity} of ${stockName(row)} to the ${to}?`, () => movePantryStock({
      itemKind: row.item_kind,
      quantity,
      fromLocation: row.location,
      toLocation: to,
      ingredientId: row.ingredient_id,
      recipeId: row.recipe_id,
    }));
  }

  // Eating a planned (cooked) slot — the cost of eating lands here.
  async function eatSlot(slot) {
    const recipe = recipeById[slot.recipe_id];
    const proposed = window.prompt(`Eat how many portions of ${recipe?.name ?? 'this meal'}?`, '1');
    if (proposed == null) return;
    const portions = Number(proposed);
    if (!Number.isFinite(portions) || portions <= 0) {
      setError('Portions must be a positive number.');
      return;
    }
    await runAction(`Log ${portions} portion(s) of ${recipe?.name ?? 'this meal'} as eaten?`, async () => {
      const result = await eatPortions({ recipeId: slot.recipe_id, portions });
      if (!result.error && Number(result.data?.not_in_stock) > 0) {
        setError(`Logged — but only ${result.data.from_stock} portion(s) were in stock, so ${result.data.not_in_stock} came straight off the hob.`);
      }
      return result;
    });
  }

  // Eating from a cooked-portion stock row (e.g. leftovers later in the week).
  async function eatStock(row) {
    const proposed = window.prompt(`Eat how many portions of ${stockName(row)}?`, '1');
    if (proposed == null) return;
    const portions = Number(proposed);
    if (!Number.isFinite(portions) || portions <= 0) {
      setError('Portions must be a positive number.');
      return;
    }
    await runAction(`Log ${portions} portion(s) of ${stockName(row)} as eaten?`, async () => {
      const result = await eatPortions({ recipeId: row.recipe_id, portions });
      if (!result.error && Number(result.data?.not_in_stock) > 0) {
        setError(`Logged — but only ${result.data.from_stock} portion(s) were in stock.`);
      }
      return result;
    });
  }

  async function cookSlot(slot) {
    await runAction(
      `Mark ${dayLabel(slot.slot_date)} ${slot.meal} as cooked? This takes the ingredients from your pantry and banks the portions in the fridge.`,
      async () => {
        const result = await cookMeal({ slotDate: slot.slot_date, meal: slot.meal });
        if (!result.error && result.data?.shortfalls?.length) {
          const list = result.data.shortfalls
            .map((s) => `${s.name ?? 'An ingredient'}: ${s.short}${s.unit ? ` ${s.unit}` : ''} short`)
            .join('; ');
          setError(`Cooked, but the pantry was short — ${list}.`);
        }
        return result;
      }
    );
  }

  // Pantry row (spec v2 §5): name — quantity with the expiry badge on the
  // right, Eat/Move/Bin as underlined mini-actions. Same RPCs and confirms
  // as the old appliance cards; only the skin changed.
  function renderPantryRow(row) {
    const badge = expiryBadge(row);
    return (
      <div key={`${row.location}|${row.item_kind}|${row.ingredient_id}|${row.recipe_id}`} style={{ borderTop: `1px solid ${HAIRLINE}`, padding: '8px 0', fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>{stockName(row)} — {stockQuantity(row)}</span>
          {badge ? (
            <span style={{ background: badge.wash, color: INK, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '.05em', flexShrink: 0 }}>
              {badge.text}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {row.item_kind === 'cooked_portion' && row.recipe_id ? (
            <ChipAction disabled={busy} onClick={() => eatStock(row)} colour={INK}>Eat</ChipAction>
          ) : null}
          {row.location !== 'cupboard' ? (
            <ChipAction disabled={busy} onClick={() => moveStock(row)}>
              {row.location === 'fridge' ? 'To freezer' : 'To fridge'}
            </ChipAction>
          ) : null}
          <ChipAction disabled={busy} onClick={() => binStockRow(row)}>Bin</ChipAction>
        </div>
      </div>
    );
  }

  function stockName(row) {
    return ingredientById[row.ingredient_id]?.name || recipeById[row.recipe_id]?.name || row.label || 'Pantry item';
  }

  function stockQuantity(row) {
    return row.item_kind === 'cooked_portion'
      ? `${row.quantity} portion${Number(row.quantity) === 1 ? '' : 's'}`
      : `${row.quantity}`;
  }

  function expiryBadge(row) {
    const matchingLots = pantryLots
      .filter((lot) => lot.location === row.location)
      .filter((lot) => (lot.ingredient_id && lot.ingredient_id === row.ingredient_id) || (lot.recipe_id && lot.recipe_id === row.recipe_id) || (!lot.ingredient_id && !lot.recipe_id))
      .filter((lot) => lot.expiry_date)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    const soonest = matchingLots[0]?.expiry_date;
    if (!soonest) return null;

    const warnBy = row.location === 'fridge' ? addDays(today, 2) : today;
    if (soonest < today) return { text: 'expired', wash: '#FFAB91' };
    if (soonest <= warnBy) return { text: 'use soon', wash: '#E9C067' };
    return null;
  }

  return {
    submitPantryAdd,
    binStockRow,
    moveStock,
    eatSlot,
    eatStock,
    cookSlot,
    renderPantryRow,
    stockName,
    stockQuantity,
    expiryBadge,
  };
}
