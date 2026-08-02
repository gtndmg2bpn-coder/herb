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
    const { data, error } = await supabase
      .from('recipe_macros')
      .select(
        'recipe_id, recipe, kcal_per_portion, protein_per_portion, net_carbs_per_portion, cost_per_portion_gbp, ingredients_missing_price'
      )
      .order('recipe');

    if (error) throw error;
    recipes = data || [];
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
            <Link key={r.recipe_id} href={`/recipe/${r.recipe_id}`} className="row">
              <span className="name">{r.recipe}</span>
              <span className="stats">
                <b>{r.kcal_per_portion}</b> kcal&nbsp;&middot;&nbsp;
                {r.protein_per_portion}g protein&nbsp;&middot;&nbsp;
                {r.net_carbs_per_portion}g net carbs
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
