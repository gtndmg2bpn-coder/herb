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
// unit?, location, costPence?, expiryDate?, boughtDate?, note? }
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
    bought_date: it.boughtDate ?? null,
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

// Moves stock between locations (e.g. fridge -> freezer). The destination lot
// gets a fresh expiry derived from your shelf-life rules (cooked portions get
// 30 days in the freezer, 3 in the fridge).
export async function movePantryStock({
  itemKind, quantity, fromLocation, toLocation,
  ingredientId = null, recipeId = null, label = null,
}) {
  const supabase = getBrowserClient();
  return supabase.rpc('move_pantry_stock', {
    p_item_kind: itemKind,
    p_quantity: quantity,
    p_from_location: fromLocation,
    p_to_location: toLocation,
    p_ingredient_id: ingredientId,
    p_recipe_id: recipeId,
    p_label: label,
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
  confidence = 'ESTIMATED', source = null, intakeDate = null, costPence = null,
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
    p_cost_pence: costPence,
  });
}

// Eats portions of a recipe: draws cooked-portion stock (fridge first, then
// freezer), logs the intake with the recipe's macros, and records the CONSUMED
// cost (per-portion recipe cost — not the pack price). This is where the cost
// of eating lands.
export async function eatPortions({ recipeId, portions = 1, intakeDate = null }) {
  const supabase = getBrowserClient();
  return supabase.rpc('eat_portions', {
    p_recipe_id: recipeId,
    p_portions: portions,
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

// --- SHOPPING --------------------------------------------------------------

// Builds the week's trips (main + top-ups every N days) from planned meals minus pantry.
export async function generateShoppingList({ weekStart = null, mainTripDate = null, topupCadenceDays = 3 }) {
  const supabase = getBrowserClient();
  return supabase.rpc('generate_shopping_list', {
    p_week_start: weekStart ?? todayIso(),
    p_main_trip_date: mainTripDate ?? todayIso(),
    p_topup_cadence_days: topupCadenceDays,
  });
}

// items: array of { itemId, bought, actualCostPence? }
// Bought items become pantry lots; one spend row per trip.
export async function logShoppingTrip({ tripId, items = [], actualTotalPence = null }) {
  const supabase = getBrowserClient();
  const p_items = (items || []).map((it) => ({
    item_id: it.itemId,
    bought: it.bought,
    actual_cost_pence: it.actualCostPence ?? null,
  }));
  return supabase.rpc('log_shopping_trip', {
    p_trip_id: tripId,
    p_items,
    p_actual_total_pence: actualTotalPence,
  });
}

// One tap locks a trip's estimated prices as USER_CONFIRMED.
export async function confirmTripPrices({ tripId }) {
  const supabase = getBrowserClient();
  return supabase.rpc('confirm_trip_prices', { p_trip_id: tripId });
}

// Cooking a planned meal drains the pantry by the recipe quantities and banks
// the cooked portions in the fridge.
// Returns { data: { lines_consumed, shortfalls, portions_banked }, error }.
export async function cookMeal({ slotDate, meal }) {
  const supabase = getBrowserClient();
  return supabase.rpc('cook_meal', {
    p_slot_date: slotDate,
    p_meal: meal,
  });
}

// Updates the canonical price (and optionally pack size) of an ingredient.
// Marks the price USER_SUPPLIED.
export async function setIngredientPrice({ ingredientId, pricePence, packSize = null }) {
  const supabase = getBrowserClient();
  return supabase.rpc('set_ingredient_price', {
    p_ingredient_id: ingredientId,
    p_price_pence: pricePence,
    p_pack_size: packSize,
  });
}
