import Link from 'next/link';
import { getSupabase } from '../lib/supabase';

// Always fetch fresh from Supabase on each request. This also keeps the
// free-tier project warm (any query resets the 7-day pause timer).
export const dynamic = 'force-dynamic';

export default async function Home() {
  let recipes = [];
  let errorMessage = null;

  try {
    const supabase = getSupabase();

    // 1) recipes: name, macros, section (from tonight's schema)
    const { data: recipeRows, error: recipeErr } = await supabase
      .from('recipes')
      .select('id, name, section, kcal, protein_g, carbs_g')
      .order('name');
    if (recipeErr) throw recipeErr;

    // 2) live per-recipe cost from the recipe_costs view
    const { data: costRows, error: costErr } = await supabase
      .from('recipe_costs')
      .select('recipe_id, cost_gbp');
    if (costErr) throw costErr;

    // stitch cost onto each recipe by id
    const costById = {};
    (costRows || []).forEach((c) => {
      costById[c.recipe_id] = c.cost_gbp;
    });

    recipes = (recipeRows || []).map((r) => ({
      ...r,
      cost_gbp: costById[r.id] ?? null,
    }));
  } catch (err) {
    errorMessage = err.message;
  }

  return (
    <main className="wrap">
      <div className="masthead">
        <h1>HERB — Keto recipes</h1>
        <p>Per-portion macros and cost, rolled up live from the database.</p>
      </div>

      {errorMessage ? (
        <div className="error">
          Couldn&rsquo;t load recipes. {errorMessage}
        </div>
      ) : (
        <div className="list">
          {recipes.map((r) => (
            <Link key={r.id} href={`/recipe/${r.id}`} className="row">
              <span className="name">{r.name}</span>
              <span className="stats">
                {r.cost_gbp != null && (
                  <>
                    <b>&pound;{Number(r.cost_gbp).toFixed(2)}</b>&nbsp;&middot;&nbsp;
                  </>
                )}
                <b>{r.kcal}</b> kcal&nbsp;&middot;&nbsp;
                {r.protein_g}g protein&nbsp;&middot;&nbsp;
                {r.carbs_g}g net carbs
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
