import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase';
import { recipeImageUrl } from '../../../lib/recipeImage';
import { loadPublicRecipes, loadRecipeLines } from '../../../lib/publicRecipes';
import { sectionLabel, methodSteps, formatCost, proteinPer100Kcal } from '../../../lib/recipeDisplay';
import { REFERENCE_LABEL } from '../../../lib/referenceAdult';
import RecipeActions, { MeasureUnitsProvider, Qty } from './RecipeActions';
import RecipeCard from '../../../components/site/RecipeCard';
import SiteFooter from '../../../components/site/SiteFooter';

export const dynamic = 'force-dynamic';

// Every figure on this page (the four stats, the ingredient amounts, the macro
// bars and the related cards) comes from recipe_reference / recipe_reference_lines
// via lib/publicRecipes.js: the same calculation the homepage and recipe book use.

const ALLERGEN_LABELS = {
  milk: 'Milk', eggs: 'Egg', fish: 'Fish', crustaceans: 'Crustaceans',
  molluscs: 'Molluscs', tree_nuts: 'Tree nuts', peanuts: 'Peanuts',
  sesame: 'Sesame', soybeans: 'Soya', gluten: 'Gluten', celery: 'Celery',
  mustard: 'Mustard', sulphites: 'Sulphites', lupin: 'Lupin',
};
function labelAllergens(codes) {
  return (codes || []).map((c) => ALLERGEN_LABELS[c] || c).join(', ');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keep, freeze and batch facts come from the recipe row (Karum's cook rules per
// dish). Prep and cook times are shown only when a value exists: Chef Herb's times
// are estimates until the dish has been cooked, and the 55 live recipes carry no
// times yet (8 Nov 2026). Nothing here is invented to fill a gap.
function RecipeFacts({ recipe }) {
  const facts = [];
  const prep = Number(recipe.prep_time_min);
  const cook = Number(recipe.cook_time_min);
  if (prep > 0) facts.push({ k: 'Prep', v: `${prep} min` });
  if (cook > 0) facts.push({ k: 'Cook', v: `${cook} min` });
  const keep = Number(recipe.fresh_shelf_days);
  if (keep > 0) facts.push({ k: 'Keeps', v: keep === 1 ? 'Eat the same day' : `${keep} days in the fridge` });
  facts.push({ k: 'Freezer', v: recipe.freezes ? 'Freezes well' : 'Best fresh' });
  const batch = Number(recipe.batch_portions);
  if (batch > 1) facts.push({ k: 'Batch', v: `Cook ${batch} portions at once` });
  if (facts.length === 0) return null;
  return (
    <dl className="s-facts">
      {facts.map((f) => (
        <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>
      ))}
    </dl>
  );
}

export async function generateMetadata({ params }) {
  if (!UUID.test(params.id)) return { title: 'Recipe · HERB' };
  try {
    const { data } = await getSupabase().from('recipes').select('name').eq('id', params.id).maybeSingle();
    return { title: data?.name ? `${data.name} · HERB` : 'Recipe · HERB' };
  } catch {
    return { title: 'Recipe · HERB' };
  }
}

export default async function RecipeDetailPage({ params }) {
  const { id } = params;
  if (!UUID.test(id)) notFound();
  const supabase = getSupabase();

  let all = [];
  try {
    all = await loadPublicRecipes(supabase);
  } catch {
    all = [];
  }
  const recipe = all.find((r) => r.id === id);
  if (!recipe) notFound();

  let ingredients = [];
  let ingredientsReadable = true;
  try {
    ingredients = await loadRecipeLines(supabase, id);
    ingredients.sort((a, b) => (a.scaleMode === 'FIXED') - (b.scaleMode === 'FIXED') || b.quantity - a.quantity);
  } catch {
    ingredientsReadable = false;
  }

  // Allergens. The view says whether every ingredient in the dish has had its
  // allergens checked (allergen_complete). Until it has, an empty list means
  // "not checked yet", never "allergen-free", and the page must say so. On
  // 8 Nov 2026 no live recipe was complete, so this wording is what visitors see.
  let contains = [];
  let mayContain = [];
  let allergenComplete = false;
  let allergenKnown = false;
  try {
    const { data: allergenRow } = await supabase
      .from('recipe_allergens')
      .select('contains, may_contain, allergen_complete')
      .eq('recipe_id', id)
      .maybeSingle();
    if (allergenRow) {
      allergenKnown = true;
      contains = allergenRow.contains ?? [];
      mayContain = (allergenRow.may_contain ?? []).filter((c) => !contains.includes(c));
      allergenComplete = allergenRow.allergen_complete === true;
    }
  } catch {}

  const steps = methodSteps(recipe.method);
  const imageUrl = recipeImageUrl(recipe.image_id);
  const hasFixed = ingredients.some((i) => i.scaleMode === 'FIXED');

  // Related: same section first, then the rest, best protein per calorie first.
  const related = all
    .filter((r) => r.id !== id && r.kcal != null)
    .sort((a, b) => (b.section === recipe.section) - (a.section === recipe.section) || proteinPer100Kcal(b) - proteinPer100Kcal(a))
    .slice(0, 3);

  const macros = [
    { label: 'Protein', g: recipe.protein_g, scale: 60, color: 'var(--pink)' },
    { label: 'Fat', g: recipe.fat_g, scale: 60, color: 'var(--blue)' },
    { label: 'Carbs', g: recipe.carbs_g, scale: 30, color: '#E9C067' },
    { label: 'Fibre', g: recipe.fibre_g, scale: 15, color: '#9CC5A1' },
  ].filter((m) => m.g != null);

  return (
    <MeasureUnitsProvider>
      <main className="s-wrap">
        <nav className="s-crumbs" aria-label="Breadcrumb">
          <Link href="/recipes">Recipes</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/recipes?section=${encodeURIComponent(recipe.section || '')}`}>{sectionLabel(recipe.section)}</Link>
        </nav>

        <header className="s-recipe-head">
          <div className="s-recipe-img" role="img" aria-label={recipe.name} style={imageUrl ? { backgroundImage: `url('${imageUrl}')` } : undefined} />
          <div>
            <p className="s-eyebrow" style={{ marginBottom: 10 }}>{sectionLabel(recipe.section)}</p>
            <h1 className="s-recipe-title s-serif">{recipe.name}</h1>
            <div className="s-stats4">
              <div><b>{recipe.protein_g ?? '—'}g</b><span>Protein</span></div>
              <div><b>{recipe.kcal ?? '—'}</b><span>kcal</span></div>
              <div><b>{recipe.carbs_g ?? '—'}g</b><span>Carbs</span></div>
              <div><b>{formatCost(recipe.cost_gbp)}</b><span>Cost</span></div>
            </div>
            <div className="s-sized">
              <span className="s-chip" style={{ flex: '0 0 auto' }}>Per portion</span>
              <span>{REFERENCE_LABEL}. <Link href="/signup" className="s-link" style={{ fontWeight: 600 }}>Sign up</Link> and Herb sizes it to you. Cost leaves out salt, pepper, herbs, spices, oil, garlic and stock: those come out of your monthly pantry allowance.</span>
            </div>
            <RecipeFacts recipe={recipe} />
            <RecipeActions recipeId={id} ingredients={ingredients.filter((i) => i.ingredientId)} />
          </div>
        </header>

        <section className="s-recipe-body">
          <div>
            <h2 className="s-h3" style={{ fontSize: 22, marginBottom: 8 }}>Ingredients</h2>
            {ingredientsReadable ? (
              ingredients.length > 0 ? (
                <>
                  <div>
                    {ingredients.map((ing) => (
                      <div className="s-ing-row" key={`${ing.ingredientId}-${ing.quantity}`}>
                        <span>{ing.name}{ing.scaleMode === 'FIXED' ? <span aria-hidden="true" style={{ color: 'var(--muted)' }}> *</span> : null}</span>
                        <span><Qty quantity={ing.quantity} unit={ing.unit} gramsPerItem={ing.gramsPerItem} name={ing.name} /></span>
                      </div>
                    ))}
                  </div>
                  {hasFixed ? <p className="s-ing-fixed">* Flavour: the same amount whoever is eating. Season to taste.</p> : null}
                </>
              ) : (
                <p className="s-body">No ingredients listed yet.</p>
              )
            ) : (
              <p className="s-body">The ingredient list couldn&rsquo;t be loaded. Try refreshing the page.</p>
            )}

            <h2 className="s-h3" style={{ fontSize: 22, margin: '36px 0 8px' }}>Per portion</h2>
            <div className="s-macros">
              {macros.map((m) => (
                <div key={m.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
                    <span>{m.label}</span><span className="s-num" style={{ color: 'var(--muted)' }}>{m.g}g</span>
                  </div>
                  <div className="s-bar"><div style={{ width: `${Math.min(100, (Number(m.g) / m.scale) * 100)}%`, background: m.color }} /></div>
                </div>
              ))}
            </div>

            <div className="s-allergens">
              <p className="s-allergens-title">Allergens</p>
              {allergenKnown && allergenComplete ? (
                <p>
                  {contains.length > 0 ? <><strong>Contains:</strong> {labelAllergens(contains)}.</> : <>None of the UK&rsquo;s 14 listed allergens in the recipe as written.</>}
                </p>
              ) : (
                <p>
                  {contains.length > 0 ? <><strong>Contains at least:</strong> {labelAllergens(contains)}. </> : null}
                  The allergen check for this recipe isn&rsquo;t finished yet, so this list may be incomplete.
                </p>
              )}
              {mayContain.length > 0 ? (
                <p className="s-allergens-may">May contain, depending on the brand you buy: {labelAllergens(mayContain)}.</p>
              ) : null}
              <p className="s-allergens-may">Always check the label on what you buy. Brands and recipes change.</p>
            </div>
          </div>

          <div>
            <h2 className="s-h3" style={{ fontSize: 22, marginBottom: 18 }}>Method</h2>
            {steps.length > 0 ? (
              <div className="s-method">
                {steps.map((line, i) =>
                  line.startsWith('💡') ? (
                    <div key={i} className="s-method-tip">{line}</div>
                  ) : (
                    <div key={i} className="s-method-step"><span>{line}</span></div>
                  )
                )}
              </div>
            ) : (
              <p className="s-body">Method coming soon.</p>
            )}
          </div>
        </section>

        {related.length > 0 ? (
          <section className="s-section-tight" style={{ paddingTop: 56 }}>
            <div className="s-head-row">
              <h2 className="s-h2" style={{ fontSize: 'clamp(24px,4vw,32px)' }}>You might also like</h2>
              <Link href="/recipes" className="s-link">All recipes</Link>
            </div>
            <div className="s-cards">
              {related.map((r) => <RecipeCard key={r.id} recipe={r} />)}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </MeasureUnitsProvider>
  );
}
