// lib/publicRecipes.js
//
// The ONE place the public site gets its recipe figures from.
//
// Every number a visitor sees (card, recipe page, "you might also like", dish of
// the week) comes from the database function recipe_reference(), called with the
// reference adult's factor from lib/referenceAdult.js. Before this, three parts of
// the site each worked the figures out their own way and disagreed with each other.
//
// recipe_reference() sizes each line first (flavour lines fixed, counted items in
// whole units, everything else scaled) and adds up macros and cost from those
// sized lines, so the ingredient list and the totals always agree.
import { REFERENCE_FACTOR } from './referenceAdult';
// Display rules (labels, shop window, method steps) live in lib/recipeDisplay.js.

// Recipes joined to their reference figures. Recipes with incomplete data keep
// null figures (shown as "—"), never a made-up number.
export async function loadPublicRecipes(supabase, { recipeId = null } = {}) {
  let q = supabase.from('recipes').select('id, name, section, image_id, method, portions, freezes, prep_time_min, cook_time_min, fresh_shelf_days, batch_portions').order('name');
  if (recipeId) q = q.eq('id', recipeId);
  const [{ data: rows, error }, { data: figures, error: figErr }] = await Promise.all([
    q,
    supabase.rpc('recipe_reference', { p_factor: REFERENCE_FACTOR, p_recipe_id: recipeId }),
  ]);
  if (error) throw error;
  if (figErr) throw figErr;
  const byId = Object.fromEntries((figures || []).map((f) => [f.recipe_id, f]));
  return (rows || []).map((r) => {
    const f = byId[r.id] || {};
    return {
      ...r,
      kcal: f.kcal ?? null,
      protein_g: f.protein_g ?? null,
      carbs_g: f.carbs_g != null ? Number(f.carbs_g) : null,
      fat_g: f.fat_g != null ? Number(f.fat_g) : null,
      fibre_g: f.fibre_g != null ? Number(f.fibre_g) : null,
      cost_gbp: f.cost_gbp != null ? Number(f.cost_gbp) : null,
    };
  });
}

export async function loadRecipeLines(supabase, recipeId) {
  const { data, error } = await supabase.rpc('recipe_reference_lines', { p_factor: REFERENCE_FACTOR, p_recipe_id: recipeId });
  if (error) throw error;
  return (data || []).map((l) => ({
    ingredientId: l.ingredient_id,
    name: l.name,
    unit: l.unit,
    gramsPerItem: l.grams_per_item,
    scaleMode: l.scale_mode,
    quantity: Number(l.quantity),
  }));
}

