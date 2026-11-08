import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="s-wrap s-section" style={{ maxWidth: 720 }}>
      <p className="s-eyebrow">Page not found</p>
      <h1 className="s-h2">That page isn&rsquo;t here.</h1>
      <p className="s-lede">It may have moved, or the link may be wrong.</p>
      <div className="s-btns">
        <Link href="/recipes" className="s-btn s-btn-primary">Browse the recipes</Link>
        <Link href="/" className="s-btn s-btn-secondary">Go to the homepage</Link>
      </div>
    </main>
  );
}
