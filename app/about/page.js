// app/about/page.js
import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="wrap">
      <div className="masthead">
        <h1>About HERB</h1>
        <p>Coming soon.</p>
        <nav style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </div>
    </main>
  );
}
