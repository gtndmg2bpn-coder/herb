// app/recipes/page.js — the full recipe book.
import { getSupabase } from '../../lib/supabase';
import { loadPublicRecipes } from '../../lib/publicRecipes';
import { REFERENCE_LABEL } from '../../lib/referenceAdult';
import RecipeBrowser from './RecipeBrowser';
import SiteFooter from '../../components/site/SiteFooter';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recipes · HERB', description: 'Every Herb recipe, with protein, calories and cost per portion.' };

export default async function RecipesPage({ searchParams }) {
  let recipes = [];
  try {
    recipes = await loadPublicRecipes(getSupabase());
  } catch {
    recipes = [];
  }
  // The browser only needs what a card shows.
  const slim = recipes.map(({ id, name, section, image_id, kcal, protein_g, carbs_g, cost_gbp }) => ({ id, name, section, image_id, kcal, protein_g, carbs_g, cost_gbp }));
  return (
    <>
      <main className="s-wrap" style={{ paddingTop: 32, paddingBottom: 24 }}>
        <p className="s-eyebrow">The recipe book</p>
        <h1 className="s-h2">{recipes.length} recipes, every one costed.</h1>
        <p className="s-body" style={{ maxWidth: '62ch' }}>
          Figures are per portion, {REFERENCE_LABEL.toLowerCase()}. Sign up and Herb sizes every portion to you.
        </p>
        <RecipeBrowser recipes={slim} initialSection={typeof searchParams?.section === 'string' ? searchParams.section : 'all'} />
      </main>
      <SiteFooter />
    </>
  );
}
