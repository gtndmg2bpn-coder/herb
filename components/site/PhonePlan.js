// components/site/PhonePlan.js
// A phone showing an example week, built from real recipes and their real
// sized figures. It is labelled as an example; nothing on it is invented.
import { recipeImageUrl } from '../../lib/recipeImage';
import { formatCost } from '../../lib/recipeDisplay';

function Meal({ slot, recipe }) {
  const img = recipeImageUrl(recipe.image_id);
  return (
    <div className="s-phone-meal">
      <div className="s-phone-thumb" style={img ? { backgroundImage: `url('${img}')` } : undefined} />
      <div style={{ minWidth: 0 }}>
        <div className="s-phone-mealname">{recipe.name}</div>
        <div className="s-phone-meta s-num">{slot} · {recipe.protein_g}g protein · {formatCost(recipe.cost_gbp)}</div>
      </div>
    </div>
  );
}

export default function PhonePlan({ picks }) {
  if (!picks || picks.length < 5) return null;
  const days = [
    { name: 'Mon', meals: [['Lunch', picks[0]], ['Dinner', picks[1]]] },
    { name: 'Tue', meals: [['Lunch', picks[2]], ['Dinner', picks[3]]] },
  ];
  const shown = days.flatMap((d) => d.meals.map(([, r]) => r)).concat([picks[4]]);
  const protein = shown.reduce((s, r) => s + (r.protein_g || 0), 0);
  const cost = shown.reduce((s, r) => s + (r.cost_gbp || 0), 0);
  return (
    <div className="s-phone" aria-label="Example of a Herb plan on a phone">
      <div className="s-phone-inner">
        <div className="s-phone-top">
          <span className="s-phone-title">Your week</span>
          <span className="s-chip">80 kg · losing</span>
        </div>
        {days.map((d) => (
          <div className="s-phone-day" key={d.name}>
            <div className="s-phone-dayname"><span>{d.name}</span></div>
            {d.meals.map(([slot, r]) => <Meal key={slot} slot={slot} recipe={r} />)}
          </div>
        ))}
        <div className="s-phone-day">
          <div className="s-phone-dayname"><span>Wed</span></div>
          <Meal slot="Lunch" recipe={picks[4]} />
          <div className="s-phone-out">
            <b>Dinner: out with friends.</b> No problem. Thursday and Friday are rebalanced so the week still lands.
          </div>
        </div>
        <div className="s-phone-foot s-num">
          <div><span className="s-small">Protein so far</span><b>{protein}g</b></div>
          <div style={{ textAlign: 'right' }}><span className="s-small">Spent so far</span><b>{formatCost(cost)}</b></div>
        </div>
      </div>
    </div>
  );
}
