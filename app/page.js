import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { recipeImageUrl } from '../lib/recipe-image';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['All', 'Breakfast', 'Pasta & Bowls', 'Mains', 'Salads', 'Snacks'];

export default async function RecipeBookPage({ searchParams }) {
  const supabase = createServerComponentClient({ cookies });
  
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
  
  const activeCategory = searchParams?.cat || 'All';
  const query = searchParams?.q || '';
  
  let dbQuery = supabase.from('recipes').select('*', { count: 'exact' });
  
  if (activeCategory !== 'All') {
    dbQuery = dbQuery.eq('section', activeCategory);
  }
  if (query) {
    dbQuery = dbQuery.ilike('name', `%${query}%`);
  }
  
  const { data: recipes } = await dbQuery.order('id');
  
  const { count: totalCount } = await supabase
    .from('recipes')
    .select('*', { count: 'exact', head: true });
  
  const buildCatHref = (cat) => {
    const params = new URLSearchParams();
    if (cat !== 'All') params.set('cat', cat);
    if (query) params.set('q', query);
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  };
  
  return (
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

      <header style={{ padding: '56px 0 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8FBBD6', marginBottom: 14 }}>
              The recipe book
            </div>
            <h1 style={{ fontWeight: 800, fontSize: 'clamp(32px,5.5vw,56px)', letterSpacing: '-.035em', lineHeight: 1, margin: 0 }}>
              Every recipe, including macros and cost.
            </h1>
          </div>
          <p style={{ fontSize: 14, color: '#5B5966', maxWidth: '34ch', margin: 0 }}>
            {totalCount ?? 0} recipes and counting. Filter by category or search by name.
          </p>
        </div>
      </header>

      <section style={{ padding: '30px 0 10px' }}>
        <form method="GET" action="/" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
          <input
            name="q"
            type="text"
            placeholder="Search recipes…"
            defaultValue={query}
            style={{ border: '1px solid #E7DFD4', borderRadius: 100, padding: '12px 20px', fontSize: 14, width: 240, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
          />
          <input type="hidden" name="cat" value={activeCategory === 'All' ? '' : activeCategory} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => {
              const isActive = cat === activeCategory;
              return (
                <Link
                  key={cat}
                  href={buildCatHref(cat)}
                  style={{
                    background: isActive ? '#2A2932' : 'transparent',
                    border: '1.5px solid #E7DFD4',
                    borderRadius: 100,
                    padding: '8px 18px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: isActive ? '#FBF7F1' : '#5B5966',
                    textDecoration: 'none',
                    display: 'inline-block',
                    transition: 'background .15s, color .15s',
                  }}
                >
                  {cat}
                </Link>
              );
            })}
          </div>
        </form>

        {recipes && recipes.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {recipes.map((r) => {
              const imageUrl = recipeImageUrl(r.image_id);
              return (
                <Link
                  key={r.id}
                  href={`/recipe/${r.id}`}
                  className="recipe-card"
                  style={{
                    background: '#fff',
                    border: '1px solid #E7DFD4',
                    borderRadius: 20,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{
                    height: 180,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: 16,
                    boxSizing: 'border-box',
                    background: imageUrl ? `url(${imageUrl}) center/cover` : (r.wash || 'linear-gradient(155deg,#F1E7D5,#F7F0E2)'),
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
                      {r.tag || 'Recipe'}
                    </span>
                  </div>
                  <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8FBBD6' }}>
                      {r.section || r.category || 'Recipe'}
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2, margin: '6px 0 0' }}>
                      {r.name}
                    </h3>
                    <p style={{ fontSize: 13, color: '#5B5966', marginTop: 4, lineHeight: 1.4 }}>
                      {r.description || r.sub || ''}
                    </p>
                    <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #E7DFD4' }}>
                      <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid #E7DFD4' }}>
                        <b style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>
                          £{typeof r.cost_per_portion === 'number' ? r.cost_per_portion.toFixed(2) : r.cost || '0.00'}
                        </b>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>Cost</span>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid #E7DFD4' }}>
                        <b style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>
                          {r.protein_g ?? '—'}g
                        </b>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>Protein</span>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <b style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>
                          {r.kcal ?? '—'}
                        </b>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5B5966', fontWeight: 600 }}>kcal</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 60, textAlign: 'center', color: '#5B5966', fontSize: 15 }}>
            {query ? `No recipes match "${query}". Try another search or category.` : 'No recipes found.'}
          </div>
        )}
      </section>

      <footer style={{ borderTop: '1px solid #E7DFD4', marginTop: 60, padding: '40px 0 50px' }}>
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
  );
}
