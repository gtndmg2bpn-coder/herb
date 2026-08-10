import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

// Public base for images in the `recipe-images` bucket — same env var the
// Supabase client uses, so it always points at the right project.
const IMAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-images`;

// Read an amount off a recipe_ingredients row without assuming its exact
// column name (schema not confirmed here — falls through likely candidates).
function readAmount(row) {
  const a = row.quantity ?? row.amount ?? row.qty ?? row.grams ?? row.weight_g ?? null;
  const u = row.unit ?? row.units ?? '';
  if (a == null) return '';
  return `${a}${u}`;
}

export default async function RecipeDetail({ params }) {
  const { id } = params;
  const supabase = getSupabase();

  // 1) Recipe row. select('*') so it can't error on a column that isn't there.
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (recipeError || !recipe) {
    notFound();
  }

  // 2) Live cost from recipe_costs. maybeSingle → null instead of throwing.
  const { data: costRow } = await supabase
    .from('recipe_costs')
    .select('cost_gbp')
    .eq('recipe_id', id)
    .maybeSingle();
  const cost = costRow?.cost_gbp ?? null;

  // 3) Ingredients from recipe_ingredients, joined to ingredient names.
  //    Wrapped so that if the join/columns differ, the page still renders
  //    everything above rather than failing.
  let ingredients = [];
  let ingredientsReadable = true;
  try {
    const { data, error } = await supabase
      .from('recipe_ingredients')
      .select('*, ingredients(name)')
      .eq('recipe_id', id);
    if (error) throw error;
    ingredients = data || [];
  } catch {
    ingredientsReadable = false;
  }

  // Only show a macro tile for fields that actually exist and carry a value.
  const tiles = [
    { key: 'kcal', label: 'kcal', value:
