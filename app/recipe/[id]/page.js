import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export default async function RecipeDetail({ params }) {
  const { id } = params;
  const supabase = getSupabase();

  // 1) Macros + cost — the proven path (recipe_macros view).
  const { data: macro, error: macroError } = await supabase
    .from('recipe_macros')
    .select('*')
    .eq('recipe_id', id)
    .single();

  if (macroError || !macro) {
    notFound();
  }

  // 2) Ingredients — from the composition table joined to food_item names.
  // If this can't be read (e.g. table grant not in place yet), the page
  // still shows the macros above rather than failing.
  let ingredients = [];
  let ingredientsReadable = true;
  try {
    const { data, error } = await supabase
      .from('composition')
      .select('amount, unit, food_item:component_id(name)')
      .eq('parent_id', id);
    if (error) throw error;
    ingredients = data || [];
  } catch {
    ingredientsReadable = false;
  }

  const hasCost =
    macro.cost_per_portion_gbp !== null &&
    macro.cost_per_portion_gbp !== undefined &&
    macro.ingredients_missing_price === 0;

  return (
    <main className="wrap">
      <Link href="/" className="back">
        &larr; All recipes
      </Link>

      <h1 className="detail-title">{macro.recipe}</h1>
      <p className="detail-sub">
        Per portion{macro.portions ? ` · makes ${macro.portions}` : ''}
      </p>

      <div className="macros">
        <div className="macro">
          <div className="v">{macro.kcal_per_portion}</div>
          <div className="l">kcal</div>
        </div>
        <div className="macro">
          <div className="v">{macro.protein_per_portion}g</div>
          <div className="l">Protein</div>
        </div>
        <div className="macro">
          <div className="v">{macro.net_carbs_per_portion}g</div>
          <div className="l">Net carbs</div>
        </div>
        <div className="macro">
          <div className="v">{macro.fat_per_portion}g</div>
          <div className="l">Fat</div>
        </div>
        <div className="macro">
          <div className="v">{macro.fibre_per_portion}g</div>
          <div className="l">Fibre</div>
        </div>
        <div className="macro cost">
          <div className="v">
            {hasCost ? `£${Number(macro.cost_per_portion_gbp).toFixed(2)}` : '—'}
          </div>
          <div className="l">Cost</div>
        </div>
      </div>

      <p className="section-label">Ingredients</p>
      {ingredientsReadable ? (
        ingredients.length > 0 ? (
          <ul className="ingredients">
            {ingredients.map((ing, i) => (
              <li key={i}>
                <span>{ing.food_item?.name || 'Unknown ingredient'}</span>
                <span className="amt">
                  {ing.amount}
                  {ing.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="detail-sub">No ingredients listed.</p>
        )
      ) : (
        <p className="detail-sub">
          Ingredient list not available yet.
        </p>
      )}

      {!hasCost && (
        <div className="note">
          Cost is hidden until every ingredient in this recipe has a price.
          {typeof macro.ingredients_missing_price === 'number' &&
            macro.ingredients_missing_price > 0 &&
            ` ${macro.ingredients_missing_price} still need one.`}
        </div>
      )}
    </main>
  );
}
