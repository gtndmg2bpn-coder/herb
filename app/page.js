import Link from 'next/link';
import { getSupabase } from '../lib/supabase';

// Always fetch fresh from Supabase on each request. This also keeps the
// free-tier project warm (any query resets the 7-day pause timer).
export const dynamic = 'force-dynamic';

// Public base for images in the `recipe-images` bucket. Built from the same
// env var the Supabase client uses, so it always points at the right project.
const IMAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-images`;

export default async function Home() {
  let recipes = [];
  let errorMessage = null;
  try {
    const supabase = getSupabase();
    // 1) recipes: name, macros, section, plus image_id for the picture
    const { data: recipeRows, error: recipeErr } = await supabase
      .from('recipes')
      .select('id, name, section, kcal, protein_g, carbs_g, image_id')
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
        {/* KIMI NOTE: static front-door links only. The homepage stays a server component
            and cannot know the browser session, so Log in / Sign up always render. */}
        <nav style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
        </nav>
      </div>
      {errorMessage ? (
        <div className="error">
          Couldn&rsquo;t load recipes. {errorMessage}
        </div>
      ) : (
        <div className="list">
          {recipes.map((r) => (
            <Link
              key={r.id}
              href={`/recipe/${r.id}`}
              className="row"
              style={{ display: 'block' }}
            >
              {r.image_id && (
                <img
                  src={`${IMAGE_BASE}/${r.image_id}.jpg`}
                  alt={r.name}
                  loading="lazy"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '200px',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    marginBottom: '10px',
                    background: '#ece7df',
                  }}
                />
              )}
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
