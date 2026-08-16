// app/about/page.js
import Link from 'next/link';

export const metadata = {
  title: 'About HERB',
  description: "Eating well shouldn't depend on your life going to plan.",
};

export default function AboutPage() {
  return (
    <main className="wrap">
      <div className="masthead">
        <h1>About HERB</h1>
        <p>Eating well shouldn&rsquo;t depend on your life going to plan.</p>
      </div>

      <div style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--ink)' }}>
        <p style={{ margin: '0 0 18px' }}>
          HERB isn&rsquo;t a tracker, and it isn&rsquo;t a diet app. Trackers make you
          log the past. Diet apps hand you rules and hope you&rsquo;ll behave. HERB does
          neither &mdash; it plans <em>with</em> you and bends <em>around</em> you, a
          food-shaped version of the way you already run your week. Just tell it what
          you fancy or what&rsquo;s in the fridge, and it sorts the rest.
        </p>

        <p style={{ margin: '0 0 18px' }}>
          Because plans change. Someone suggests the pub. You get called out for a
          client dinner. The 6pm you meant to cook at becomes 8pm. Most apps make that
          feel like failure &mdash; HERB just adapts. Tell it you&rsquo;re eating out and
          it quietly reshapes the rest of your programme around it, so one meal never
          derails your whole week. No guilt, no starting over on Monday. It&rsquo;ll even
          keep an eye on what your food costs, right down to the portion.
        </p>

        <p style={{ margin: 0 }}>
          Most trackers measure how well you stuck to the plan. HERB is built on the
          opposite idea: if a plan can&rsquo;t survive a normal, messy, real-life week,
          that&rsquo;s the plan&rsquo;s fault &mdash; not yours. So we built one that bends.
        </p>
      </div>

      <p
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: '-0.01em',
          margin: '28px 0 0',
          paddingTop: 24,
          borderTop: '1px solid var(--line)',
        }}
      >
        Eating well shouldn&rsquo;t depend on your life going to plan.
      </p>

      <nav style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 28 }}>
        <Link href="/" style={{ color: 'var(--muted)', fontSize: 14 }}>
          &larr; Back to recipes
        </Link>
        <Link
          href="/signup"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Sign up
        </Link>
      </nav>
    </main>
  );
}
