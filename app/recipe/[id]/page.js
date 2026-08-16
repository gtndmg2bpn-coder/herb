import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

const IMAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-images`;

const ALLERGEN_LABELS = {
  milk: 'Milk', eggs: 'Egg', fish: 'Fish', crustaceans: 'Crustaceans',
  molluscs: 'Molluscs', tree_nuts: 'Tree nuts', peanuts: 'Peanuts',
  sesame: 'Sesame', soybeans: 'Soya', gluten: 'Gluten', celery: 'Celery',
  mustard: 'Mustard', sulphites: 'Sulphites', lupin: 'Lupin',
};
function labelAllergens(codes) {
  return (codes || []).map((c) => ALLERGEN_LABELS[c] || c).join(', ');
}

function formatAmount(quantity, unit) {
  if (quantity == null) return '';
  const u = unit || '';
  return u.length <= 2 ? `${quantity}${u}` : `${quantity} ${u}`;
}

// Split the stored method text into individual lines for display.
function methodLines(method) {
  if (!method) return [];
  return method.split('\n').map((l) => l.trim()).filter(Boolean);
}

export default async function RecipeDetail({ params }) {
  const { id } = params;
  const supabase = getSupabase();

  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (recipeError || !recipe) {
    notFound();
  }

  const { data: costRow } = await supabase
    .from('recipe_costs')
    .select('cost_gbp')
    .eq('recipe_id', id)
    .maybeSingle();
  const cost = costRow?.cost_gbp ?? null;

  let contains = [];
  let mayContain = [];
  try {
    const { data: allergenRow } = await supabase
      .from('recipe_allergens')
      .select('contains, may_contain')
      .eq('recipe_id', id)
      .maybeSingle();
    contains = allergenRow?.contains ?? [];
    mayContain = allergenRow?.may_contain ?? [];
  } catch {}
  mayContain = mayContain.filter((c) => !contains.includes(c));

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

  const steps = methodLines(recipe.method);

  const tiles = [
    { key: 'kcal', label: 'kcal', value: recipe.kcal, suffix: '' },
    { key: 'protein_g', label: 'Protein', value: recipe.protein_g, suffix: 'g' },
    { key: 'carbs_g', label: 'Net carbs', value: recipe.carbs_g, suffix: 'g' },
    { key: 'fat_g', label: 'Fat', value: recipe.fat_g, suffix: 'g' },
    { key: 'fibre_g', label: 'Fibre', value: recipe.fibre_g, suffix: 'g' },
  ].filter((t) => t.value !== null && t.value !== undefined);

  return (
    <main className="wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Link href="/" className="back">
          &larr; All recipes
        </Link>
        <Link href="/dashboard" className="back">
          Dashboard &rarr;
        </Link>
      </div>

      {recipe.image_id && (
        <img
          src={`${IMAGE_BASE}/${recipe.image_id}.jpg`}
          alt={recipe.name}
          style={{
            display: 'block', width: '100%', height: '280px', objectFit: 'cover',
            borderRadius: '14px', margin: '14px 0', background: '#ece7df',
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
            <div className="v">{t.value}{t.suffix}</div>
            <div className="l">{t.label}</div>
          </div>
        ))}
        <div className="macro cost">
          <div className="v">{cost != null ? `£${Number(cost).toFixed(2)}` : '—'}</div>
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

      {steps.length > 0 && (
        <>
          <p className="section-label">Method</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {steps.map((line, i) => {
              const isTip = line.startsWith('💡');
              return (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    lineHeight: 1.5,
                    ...(isTip
                      ? {
                          marginTop: '6px',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          background: '#f3efe6',
                          fontStyle: 'italic',
                          color: '#6f6552',
                        }
                      : {}),
                  }}
                >
                  {line}
                </p>
              );
            })}
          </div>
        </>
      )}

      {(contains.length > 0 || mayContain.length > 0) && (
        <div
          style={{
            margin: '18px 0 4px', padding: '12px 14px', borderRadius: '12px',
            background: '#faf6ef', border: '1px solid #ece3d3',
          }}
        >
          {contains.length > 0 && (
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              <strong>Contains:</strong> {labelAllergens(contains)}
            </p>
          )}
          {mayContain.length > 0 && (
            <p style={{ margin: contains.length ? '6px 0 0' : 0, fontSize: '0.85rem', color: '#8a7f6d' }}>
              May contain (check the label): {labelAllergens(mayContain)}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
