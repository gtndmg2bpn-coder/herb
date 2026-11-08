// app/faq/page.js
import Link from 'next/link';
import { FAQS } from '../../lib/siteCopy';
import SiteFooter from '../../components/site/SiteFooter';

export const metadata = { title: 'FAQ · HERB', description: 'Straight answers about how Herb plans, sizes and costs your food.' };

export default function FaqPage() {
  return (
    <>
      <main className="s-wrap s-section" style={{ maxWidth: 860 }}>
        <p className="s-eyebrow">FAQ</p>
        <h1 className="s-h2">The honest answers.</h1>
        <p className="s-lede">If something here isn&rsquo;t built yet, it says so.</p>
        <div className="s-faq">
          {FAQS.map((f) => (
            <details key={f.id} id={f.id}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <div className="s-btns">
          <Link href="/signup" className="s-btn s-btn-primary">Start free</Link>
          <Link href="/recipes" className="s-btn s-btn-secondary">Browse the recipes</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
