// app/about/page.js
// Editorial About page. Server component (no data). The founder card and
// milestones are real-edit placeholders — update the copy as the story grows.

import Link from 'next/link';

const MILESTONES = [
  { year: '2026', text: 'Herb founded in the UK — built by a home cook tired of tracking macros and grocery spend in two separate spreadsheets.' },
  { year: '2026', text: 'First keto recipe set goes live, with per-portion macros and cost rolled up from real ingredient prices.' },
  { year: '2026', text: 'The full loop ships: plan the week, shop with pack-aware lists, cook, store, eat — and see what waste actually costs.' },
];

export default function AboutPage() {
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
      <header id="what-is-herb" className="rise" style={{ margin: '0 -24px', position: 'relative', overflow: 'hidden', borderRadius: '0 0 26px 26px' }}>
        <div style={{
          position: 'relative', height: 520, display: 'flex', alignItems: 'center',
          backgroundImage: "url('/assets/tbone-pak-choi.jpg')", backgroundSize: 'cover', backgroundPosition: 'center',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(251,247,241,.95) 0%,rgba(251,247,241,.85) 40%,rgba(251,247,241,.15) 64%,rgba(251,247,241,0) 80%)' }} />
          <div style={{ position: 'relative', padding: '0 48px', maxWidth: 760 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2A2932', marginBottom: 22 }}>Food, health, culture</div>
            <h1 style={{ fontWeight: 800, fontSize: 'clamp(36px,7vw,68px)', lineHeight: 1, letterSpacing: '-.035em', margin: 0 }}>
              What is <em style={{ fontFamily: 'var(--font-newsreader),Georgia,serif', fontStyle: 'italic', fontWeight: 500, color: '#E7A6B5' }}>Herb</em>?
            </h1>
            <p style={{ marginTop: 22, maxWidth: '46ch', fontSize: 'clamp(16px,2vw,18px)', color: '#5B5966', fontWeight: 500 }}>
              A food and health lifestyle built around fresh, cost-aware cooking — not a diet. We built Herb because we were tired of apps that treated food like a spreadsheet.
            </p>
          </div>
        </div>
      </header>

      <section style={{ padding: '70px 0 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 30, gap: 20, flexWrap: 'wrap' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-.03em', margin: 0 }}>Our values</h2>
          <p style={{ fontSize: 14, color: '#5B5966', maxWidth: '34ch', margin: 0 }}>The three things every recipe, screen and feature has to earn its place against.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Real macros, no guessing</div>
            <div style={{ fontSize: 14, color: '#5B5966', marginTop: 8, lineHeight: 1.5 }}>Every recipe carries live nutrition and cost — not an estimate, not a hunch.</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Cooking on a budget shouldn&rsquo;t be hard</div>
            <div style={{ fontSize: 14, color: '#5B5966', marginTop: 8, lineHeight: 1.5 }}>Good food and a sensible grocery bill aren&rsquo;t opposites. Herb plans for both, every week.</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Waste less, plan better</div>
            <div style={{ fontSize: 14, color: '#5B5966', marginTop: 8, lineHeight: 1.5 }}>Herb watches your pantry so ingredients get used, not binned — and plans build on what you already have.</div>
          </div>
        </div>
      </section>

      <section style={{ padding: '60px 0 0' }}>
        <div style={{ background: 'linear-gradient(120deg,#BCD7E9 0%,#F3C6D0 100%)', borderRadius: 26, padding: 'clamp(36px,6vw,72px)' }}>
          <p style={{ fontFamily: 'var(--font-newsreader),Georgia,serif', fontStyle: 'italic', fontWeight: 500, fontSize: 'clamp(24px,4vw,42px)', lineHeight: 1.2, letterSpacing: '-.01em', maxWidth: '26ch', color: '#2A2932', margin: 0 }}>
            Built by a home cook who kept doing the maths in his head — so nobody else has to.
          </p>
          <div style={{ marginTop: 22, fontSize: 14, fontWeight: 700, letterSpacing: '.04em', color: '#5B5966' }}>— The Herb team</div>
        </div>
      </section>

      <section id="team" style={{ padding: '70px 0 10px' }}>
        <h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-.03em', margin: '0 0 30px' }}>Built by a home cook, for home cooks</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E7DFD4', borderRadius: 20, padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'linear-gradient(155deg,#F3C6D0,#F8DDE3)', margin: '0 auto' }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 16, letterSpacing: '-.01em' }}>Karum</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#8FBBD6', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4 }}>Founder</div>
            <div style={{ fontSize: 13, color: '#5B5966', marginTop: 10, lineHeight: 1.5 }}>
              Started Herb after years of tracking macros and grocery spend in two separate spreadsheets.
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '70px 0 10px' }}>
        <h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-.03em', margin: '0 0 36px' }}>Milestones</h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {MILESTONES.map((milestone, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '100px 24px 1fr', gap: 0, paddingBottom: 36 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: '#E7A6B5' }}>{milestone.year}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#2A2932', flexShrink: 0 }} />
                <div style={{ width: 1.5, flex: 1, background: '#E7DFD4', marginTop: 6 }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, paddingTop: 1 }}>{milestone.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '80px 0 30px', textAlign: 'center' }}>
        <h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,5vw,52px)', letterSpacing: '-.03em', maxWidth: '20ch', margin: '0 auto' }}>Cook well, spend sensibly, waste less.</h2>
        <Link href="/signup" style={{ marginTop: 28, background: '#2A2932', color: '#FBF7F1', border: 'none', fontWeight: 700, fontSize: 15, borderRadius: 100, padding: '15px 28px', textDecoration: 'none', display: 'inline-block' }}>Sign up free</Link>
      </section>

      <footer style={{ borderTop: '1px solid #E7DFD4', marginTop: 40, padding: '40px 0 50px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>HERB<span style={{ color: '#E7A6B5' }}>.</span></div>
            <Link href="/" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>Recipes</Link>
            <a href="#team" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>About</a>
            <a href="#what-is-herb" style={{ fontSize: 13, color: '#5B5966', textDecoration: 'none' }}>What is Herb</a>
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
