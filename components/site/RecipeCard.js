// components/site/RecipeCard.js
// The one recipe card on the public site. Figures come in already sized
// (lib/publicRecipes.js) — this component never does arithmetic.
import Link from 'next/link';
import { recipeImageUrl } from '../../lib/recipeImage';
import { sectionLabel, formatCost } from '../../lib/recipeDisplay';

export default function RecipeCard({ recipe }) {
  const img = recipeImageUrl(recipe.image_id);
  return (
    <Link href={`/recipe/${recipe.id}`} className="s-card">
      <div className="s-card-img" style={img ? { backgroundImage: `url('${img}')` } : undefined}>
        <span className="s-card-tag">{sectionLabel(recipe.section)}</span>
      </div>
      <div className="s-card-body">
        <h3 className="s-card-name s-serif">{recipe.name}</h3>
        <div className="s-card-statrow">
          <div className="s-card-stats">
            <div className="s-card-stat"><b>{recipe.protein_g ?? '—'}g</b><span>Protein</span></div>
            <div className="s-card-stat"><b>{recipe.kcal ?? '—'}</b><span>kcal</span></div>
            <div className="s-card-stat"><b>{formatCost(recipe.cost_gbp)}</b><span>Per portion</span></div>
          </div>
        </div>
      </div>
    </Link>
  );
}
