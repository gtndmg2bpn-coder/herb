import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase';
import { recipeImageUrl } from '../../../lib/recipeImage';
import RecipeActions, { MeasureUnitsProvider, Qty } from './RecipeActions';

export const dynamic = 'force-dynamic';

// Editorial reskin bolted onto the REAL data model (not the mockup's).
// Queries, field names, island props and helper import all match the graded
// working page — only the visual layer is new.

const ALLERGEN_LABELS = {
  milk: 'Milk', eggs: 'Egg', fish: 'Fish', crustaceans: 'Crustaceans',
  molluscs: 'Molluscs', tree_nuts: 'Tree nuts', peanuts: 'Peanuts',
  sesame: 'Sesame', soybeans: 'Soya', gluten: 'Gluten', celery: 'Celery',
  mustard: 'Mustard', sulphites: 'Sulphites', lupin: 'Lupin',
};
function labelAllergens(codes) {
  return (codes || []).map((c) => ALLERGEN_LABELS[c] || c).join(', ');
}

function methodLines(method) {
  if (!method) return [];
  return method.split('\n').map((l) => l.trim()).filter(Boolean);
}

export default async function RecipeDetailPage({ params }) {
  const { id } = params;
  const supabase = getSupabase();

  // Recipe (real: select *)
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (recipeError || !recipe) notFound();

  // Cost (real: separate recipe_costs table, cost_gbp)
  const { data: costRow } = await supabase
    .from('recipe_costs')
    .select('cost_gbp')
    .eq('recipe_id', id)
    .maybeSingle();
  const cost = costRow?.cost_gbp ?? null;

  // Allergens (real: recipe_allergens.contains / may_contain)
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

  // Ingredients (real: recipe_ingredients.quantity + ingredient_id, join ingredients for name/unit)
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
      (ingRows || []).forEach((i) => { ingMap[i.id] = i; });
    }
    ingredients = (riRows || []).map((r) => ({
      ingredientId: r.ingredient_id,
      name: ingMap[r.ingredient_id]?.name || 'Unknown ingredient',
      quantity: r.quantity,
      unit: ingMap[r.ingredient_id]?.unit || null,
    }));
  } catch {
    ingredientsReadable = false;
  }
  // Island gets serialisable data only — no per-user reads on the server.
  const islandIngredients = ingredients.filter((ing) => ing.ingredientId);

  const steps = methodLines(recipe.method);
  const imageUrl = recipeImageUrl(recipe.image_id);

  // Related (real fields only; fetch their costs in one follow-up query)
  const { data: relatedRows } = await supabase
    .from('recipes')
    .select('id, name, kcal, image_id, section')
    .neq('id', id)
    .limit(3);
  const related = relatedRows || [];
  const relCostMap = {};
  if (related.length) {
    const { data: relCosts } = await supabase
      .from('recipe_costs')
      .select('recipe_id, cost_gbp')
      .in('recipe_id', related.map((r) => r.id));
    (relCosts || []).forEach((c) => { relCostMap[c.recipe_id] = c.cost_gbp; });
  }

  const macros = [
    { label: 'Protein', value: `${recipe.protein_g ?? 0}g`, pct: Math.min(100, ((recipe.protein_g ?? 0) / 50) * 100), color: '#E7A6B5' },
    { label: 'Fat', value: `${recipe.fat_g ?? 0}g`, pct: Math.min(100, ((recipe.fat_g ?? 0) / 50) * 100), color: '#8FBBD6' },
    { label: 'Net carbs', value: `${recipe.carbs_g ?? 0}g`, pct: Math.min(100, ((recipe.carbs_g ?? 0) / 50) * 100), color: '#E9C067' },
    { label: 'Fibre', value: `${recipe.fibre_g ?? 0}g`, pct: Math.min(100, ((recipe.fibre_g ?? 0) / 15) * 100), color: '#C8E6C9' },
  ];

  const cell = { textAlign: 'center', borderRight: '1px solid #E7DFD4' };
  const cellLast = { textAlign: 'center' };
  const bigNum = { display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' };
  const capLabel = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 };
  const h2 = { fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', margin: '0 0 18px' };

  return (
    <MeasureUnitsProvider>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', color: '#2A2932', lineHeight: 1.5, WebkitFontSmoothing: 'antialiased' }}>

        {/* Back link */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '24px 0 0' }}>
          <Link href="/" style={{ fontSize: 13, fontWeight: 600, color: '#5B5966', textDecoration: 'none' }}>← Back to recipe book</Link>
          <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: '#5B5966', textDecoration: 'none' }}>Dashboard →</Link>
        </div>

        {/* Header */}
        <header style={{ padding: '24px 0 10px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 40, alignItems: 'start' }}>
          {/* Hero image */}
          <div style={{
            height: 420, borderRadius: 24,
            background: imageUrl ? `url(${imageUrl}) center/cover` : 'linear-gradient(155deg,#F1E7D5,#F7F0E2)',
            position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 20, boxSizing: 'border-box',
          }}>
            {recipe.section && (
              <span style={{ background: 'rgba(255,255,255,.85)', borderRadius: 100, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', padding: '6px 12px', textTransform: 'uppercase', color: '#2A2932' }}>
                {recipe.section}
              </span>
            )}
          </div>

          {/* Info */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8FBBD6', marginBottom: 12 }}>
              {recipe.section || 'Recipe'}
            </div>
            <h1 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.5vw,44px)', letterSpacing: '-.03em', lineHeight: 1.05, margin: 0 }}>
              {recipe.name}
            </h1>
            <p style={{ fontSize: 14, color: '#5B5966', marginTop: 10 }}>
              Per portion{recipe.portions ? ` · makes ${recipe.portions}` : ''}
            </p>
            {recipe.description && (
              <p style={{ fontSize: 15, color: '#5B5966', marginTop: 10, lineHeight: 1.6 }}>{recipe.description}</p>
            )}

            {/* Stats strip — all real fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginTop: 26, background: '#fff', border: '1px solid #E7DFD4', borderRadius: 16, padding: '16px 0' }}>
              <div style={cell}>
                <b style={bigNum}>{cost != null ? `£${Number(cost).toFixed(2)}` : '—'}</b>
                <span style={capLabel}>Cost</span>
              </div>
              <div style={cell}>
                <b style={bigNum}>{recipe.kcal ?? '—'}</b>
                <span style={capLabel}>kcal</span>
              </div>
              <div style={cell}>
                <b style={bigNum}>{recipe.protein_g ?? '—'}g</b>
                <span style={capLabel}>Protein</span>
              </div>
              <div style={cellLast}>
                <b style={bigNum}>{recipe.carbs_g ?? '—'}g</b>
                <span style={capLabel}>Net carbs</span>
              </div>
            </div>

            {/* Client island: pantry-match banner + actions — real props */}
            <RecipeActions recipeId={id} ingredients={islandIngredients} />
          </div>
        </header>

        {/* Ingredients & Method */}
        <section style={{ padding: '60px 0 10px', display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 48 }}>
          <div>
            <h2 style={h2}>
              Ingredients{' '}
              {recipe.portions ? <span style={{ fontSize: 14, fontWeight: 600, color: '#5B5966' }}>· makes {recipe.portions}</span> : null}
            </h2>
            {ingredientsReadable ? (
              ingredients.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {ingredients.map((ing, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #E7DFD4', fontSize: 14 }}>
                      <span>{ing.name}</span>
                      <span style={{ color: '#5B5966', fontWeight: 600 }}><Qty quantity={ing.quantity} unit={ing.unit} /></span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#5B5966' }}>No ingredients listed.</p>
              )
            ) : (
              <p style={{ color: '#5B5966' }}>Ingredient list not available yet.</p>
            )}
          </div>

          <div>
            <h2 style={h2}>Method</h2>
            {steps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {(() => {
                  let n = 0;
                  return steps.map((line, i) => {
                    const isTip = line.startsWith('💡');
                    if (isTip) {
                      return (
                        <div key={i} style={{ padding: '12px 16px', borderRadius: 12, background: '#f3efe6', fontStyle: 'italic', color: '#6f6552', fontSize: 14, lineHeight: 1.6 }}>
                          {line}
                        </div>
                      );
                    }
                    n += 1;
                    return (
                      <div key={i} style={{ display: 'flex', gap: 16 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2A2932', color: '#FBF7F1', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
                        <p style={{ fontSize: 15, color: '#2A2932', margin: 0, lineHeight: 1.6, paddingTop: 3 }}>{line}</p>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <p style={{ color: '#5B5966' }}>Method coming soon.</p>
            )}
          </div>
        </section>

        {/* Per-portion macro bars */}
        <section style={{ padding: '40px 0 10px' }}>
          <h2 style={h2}>Per portion</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
            {macros.map((bar, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  <span>{bar.label}</span>
                  <span style={{ color: '#5B5966' }}>{bar.value}</span>
                </div>
                <div style={{ height: 8, borderRadius: 100, background: '#E7DFD4', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${bar.pct}%`, background: bar.color, borderRadius: 100 }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Allergens (real: recipe_allergens) */}
        {(contains.length > 0 || mayContain.length > 0) && (
          <section style={{ padding: '20px 0 10px' }}>
            <div style={{ padding: '14px 16px', borderRadius: 14, background: '#faf6ef', border: '1px solid #ece3d3', maxWidth: 520 }}>
              {contains.length > 0 && (
                <p style={{ margin: 0, fontSize: 14 }}><strong>Contains:</strong> {labelAllergens(contains)}</p>
              )}
              {mayContain.length > 0 && (
                <p style={{ margin: contains.length ? '6px 0 0' : 0, fontSize: 13, color: '#8a7f6d' }}>May contain (check the label): {labelAllergens(mayContain)}</p>
              )}
            </div>
          </section>
        )}

        {/* Related */}
        {related.length > 0 && (
          <section style={{ padding: '50px 0 40px' }}>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(24px,3.5vw,32px)', letterSpacing: '-.03em', margin: '0 0 24px' }}>You might also like</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
              {related.map((r) => {
                const relImage = recipeImageUrl(r.image_id);
                const relCost = relCostMap[r.id];
                return (
                  <a key={r.id} href={`/recipe/${r.id}`} style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', padding: 14, boxSizing: 'border-box', background: relImage ? `url(${relImage}) center/cover` : 'linear-gradient(155deg,#F1E7D5,#F7F0E2)' }}>
                      {r.section && (
                        <span style={{ background: 'rgba(255,255,255,.85)', borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', padding: '5px 10px', textTransform: 'uppercase', color: '#2A2932' }}>{r.section}</span>
                      )}
                    </div>
                    <div style={{ padding: 18 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{r.name}</h3>
                      <div style={{ fontSize: 13, color: '#5B5966', marginTop: 6 }}>
                        {relCost != null ? `£${Number(relCost).toFixed(2)} · ` : ''}{r.kcal ?? '—'} kcal
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </MeasureUnitsProvider>
  );
}
