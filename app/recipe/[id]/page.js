import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { recipeImageUrl } from '../../../lib/recipe-image';
import { MeasureUnitsProvider } from '../../../components/MeasureUnitsProvider';
import { Qty } from '../../../components/Qty';
import RecipeActions from './RecipeActions';

export const dynamic = 'force-dynamic';

export default async function RecipeDetailPage({ params }) {
  const supabase = createServerComponentClient({ cookies });
  const { id } = params;

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  let profileName = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();
    profileName = profile?.name;
  }

  const { data: recipe } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients (
        amount,
        unit,
        ingredients ( id, name )
      ),
      recipe_steps ( step_number, instruction )
    `)
    .eq('id', id)
    .single();

  if (!recipe) notFound();

  const imageUrl = recipeImageUrl(recipe.image_id);

  let pantryIngredientIds = [];
  if (user) {
    const { data: pantry } = await supabase
      .from('pantry')
      .select('ingredient_id')
      .eq('user_id', user.id);
    pantryIngredientIds = pantry?.map((p) => p.ingredient_id) || [];
  }

  const { data: related } = await supabase
    .from('recipes')
    .select('id, name, tag, cost_per_portion, kcal, image_id, wash, section')
    .neq('id', id)
    .limit(3);

  const macros = [
    {
      label: 'Protein',
      value: `${recipe.protein_g ?? 0}g`,
      pct: Math.min(100, ((recipe.protein_g ?? 0) / 50) * 100),
      color: '#E7A6B5',
    },
    {
      label: 'Fat',
      value: `${recipe.fat_g ?? 0}g`,
      pct: Math.min(100, ((recipe.fat_g ?? 0) / 50) * 100),
      color: '#8FBBD6',
    },
    {
      label: 'Carbs',
      value: `${recipe.carbs_g ?? 0}g`,
      pct: Math.min(100, ((recipe.carbs_g ?? 0) / 50) * 100),
      color: '#E9C067',
    },
    {
      label: 'Fibre',
      value: `${recipe.fibre_g ?? 0}g`,
      pct: Math.min(100, ((recipe.fibre_g ?? 0) / 15) * 100),
      color: '#C8E6C9',
    },
  ];

  const steps = (recipe.recipe_steps || []).sort(
    (a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)
  );

  return (
    <MeasureUnitsProvider>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', color: '#2A2932', lineHeight: 1.5, WebkitFontSmoothing: 'antialiased' }}>
        <style>{`
          .recipe-card { transition: transform .2s ease, box-shadow .2s ease; }
          .recipe-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(42,41,50,.08); }
          .nav-pill { transition: background .15s, color .15s; }
          .nav-pill:hover { background: #2A2932 !important; color: #FBF7F1 !important; }
        `}</style>

        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', position: 'sticky', top: 0, background: 'rgba(251,247,241,.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 100, borderBottom: '1px solid #E7DFD4' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 48, letterSpacing: '-.02em', lineHeight: 1, textDecoration: 'none', color: '#2A2932' }}>
            HERB<span style={{ color: '#E7A6B5' }}>.</span>
          </Link>
          <div style={{ display: 'flex', gap: 30, fontSize: 17, fontWeight: 600, color: '#5B5966' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#2A2932' }}>Recipes</Link>
            <Link href="/about" style={{ textDecoration: 'none', color: 'inherit' }}>About</Link>
            <Link href="/about#what-is-herb" style={{ textDecoration: 'none', color: 'inherit' }}>What is Herb</Link>
            <Link href="/#blog" style={{ textDecoration: 'none', color: 'inherit' }}>Blog</Link>
            <Link href="/#faq" style={{ textDecoration: 'none', color: 'inherit' }}>FAQ</Link>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {user ? (
              <>
                <Link href="/dashboard" style={{ fontSize: 15, fontWeight: 700, color: '#2A2932', textDecoration: 'none' }}>
                  Hi, {profileName || 'there'}
                </Link>
                <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                  <button type="submit" className="nav-pill" style={{ border: '1.5px solid #2A2932', borderRadius: 100, padding: '12px 24px', fontSize: 15, fontWeight: 700, color: '#2A2932', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" style={{ fontSize: 16, fontWeight: 600, color: '#2A2932', textDecoration: 'none' }}>Log in</Link>
                <Link href="/signup" className="nav-pill" style={{ border: '1.5px solid #2A2932', borderRadius: 100, padding: '12px 24px', fontSize: 15, fontWeight: 700, color: '#2A2932', textDecoration: 'none', display: 'inline-block' }}>
                  Start free
                </Link>
              </>
            )}
          </div>
        </nav>

        <div style={{ padding: '24px 0 0' }}>
          <Link href="/" style={{ fontSize: 13, fontWeight: 600, color: '#5B5966', textDecoration: 'none' }}>
            ← Back to recipe book
          </Link>
        </div>

        <header style={{ padding: '24px 0 10px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 40, alignItems: 'start' }}>
          <div style={{
            height: 420,
            borderRadius: 24,
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            background: imageUrl ? undefined : (recipe.wash || 'linear-gradient(155deg,#F1E7D5,#F7F0E2)'),
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 20,
            boxSizing: 'border-box',
          }}>
            <span style={{
              background: 'rgba(255,255,255,.85)',
              borderRadius: 100,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.05em',
              padding: '6px 12px',
              textTransform: 'uppercase',
              color: '#2A2932',
            }}>
              {recipe.tag || 'Recipe'}
            </span>
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8FBBD6', marginBottom: 12 }}>
              {recipe.section || recipe.category || 'Recipe'}
            </div>
            <h1 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.5vw,44px)', letterSpacing: '-.03em', lineHeight: 1.05, margin: 0 }}>
              {recipe.name}
            </h1>
            <p style={{ fontSize: 15, color: '#5B5966', marginTop: 14, lineHeight: 1.6 }}>
              {recipe.description}
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 0,
              marginTop: 26,
              background: '#fff',
              border: '1px solid #E7DFD4',
              borderRadius: 16,
              padding: '16px 0',
            }}>
              <div style={{ textAlign: 'center', borderRight: '1px solid #E7DFD4' }}>
                <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>
                  £{typeof recipe.cost_per_portion === 'number' ? recipe.cost_per_portion.toFixed(2) : recipe.cost || '0.00'}
                </b>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>Cost</span>
              </div>
              <div style={{ textAlign: 'center', borderRight: '1px solid #E7DFD4' }}>
                <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{recipe.kcal ?? '—'}</b>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>kcal</span>
              </div>
              <div style={{ textAlign: 'center', borderRight: '1px solid #E7DFD4' }}>
                <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{recipe.protein_g ?? '—'}g</b>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>Protein</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{recipe.cook_time || recipe.time || '—'}</b>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>Cook time</span>
              </div>
            </div>

            <RecipeActions recipeId={recipe.id} />
          </div>
        </header>

        <section style={{ padding: '60px 0 10px', display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 48 }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', margin: '0 0 18px' }}>
              Ingredients <span style={{ fontSize: 14, fontWeight: 600, color: '#5B5966' }}>· serves {recipe.serves || 1}</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recipe.recipe_ingredients?.map((ri, i) => {
                const isInPantry = ri.ingredients?.id && pantryIngredientIds.includes(ri.ingredients.id);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #E7DFD4', fontSize: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {ri.ingredients?.name || ri.name || '—'}
                      {isInPantry && (
                        <span style={{ background: '#C8E6C9', color: '#2A2932', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          In pantry
                        </span>
                      )}
                    </span>
                    <span style={{ color: '#5B5966', fontWeight: 600 }}>
                      <Qty amount={ri.amount} unit={ri.unit} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', margin: '0 0 18px' }}>Method</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2A2932', color: '#FBF7F1', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {step.step_number || i + 1}
                  </div>
                  <p style={{ fontSize: 15, color: '#2A2932', margin: 0, lineHeight: 1.6, paddingTop: 3 }}>
                    {step.instruction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: '60px 0 10px' }}>
          <h2 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', margin: '0 0 18px' }}>Per portion</h2>
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

        <section style={{ padding: '70px 0 10px' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(24px,3.5vw,32px)', letterSpacing: '-.03em', margin: '0 0 24px' }}>You might also like</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
            {related?.map((r) => {
              const relImage = recipeImageUrl(r.image_id);
              return (
                <Link key={r.id} href={`/recipe/${r.id}`} className="recipe-card" style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ height: 160, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14, boxSizing: 'border-box', background: relImage ? `url(${relImage}) center/cover` : (r.wash || 'linear-gradient(155deg,#F1E7D5,#F7F0E2)') }}>
                    <span style={{ background: 'rgba(255,255,255,.85)', borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', padding: '5px 10px', textTransform: 'uppercase', color: '#2A2932' }}>
                      {r.tag || 'Recipe'}
                    </span>
                  </div>
                  <div style={{ padding: 18 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{r.name}</h3>
                    <div style={{ fontSize: 13, color: '#5B5966', marginTop: 6 }}>
                      £{typeof r.cost_per_portion === 'number' ? r.cost_per_portion.toFixed(2) : r.cost || '0.00'} · {r.kcal ?? '—'} kcal
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <footer style={{ borderTop: '1px solid #E7DFD4', marginTop: 50, padding: '40px 0 50px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>HERB<span style={{ color: '#E7A6B5' }}>.</span></div>
              <Link href="/" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>Recipes</Link>
              <Link href="/about" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>About</Link>
              <Link href="/about#what-is-herb" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>What is Herb</Link>
              <Link href="/#blog" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>Blog</Link>
              <Link href="/#faq" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>FAQ</Link>
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
                <input type="email" placeholder="you@example.com" style={{ flex: 1, border: '1px solid #E7DFD4', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                <button type="button" style={{ background: '#2A2932', color: '#FBF7F1', border: 'none', borderRadius: 12, padding: '0 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Sign up</button>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #E7DFD4', marginTop: 32, paddingTop: 20, fontSize: 13, color: '#5B5966' }}>
            HERB — cook smarter, eat well.
          </div>
        </footer>
      </div>
    </MeasureUnitsProvider>
  );
}
