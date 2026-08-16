// lib/actions.js
// THE ACTION LAYER — the only write path in the app.
//
// Every mutation to the plan / pantry / spend / intake / weight goes through one
// of these functions, which call the Section A security-definer RPCs. Nothing else
// in the app writes to those tables (direct writes are denied by RLS on purpose).
// Voice, receipt and n8n adapters will call these SAME functions later — that is
// the whole point of routing every change through one fixed vocabulary.
//
// Each function returns { data, error } (never throws) so callers branch cleanly.
// Confirmation ("Mark Tuesday dinner as eating out?") is the CALLER's job — these
// just execute once the user has confirmed.

import { getBrowserClient } from './supabaseBrowser';

// Local (not UTC) date as YYYY-MM-DD, for RPC date params the caller leaves null.
// toISOString() would give the UTC date, which is the wrong day late at night in the UK.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- PLAN ------------------------------------------------------------------

export async function swapMeal({ slotDate, meal, recipeId, neverAgain = false }) {
  const supabase = getBrowserClient();
  return supabase.rpc('swap_meal', {
    p_slot_date: slotDate,
    p_meal: meal,
    p_recipe_id: recipeId,
    p_never_again: neverAgain,
  });
}

export async function markEatingOut({
  slotDate, meal, label,
  estCostPence = null, estKcal = null,
  estProteinG = null, estCarbsG = null, estFatG = null,
}) {
  const supabase = getBrowserClient();
  return supabase.rpc('mark_eating_out', {
    p_slot_date: slotDate,
    p_meal: meal,
    p_label: label,
    p_est_cost_pence: estCostPence,
    p_est_kcal: estKcal,
    p_est_protein_g: estProteinG,
    p_est_carbs_g: estCarbsG,
    p_est_fat_g: estFatG,
  });
}

export async function setPortions({ slotDate, meal, portions }) {
  const supabase = getBrowserClient();
  return supabase.rpc('set_portions', {
    p_slot_date: slotDate,
    p_meal: meal,
    p_portions: portions,
  });
}

// --- PANTRY ----------------------------------------------------------------

// items: array of { itemKind, ingredientId?, recipeId?, label?, quantity,
// unit?, location, costPence?, expiryDate?, note? }
// Mapped to the snake_case keys the RPC expects.
export async function addPantryItems(items) {
  const supabase = getBrowserClient();
  const p_items = (items || []).map((it) => ({
    item_kind: it.itemKind,
    ingredient_id: it.ingredientId ?? null,
    recipe_id: it.recipeId ?? null,
    label: it.label ?? null,
    quantity: it.quantity,
    unit: it.unit ?? null,
    location: it.location,
    cost_pence: it.costPence ?? null,
    expiry_date: it.expiryDate ?? null,
    note: it.note ?? null,
  }));
  return supabase.rpc('add_pantry_items', { p_items });
}

export async function consumePantryItem({
  itemKind, quantity, location,
  ingredientId = null, recipeId = null, label = null, unit = null, note = null,
}) {
  const supabase = getBrowserClient();
  return supabase.rpc('consume_pantry_item', {
    p_item_kind: itemKind,
    p_quantity: quantity,
    p_location: location,
    p_ingredient_id: ingredientId,
    p_recipe_id: recipeId,
    p_label: label,
    p_unit: unit,
    p_note: note,
  });
}

// --- SPEND / INTAKE / WEIGHT ----------------------------------------------

export async function logSpend({ amountPence, category = 'grocery', spendDate = null, note = null }) {
  const supabase = getBrowserClient();
  return supabase.rpc('log_spend', {
    p_amount_pence: amountPence,
    p_category: category,
    p_spend_date: spendDate ?? todayIso(),
    p_note: note,
  });
}

export async function logOffPlanIntake({
  description, kcal = null, proteinG = null, carbsG = null, fatG = null,
  confidence = 'ESTIMATED', source = null, intakeDate = null,
}) {
  const supabase = getBrowserClient();
  return supabase.rpc('log_off_plan_intake', {
    p_description: description,
    p_kcal: kcal,
    p_protein_g: proteinG,
    p_carbs_g: carbsG,
    p_fat_g: fatG,
    p_confidence: confidence,
    p_source: source,
    p_intake_date: intakeDate ?? todayIso(),
  });
}

export async function logWeight({ weightKg, note = null }) {
  const supabase = getBrowserClient();
  return supabase.rpc('log_weight', {
    p_weight_kg: weightKg,
    p_note: note,
  });
}
