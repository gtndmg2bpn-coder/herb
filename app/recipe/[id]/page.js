import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

// Public base for images in the `recipe-images` bucket — same env var the
// Supabase client uses, so it always points at the right project.
const IMAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-images`;

// Attach the unit to the quantity. Short mass/volume units read best with no
// space (200g, 30ml); word units read best with one (2 tbsp, 3 clove).
function formatAmount(quantity, unit) {
  if (quantity == null) return '';
  const u = unit || '';
  return u.length <= 2 ? `${quantity}${u}` : `${quantity} ${u}`;
}

export default async function RecipeDetail({ params }) {
  const { id } = params;
  const supabase = getSupabase();

  // 1) Recipe row. select('*') so a column that isn't there can't error it —
  //    missing macro fields simply become undefined and get filtered out below.
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

  // 3) Ingredients — same fetch-and-stitch pattern as the list page.
  //    quantity lives on recipe_ingredients; name + unit live on ingredients.
  let ingredients = [];
  let ingredientsReadable = true;
  try {
    const { data: riRows, error: riErr } = await supabase
      .from('recipe_ingredients')
      .select('quantity, ingredient_id')
      .eq('recipe_id', id);
    if (riErr) throw riErr;

    const ids = (riRows || []).map((r) => r.ingredient_id);
    const ingMap = {};
    if (ids.length) {
      const { data: ingRows, error: ingErr } = await supabase
        .from('ingredients')
        .select('id, name, unit')
        .in('id', ids);
      if (ingErr) throw ingErr;
      (ingRows || []).forEach((i) => {
        ingMap[i.id] = i;
      });
    }

    ingredients = (riRows || []).map((r) => ({
      name: ingMap[r.ingredient_id]?.name || 'Unknown ingredient',
      amount: formatAmount(r.quantity, ingMap[r.ingredient_id]?.unit),
    }));
  } catch {
    ingredientsReadable = false;
  }

  // Show a macro tile only for fields that actually exist and carry a value.
  const tiles = [
    { key: 'kcal', label: 'kcal', value: recipe.kcal, suffix: '' },
    { key: 'protein_g', label: 'Protein', value: recipe.protein_g, suffix: 'g' },
    { key: 'carbs_g', label: 'Net carbs', value: recipe.carbs_g, suffix: 'g' },
    { key: 'fat_g', label: 'Fat', value: recipe.fat_g, suffix: 'g' },
    { key: 'fibre_g', label: 'Fibre', value: recipe.fibre_g, suffix: 'g' },
  ].filter((t) => t.value !== null && t.value !== undefined);

  return (
    <main className="wrap">
      <Link href="/" className="back">
        &larr; All recipes
      </Link>

      {recipe.image_id && (
        <img
          src={`${IMAGE_BASE}/${recipe.image_id}.jpg`}
          alt={recipe.name}
          style={{
            display: 'block',
            width: '100%',
            height: '280px',
            objectFit: 'cover',
            borderRadius: '14px',
            margin: '14px 0',
            background: '#ece7df',
          }}
        />
      )}

      <h1 className="detail-title">{recipe.name}</h1>
      <p className="detail-sub">
        Per portion{recipe.portions ? ` · makes ${recipe.portions}` : ''}
      </p>

      <div className="macros">
        {tiles.map((t) => (
          <div className="macro" key={t.key}>
            <div className="v">
              {t.value}
              {t.suffix}
            </div>
            <div className="l">{t.label}</div>
          </div>
        ))}
        <div className="macro cost">
          <div className="v">
            {cost != null ? `£${Number(cost).toFixed(2)}` : '—'}
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
                <span>{ing.name}</span>
                <span className="amt">{ing.amount}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="detail-sub">No ingredients listed.</p>
        )
      ) : (
        <p className="detail-sub">Ingredient list not available yet.</p>
      )}
    </main>
  );
}
