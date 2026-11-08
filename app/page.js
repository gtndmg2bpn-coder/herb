// app/page.js
// The homepage sells the product (a plan that sizes, costs and bends), not a
// database dump. The shop window is chosen by rule (lib/recipeDisplay.js:
// high protein, under 550 kcal, everyday cost), not by hand, and every figure
// comes from the one calculation in lib/publicRecipes.js.
import Link from 'next/link';
import { getSupabase } from '../lib/supabase';
import { loadPublicRecipes } from '../lib/publicRecipes';
import { pickShopWindow, dishOfTheWeek, formatCost } from '../lib/recipeDisplay';
import { recipeImageUrl } from '../lib/recipeImage';
import { REFERENCE_LABEL } from '../lib/referenceAdult';
import { FAQS, STEPS } from '../lib/siteCopy';
import RecipeCard from '../components/site/RecipeCard';
import PhonePlan from '../components/site/PhonePlan';
import SiteFooter from '../components/site/SiteFooter';

export const dynamic = 'force-dynamic';

const HACK_AWAY = ['Cottage pie', 'Steak & ale pie', 'Toad in the hole', 'Fish & chips', 'Chicken korma', 'Salt & pepper chicken', 'Sunday roast', 'Sticky toffee pudding'];

export default async function HomePage() {
  let recipes = [];
  try {
    recipes = await loadPublicRecipes(getSupabase());
  } catch {
    recipes = [];
  }
  const shopWindow = pickShopWindow(recipes, 6);
  const dish = dishOfTheWeek(shopWindow);
  const heroPhoto = recipeImageUrl(dish?.image_id) || '/assets/asian-sesame-chicken.jpg';

  return (
    <>
      <main>
        {/* Hero */}
        <section className="s-hero">
          <div className="s-wrap s-hero-grid">
            <div className="rise">
              <p className="s-eyebrow">The food platform that does the maths</p>
              <h1 className="s-h1">Eat <em className="s-serif">well</em>, even when life doesn&rsquo;t go to plan.</h1>
              <p className="s-lede">
                Herb plans a week of proper food sized to your weight, costs every portion to the penny and writes the shopping list.
                Eat out, work late, miss a meal: the plan rebalances. It doesn&rsquo;t start again on Monday.
              </p>
              <div className="s-btns">
                <Link href="/signup" className="s-btn s-btn-primary">Start free</Link>
                <Link href="/how-it-works" className="s-btn s-btn-secondary">See how it works</Link>
              </div>
              <div className="s-proof">
                <span><b className="s-num">{recipes.length || 55}</b> recipes, all costed</span>
                <span><b>Protein first</b>, carbs low</span>
                <span><b>Real UK prices</b>, in pence</span>
              </div>
            </div>
            <div className="s-hero-visual">
              <div className="s-hero-photo" style={{ backgroundImage: `url('${heroPhoto}')` }} />
              <PhonePlan picks={shopWindow} />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="s-section s-rule" id="how-it-works">
          <div className="s-wrap">
            <p className="s-eyebrow">How it works</p>
            <h2 className="s-h2" style={{ maxWidth: '18ch' }}>Takes the planning off your plate.</h2>
            <div className="s-steps">
              {STEPS.map((s, i) => (
                <div className="s-step" key={s.title}>
                  <div className="s-step-n">{i + 1}</div>
                  <h3 className="s-h3">{s.title}</h3>
                  <p className="s-body">{s.body}</p>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 28 }}><Link href="/how-it-works" className="s-link">More on how Herb works</Link></p>
          </div>
        </section>

        {/* £/lbs */}
        <section className="s-section s-rule">
          <div className="s-wrap">
            <p className="s-eyebrow">Money and weight, together</p>
            <h2 className="s-h2" style={{ maxWidth: '20ch' }}>Herb looks after the £/lbs.</h2>
            <p className="s-lede">Most apps count calories. Some help with the shopping. Herb keeps both in the same place, because they&rsquo;re the same decision.</p>
            <div className="s-split">
              <div className="s-panel s-panel-ink">
                <div className="s-big">£</div>
                <h3 className="s-h3" style={{ marginTop: 18 }}>The money</h3>
                <ul className="s-list">
                  <li>Every portion costed from real supermarket prices and pack sizes.</li>
                  <li>Whole packs on the list, and a plan that finishes what you open.</li>
                  <li>See what you spent, what you ate and what got binned.</li>
                </ul>
              </div>
              <div className="s-panel s-panel-white">
                <div className="s-big" style={{ color: 'var(--pink)' }}>lbs</div>
                <h3 className="s-h3" style={{ marginTop: 18 }}>The weight</h3>
                <ul className="s-list">
                  <li>Calories set from your weight and pace, protein first.</li>
                  <li>Portions sized to you. Herbs and spices stay as written.</li>
                  <li>A steady, weekly deficit that survives a night out.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Shop window */}
        {shopWindow.length > 0 ? (
          <section className="s-section s-rule">
            <div className="s-wrap">
              <div className="s-head-row">
                <div>
                  <p className="s-eyebrow">This week&rsquo;s picks</p>
                  <h2 className="s-h2">High protein, under 550 kcal.</h2>
                  <p className="s-body">Everyday dishes, per portion, {REFERENCE_LABEL.toLowerCase()}.</p>
                </div>
                <Link href="/recipes" className="s-link">All {recipes.length} recipes</Link>
              </div>
              <div className="s-cards">
                {shopWindow.map((r) => <RecipeCard key={r.id} recipe={r} />)}
              </div>
            </div>
          </section>
        ) : null}

        {/* Hack Away */}
        <section className="s-section s-rule">
          <div className="s-wrap">
            <div className="s-feature">
              <div className="s-feature-img" style={{ backgroundImage: "url('/assets/veg-stew.jpg')" }} />
              <div className="s-feature-text">
                <p className="s-eyebrow">Hack Away · coming this winter</p>
                <h2 className="s-h2">Pie, mash and greens. Still on the plan.</h2>
                <p className="s-body" style={{ fontSize: 16 }}>
                  The food you&rsquo;d normally give up to lose weight, rebuilt to fit your numbers: proper British comfort food, takeaway favourites
                  and puddings. Celeriac mash, almond pastry lids, edamame mushy peas. 45 new dishes, written and being tested now.
                </p>
                <div className="s-tags">
                  {HACK_AWAY.map((t) => <span className="s-tag" key={t}>{t}</span>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dish of the week */}
        {dish ? (
          <section className="s-section-tight">
            <div className="s-wrap">
              <Link href={`/recipe/${dish.id}`} className="s-feature" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                <div className="s-feature-text">
                  <p className="s-eyebrow">Dish of the week</p>
                  <h2 className="s-h2 s-serif" style={{ fontWeight: 500 }}>{dish.name}</h2>
                  <p className="s-body s-num" style={{ fontSize: 16 }}>
                    {dish.protein_g}g protein · {dish.kcal} kcal · {formatCost(dish.cost_gbp)} a portion
                  </p>
                  <p style={{ marginTop: 20 }}><span className="s-link">Get the recipe</span></p>
                </div>
                <div className="s-feature-img" style={{ backgroundImage: `url('${recipeImageUrl(dish.image_id)}')` }} />
              </Link>
            </div>
          </section>
        ) : null}

        {/* FAQ */}
        <section className="s-section s-rule" id="faq">
          <div className="s-wrap" style={{ maxWidth: 860 }}>
            <p className="s-eyebrow">Questions</p>
            <h2 className="s-h2">The honest answers.</h2>
            <div className="s-faq">
              {FAQS.slice(0, 6).map((f) => (
                <details key={f.id}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <p style={{ marginTop: 24 }}><Link href="/faq" className="s-link">All questions</Link></p>
          </div>
        </section>

        {/* CTA */}
        <section className="s-section-tight">
          <div className="s-wrap">
            <div className="s-cta">
              <h2 className="s-h2">Start with one week.</h2>
              <p className="s-body">Tell Herb your weight and your goal. It plans the week, sizes every portion to you and writes the list. Free to start.</p>
              <div className="s-btns">
                <Link href="/signup" className="s-btn s-btn-primary">Start free</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
