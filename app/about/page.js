// app/about/page.js
//
// Every sentence here is true today. Claims about things still being built say
// so. The founder is unnamed (Karum, 8 Nov 2026). The counts are read live from
// the database at request time, so the page never carries a stale number; if the
// read fails, the sentence that needs the number is left out rather than guessed.
import Link from 'next/link';
import { getSupabase } from '../../lib/supabase';
import SiteFooter from '../../components/site/SiteFooter';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'About · HERB',
  description: 'Why Herb exists, how the numbers are made, and what it refuses to do.',
};

const METHOD = [
  {
    title: 'Every ingredient has a label behind it',
    body: 'Nutrition comes from UK pack labels and the UK government’s food composition tables (CoFID). Branded items are cross-checked against Open Food Facts. Carbs are counted the way UK labels count them, with fibre already taken out.',
  },
  {
    title: 'Every ingredient has a price and a pack size',
    body: 'Real prices from Tesco, Lidl, Aldi, Sainsbury’s and Ocado, with the pack you would actually buy. A portion is costed from what goes on the plate. Salt, pepper, herbs, spices, oil, garlic and stock come out of a small monthly pantry allowance, because that is how people buy them.',
  },
  {
    title: 'One calculation, used everywhere',
    body: 'Herb sizes each ingredient to the person first, then adds up the calories, protein, carbs, fat, fibre and cost from those sized amounts. The ingredient list and the totals can never disagree, because they come from the same sum.',
  },
  {
    title: 'Flavour is never scaled',
    body: 'Meat, fish, dairy, fats and veg are sized to your weight and goal. Eggs and sausages come in whole numbers. Herbs, spices, garlic, ginger, chilli, lemon and stock stay as written, whoever is eating.',
  },
];

const REFUSALS = [
  { title: 'Not a diet app', body: 'Herb is a food platform. The recipes are high in protein and low in carbs because that keeps people full while they lose weight, but it is real food you would cook anyway.' },
  { title: 'No made-up numbers', body: 'If a figure cannot be traced to a label, a price or a sum, it does not go on the page. Where a check is unfinished, the page says so.' },
  { title: 'No gimmicks', body: 'No discount codes, no countdown timers, no “only 3 left”. Herb asks what it needs to size your plan and nothing it doesn’t.' },
  { title: 'Nothing sold to you', body: 'No product links, no affiliate deals, no “you must take”. Where Herb talks about food or supplements it gives the evidence and the source, and leaves the decision with you.' },
  { title: 'Children are never measured', body: 'Herb never weighs, scores, targets or sets a plan for a child. That is a line, not a setting.' },
];

async function liveCounts() {
  try {
    const supabase = getSupabase();
    const [{ count: recipes }, { count: ingredients }] = await Promise.all([
      supabase.from('recipes').select('id', { count: 'exact', head: true }),
      supabase.from('ingredients').select('id', { count: 'exact', head: true }),
    ]);
    return { recipes: recipes ?? null, ingredients: ingredients ?? null };
  } catch {
    return { recipes: null, ingredients: null };
  }
}

export default async function AboutPage() {
  const counts = await liveCounts();
  const stats = [
    counts.recipes != null ? { n: counts.recipes, label: 'recipes live, every one costed' } : null,
    counts.ingredients != null ? { n: counts.ingredients, label: 'ingredients, each with label nutrition and a UK price' } : null,
    { n: '5', label: 'shops priced: Tesco, Lidl, Aldi, Sainsbury’s, Ocado' },
    { n: '1', label: 'calculation behind every figure on the site' },
  ].filter(Boolean);

  return (
    <>
      <main>
        <section className="s-hero">
          <div className="s-wrap s-hero-grid">
            <div>
              <p className="s-eyebrow">About Herb</p>
              <h1 className="s-h1" style={{ fontSize: 'clamp(36px,8vw,64px)' }}>
                Proper food. Honest numbers. <em className="s-serif" style={{ fontWeight: 500 }}>A bill you can see.</em>
              </h1>
              <p className="s-lede">
                Most people trying to lose weight run three systems at once: an app for the calories, a list for the shopping,
                and a fridge full of half-used packs. Herb puts the food, the numbers and the cost in one plan, sized to you,
                and keeps it standing when the week goes sideways.
              </p>
            </div>
            <div className="s-recipe-img" style={{ backgroundImage: "url('/assets/chicken-shawarma.jpg')", margin: 0, borderRadius: 24 }} role="img" aria-label="Slow cooked chicken shawarma" />
          </div>
        </section>

        <section className="s-section-tight">
          <div className="s-wrap">
            <div className="s-stat-strip">
              {stats.map((s) => (
                <div key={s.label}><b>{s.n}</b><span>{s.label}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="s-section s-rule">
          <div className="s-wrap">
            <p className="s-eyebrow">Why Herb exists</p>
            <div className="s-about-grid">
              <h2 className="s-h2">Eating well shouldn&rsquo;t need a spreadsheet.</h2>
              <div className="s-prose">
                <p>
                  Losing weight is not hard to understand. Eat a bit less than you burn, keep the protein up, and keep doing it.
                  What&rsquo;s hard is doing it on a Tuesday in November with a full day behind you, a fridge that doesn&rsquo;t match
                  the plan, and a food bill that has quietly gone up.
                </p>
                <p>
                  That is the problem Herb is built for. Not the perfect week, but the real one. It plans proper food, sizes every
                  portion to you, costs it to the penny from real shop prices, writes the list in whole packs, and when you eat out
                  or miss a meal it rebalances the next few days instead of starting again on Monday.
                </p>
                <p className="s-pull">&ldquo;Eat well, even when life doesn&rsquo;t go to plan.&rdquo;</p>
              </div>
            </div>
          </div>
        </section>

        <section className="s-section s-rule">
          <div className="s-wrap">
            <p className="s-eyebrow">How the numbers are made</p>
            <h2 className="s-h2">Every figure can be traced back.</h2>
            <p className="s-lede" style={{ maxWidth: '60ch' }}>
              Herb is built by someone who spent twenty years making food in factories, where a number you can&rsquo;t back up is a
              number you can&rsquo;t use. The same standard applies here.
            </p>
            <div className="s-steps" style={{ marginTop: 36 }}>
              {METHOD.map((m, i) => (
                <div className="s-step" key={m.title}>
                  <div className="s-step-n">{i + 1}</div>
                  <h3 className="s-h3">{m.title}</h3>
                  <p className="s-body">{m.body}</p>
                </div>
              ))}
            </div>
            <p className="s-small" style={{ marginTop: 20, color: 'var(--muted)' }}>
              Figures on the public site are sized for an 80 kg adult and say so. Once you sign up, they are sized to you.{' '}
              <Link href="/faq#figures" className="s-link">Where the figures come from</Link>
            </p>
          </div>
        </section>

        <section className="s-section s-rule">
          <div className="s-wrap">
            <p className="s-eyebrow">What Herb won&rsquo;t do</p>
            <h2 className="s-h2">Five things we refuse.</h2>
            <div className="s-refusals">
              {REFUSALS.map((r) => (
                <div key={r.title}>
                  <h3 className="s-h3">{r.title}</h3>
                  <p className="s-body">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="s-section s-rule">
          <div className="s-wrap s-about-grid">
            <div>
              <p className="s-eyebrow">Who&rsquo;s behind it</p>
              <h2 className="s-h2">Built in Cornwall, from the factory floor.</h2>
            </div>
            <div className="s-prose">
              <p>
                Herb&rsquo;s founder spent twenty years in food manufacturing and operations, running operations for a UK food
                manufacturer, and holds food safety and HACCP qualifications. The problem he set out to solve was his own: losing
                weight without living on a spreadsheet, and without the food bill getting out of hand.
              </p>
              <p>
                The method comes straight from the factory. Know exactly what goes into every portion. Know exactly what it costs.
                Plan production around what&rsquo;s in stock. Don&rsquo;t throw money in the bin. Herb does that for a home kitchen.
              </p>
              <p>
                It&rsquo;s early. The recipe book is growing, with a new batch of British comfort food, takeaway favourites and
                puddings being cooked and tested now. Cooking times stay estimates until a dish has been cooked, and the allergen
                check on each recipe says plainly whether it is finished. When something isn&rsquo;t built yet, the site says so.
              </p>
            </div>
          </div>
        </section>

        <section className="s-section-tight">
          <div className="s-wrap">
            <div className="s-cta">
              <h2 className="s-h2">See what a week looks like.</h2>
              <p className="s-body">Free to start. Your first week is sized to you.</p>
              <div className="s-btns">
                <Link href="/signup" className="s-btn s-btn-primary">Start free</Link>
                <Link href="/recipes" className="s-btn s-btn-secondary" style={{ borderColor: 'rgba(251,247,241,.4)', color: 'var(--cream)' }}>Browse the recipes</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
