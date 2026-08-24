'use client';
// app/page.js
// Editorial homepage. Live recipes + costs from Supabase; hero and spotlight
// photography from public/assets. Marketing copy is locked from the design
// handoff — don't reinterpret.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getBrowserClient } from '../lib/supabaseBrowser';
import { recipeImageUrl } from '../lib/recipeImage';

const WASHES = {
  Breakfast: 'linear-gradient(155deg,#F1E7D5,#F7F0E2)',
  'Pasta & Bowls': 'linear-gradient(155deg,#C8E6C9,#E8F5E9)',
  Mains: 'linear-gradient(155deg,#D1C4E9,#EDE7F6)',
  Salads: 'linear-gradient(155deg,#F3C6D0,#F8DDE3)',
  Snacks: 'linear-gradient(155deg,#E9C067,#FFF3CD)',
};
const DEFAULT_WASH = 'linear-gradient(155deg,#BCD7E9,#DCEBF3)';

const FAQS = [
  { id: 1, q: 'Do I need to follow keto?', a: 'No — Herb works with any way of eating. Keto is just where the first recipe set started.' },
  { id: 2, q: 'How is cost calculated?', a: 'From live UK grocery prices, rolled up per portion so you always know what a meal actually costs.' },
  { id: 3, q: 'Can I use it for a household?', a: 'Yes — set your household portions once and every plan and shopping list scales to match.' },
];

function washFor(section) {
  return WASHES[section] || DEFAULT_WASH;
}

function recipeImage(recipe) {
  return recipeImageUrl(recipe?.image_id);
}

function RecipeCard({ recipe, cost }) {
  const image = recipeImage(recipe);
  return (
    <Link href={`/recipe/${recipe.id}`} style={{
      background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      textDecoration: 'none', color: 'inherit',
    }}>
      <div style={{
        height: 200, position: 'relative', display: 'flex', alignItems: 'flex-end',
        padding: 16, boxSizing: 'border-box',
        background: image ? `url('${image}') center/cover` : washFor(recipe.section),
      }}>
        <span style={{
          background: 'rgba(255,255,255,.85)', borderRadius: 100, fontSize: 11,
          fontWeight: 700, letterSpacing: '.05em', padding: '6px 12px',
          textTransform: 'uppercase', color: '#2A2932',
        }}>
          {recipe.section || 'Recipe'}
        </span>
      </div>
      <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2, margin: 0 }}>{recipe.name}</h3>
        <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #E7DFD4' }}>
          <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid #E7DFD4' }}>
            <b style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{cost != null ? `£${Number(cost).toFixed(2)}` : '—'}</b>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>Cost</span>
          </div>
          <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid #E7DFD4' }}>
            <b style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{recipe.protein_g ?? '—'}g</b>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>Protein</span>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <b style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{recipe.kcal ?? '—'}</b>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>kcal</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [recipes, setRecipes] = useState([]);
  const [costByRecipe, setCostByRecipe] = useState({});
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [faqOpen, setFaqOpen] = useState({});

  useEffect(() => {
    let alive = true;
    async function load() {
      const supabase = getBrowserClient();
      const { data: recipeRows } = await supabase
        .from('recipes')
        .select('id, name, section, kcal, protein_g, image_id')
        .order('name');
      const { data: costRows } = await supabase
        .from('recipe_costs')
        .select('recipe_id, cost_gbp');
      if (!alive) return;
      setRecipes(recipeRows || []);
      setCostByRecipe(Object.fromEntries((costRows || []).map((row) => [row.recipe_id, row.cost_gbp])));
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(
    () => ['All', ...new Set(recipes.map((recipe) => recipe.section).filter(Boolean))],
    [recipes]
  );

  // Idle (All + no search) shows one pick per category as a preview.
  // Searching or choosing a category shows every matching recipe.
  const visibleRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtering = q !== '' || category !== 'All';
    if (filtering) {
      return recipes.filter(
        (recipe) =>
          (category === 'All' || recipe.section === category) &&
          (q === '' || (recipe.name || '').toLowerCase().includes(q))
      );
    }
    const seen = new Set();
    const picks = [];
    for (const recipe of recipes) {
      const key = recipe.section || recipe.id;
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(recipe);
      if (picks.length >= 6) break;
    }
    return picks;
  }, [recipes, category, query]);

  // Dish of the week: the salmon recipe if it's in the book (its photography
  // ships in public/assets), otherwise the first recipe with an image.
  const spotlight = useMemo(() => {
    const salmon = recipes.find((recipe) => /salmon/i.test(recipe.name));
    if (salmon) return { recipe: salmon, image: '/assets/salmon-celeriac.jpg' };
    const withImage = recipes.find((recipe) => recipe.image_id);
    if (withImage) return { recipe: withImage, image: recipeImage(withImage) };
    return null;
  }, [recipes]);

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
      <header className="rise" style={{ margin: '0 -24px', position: 'relative', overflow: 'hidden', borderRadius: '0 0 26px 26px' }}>
        <div style={{
          position: 'relative', height: 640, display: 'flex', alignItems: 'center',
          backgroundImage: "url('/assets/tbone-pak-choi.jpg')", backgroundSize: 'cover', backgroundPosition: 'center',
        }}>
          <div className="herb-hero-overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(251,247,241,.95) 0%,rgba(251,247,241,.85) 38%,rgba(251,247,241,.15) 62%,rgba(251,247,241,0) 78%)' }} />
          <div style={{ position: 'relative', padding: '0 48px', maxWidth: 900 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2A2932', marginBottom: 22 }}>
              Fresh, cost-aware, no compromise
            </div>
            <h1 style={{ fontWeight: 800, fontSize: 'clamp(40px,8.5vw,86px)', lineHeight: .98, letterSpacing: '-.035em', maxWidth: '14ch', margin: 0 }}>
              Eat <em style={{ fontFamily: 'var(--font-newsreader),Georgia,serif', fontStyle: 'italic', fontWeight: 500, color: '#E7A6B5' }}>well</em>, even when life doesn&rsquo;t go to plan.
            </h1>
            <p style={{ marginTop: 24, maxWidth: '48ch', fontSize: 'clamp(16px,2.2vw,19px)', color: '#5B5966', fontWeight: 500 }}>
              Herb plans your week, tracks the macros and the cost, and rebalances when life gets in the way. Food, health and culture — not a diet.
            </p>
            <div style={{ display: 'flex', gap: 14, marginTop: 34, flexWrap: 'wrap' }}>
              <a href="#recipes" style={{ background: '#2A2932', color: '#FBF7F1', border: 'none', fontWeight: 700, fontSize: 15, borderRadius: 100, padding: '15px 28px', textDecoration: 'none', display: 'inline-block' }}>Browse recipes</a>
              <Link href="/about" style={{ background: 'transparent', color: '#2A2932', border: '1.5px solid #2A2932', fontWeight: 700, fontSize: 15, borderRadius: 100, padding: '15px 28px', textDecoration: 'none', display: 'inline-block' }}>What is Herb</Link>
            </div>
          </div>
        </div>
      </header>

      <section id="what-is-herb" style={{ padding: '70px 0 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 30, gap: 20, flexWrap: 'wrap' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-.03em', margin: 0 }}>Why Herb</h2>
          <p style={{ fontSize: 14, color: '#5B5966', maxWidth: '34ch', margin: 0 }}>Food, health and culture — built around real cooking, not restriction.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Real macros &amp; cost</div>
            <div style={{ fontSize: 14, color: '#5B5966', marginTop: 8, lineHeight: 1.5 }}>Per-portion nutrition and price, rolled up live — no guessing what dinner actually costs.</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Weekly meal plans</div>
            <div style={{ fontSize: 14, color: '#5B5966', marginTop: 8, lineHeight: 1.5 }}>Plan the week, swap a meal in a tap, mark a night out — the plan bends without breaking.</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Pantry-aware</div>
            <div style={{ fontSize: 14, color: '#5B5966', marginTop: 8, lineHeight: 1.5 }}>Herb knows what&rsquo;s in your fridge and what&rsquo;s about to turn, before you shop again.</div>
          </div>
        </div>
      </section>

      <section id="recipes" style={{ padding: '70px 0 10px' }}>
        {spotlight ? (
          <Link href={`/recipe/${spotlight.recipe.id}`} style={{
            display: 'block', height: 340, position: 'relative', borderRadius: 26,
            overflow: 'hidden', marginBottom: 30,
            backgroundImage: `url('${spotlight.image}')`, backgroundSize: 'cover', backgroundPosition: 'center 30%',
            textDecoration: 'none', color: 'inherit',
          }}>
            <div className="herb-hero-overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(251,247,241,.95) 0%,rgba(251,247,241,.75) 45%,rgba(251,247,241,0) 78%)' }} />
            <div style={{ position: 'relative', padding: 40, maxWidth: 440 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8FBBD6', marginBottom: 14 }}>Dish of the week</div>
              <h2 style={{ fontWeight: 800, fontSize: 38, letterSpacing: '-.03em', margin: 0, color: '#2A2932', lineHeight: 1.05 }}>{spotlight.recipe.name}</h2>
              <p style={{ fontSize: 15, color: '#5B5966', marginTop: 12 }}>
                {spotlight.recipe.kcal ?? '—'} kcal · {spotlight.recipe.protein_g ?? '—'}g protein
                {costByRecipe[spotlight.recipe.id] != null ? ` · £${Number(costByRecipe[spotlight.recipe.id]).toFixed(2)}` : ''}
              </p>
            </div>
          </Link>
        ) : null}

        <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: '24px 32px', marginBottom: 30 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4.5vw,44px)', letterSpacing: '-.03em', margin: 0 }}>Recipes</h2>
              <p style={{ fontSize: 14, color: '#5B5966', marginTop: 8 }}>Per-portion macros and cost, rolled up live from the database. One pick per category — pick a category to see more.</p>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            style={{ width: 260, maxWidth: '100%', border: '1px solid #E7DFD4', borderRadius: 100, padding: '12px 20px', fontSize: 14, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 30 }}>
          {categories.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                style={{
                  background: active ? '#2A2932' : 'transparent',
                  border: `1.5px solid ${active ? '#2A2932' : '#E7DFD4'}`,
                  borderRadius: 100, padding: '8px 18px', fontSize: 13, fontWeight: 600,
                  color: active ? '#FBF7F1' : '#5B5966', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {visibleRecipes.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
            {visibleRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} cost={costByRecipe[recipe.id]} />
            ))}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 60, textAlign: 'center', color: '#5B5966', fontSize: 15 }}>
            {query ? `No recipes match \u201c${query}\u201d. Try another search or category.` : 'No recipes found.'}
          </div>
        )}
      </section>

      <section style={{ padding: '60px 0 0' }}>
        <div style={{ background: 'linear-gradient(120deg,#BCD7E9 0%,#F3C6D0 100%)', borderRadius: 26, padding: 'clamp(36px,6vw,72px)' }}>
          <p style={{ fontFamily: 'var(--font-newsreader),Georgia,serif', fontStyle: 'italic', fontWeight: 500, fontSize: 'clamp(24px,4vw,42px)', lineHeight: 1.2, letterSpacing: '-.01em', maxWidth: '24ch', color: '#2A2932', margin: 0 }}>
            A plan that bends doesn&rsquo;t break. Out tonight? Herb rebalances tomorrow — no penance.
          </p>
          <div style={{ marginTop: 22, fontSize: 14, fontWeight: 700, letterSpacing: '.04em', color: '#5B5966' }}>— Takes the planning off your plate</div>
        </div>
      </section>

      <section id="about" style={{ padding: '70px 0 10px' }}>
        <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 24, padding: 'clamp(28px,4vw,48px)', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, aspectRatio: '4/3', borderRadius: 18, background: 'linear-gradient(155deg,#F1E7D5,#F7F0E2)' }} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8FBBD6', marginBottom: 14 }}>Food, health, culture</div>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: '-.03em', margin: 0 }}>Not a diet — a lifestyle</h2>
            <p style={{ fontSize: 15, color: '#5B5966', marginTop: 14, lineHeight: 1.6 }}>
              Herb is built around everyday cooking, real ingredients and honest cost — not restriction. We&rsquo;re a small team of home cooks who got tired of apps that treated food like a spreadsheet.
            </p>
          </div>
        </div>
      </section>

      <section id="faq" style={{ padding: '70px 0 10px' }}>
        <h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-.03em', margin: '0 0 30px' }}>FAQ</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FAQS.map((faq) => {
            const open = !!faqOpen[faq.id];
            return (
              <div key={faq.id} style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 14, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setFaqOpen({ ...faqOpen, [faq.id]: !open })}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 600, color: '#2A2932', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <span>{faq.q}</span><span>{open ? '−' : '+'}</span>
                </button>
                {open ? <div style={{ padding: '0 20px 18px', fontSize: 14, color: '#5B5966', lineHeight: 1.5 }}>{faq.a}</div> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ padding: '80px 0 30px', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontSize: 'clamp(46px,11vw,120px)' }}>
          <span style={{ color: '#E7A6B5', fontSize: '1.35em', verticalAlign: '-.06em' }}>£</span>/<span style={{ color: '#8FBBD6' }}>lbs</span>
        </div>
        <p style={{ marginTop: 20, color: '#5B5966', fontSize: 16 }}>Herb looks after both — the money and the weight. Nobody else tracks the two together.</p>
        <Link href="/signup" style={{ marginTop: 28, background: '#2A2932', color: '#FBF7F1', border: 'none', fontWeight: 700, fontSize: 15, borderRadius: 100, padding: '15px 28px', textDecoration: 'none', display: 'inline-block' }}>Sign up free</Link>
      </section>

      <footer id="blog" style={{ borderTop: '1px solid #E7DFD4', marginTop: 40, padding: '40px 0 50px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>HERB<span style={{ color: '#E7A6B5' }}>.</span></div>
            <a href="#recipes" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>Recipes</a>
            <Link href="/about" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>About</Link>
            <a href="#what-is-herb" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>What is Herb</a>
            <a href="#blog" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>Blog</a>
            <a href="#faq" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>FAQ</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Contact &amp; support</div>
            <span style={{ fontSize: 13, color: '#5B5966' }}>help@herb.app</span>
            <span style={{ fontSize: 13, color: '#5B5966' }}>Contact us</span>
            <span style={{ fontSize: 13, color: '#5B5966' }}>Support centre</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 260, flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Get weekly recipe ideas</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="email" placeholder="you@example.com" style={{ flex: 1, border: '1px solid #E7DFD4', borderRadius: 12, padding: '10px 12px', fontSize: 13 }} />
              <button type="button" style={{ background: '#2A2932', color: '#FBF7F1', border: 'none', borderRadius: 12, padding: '0 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Sign up</button>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #E7DFD4', marginTop: 32, paddingTop: 20, fontSize: 13, color: '#5B5966' }}>HERB — cook smarter, eat well.</div>
      </footer>
    </main>
  );
}
