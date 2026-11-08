// components/site/SiteFooter.js
// Every link here goes to a page that exists. Nothing is a dead label.
import Link from 'next/link';
import { REFERENCE_LABEL } from '../../lib/referenceAdult';

export default function SiteFooter() {
  return (
    <footer className="s-footer">
      <div className="s-wrap">
        <div className="s-footer-grid">
          <div>
            <Link href="/" className="s-brand" style={{ padding: 0 }}>HERB<span>.</span></Link>
            <p className="s-small" style={{ marginTop: 12, maxWidth: '32ch', lineHeight: 1.6 }}>
              Eat well, even when life doesn&rsquo;t go to plan. Built in Cornwall.
            </p>
          </div>
          <div>
            <h4>Herb</h4>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/recipes">Recipes</Link>
            <Link href="/about">About</Link>
          </div>
          <div>
            <h4>Help</h4>
            <Link href="/faq">FAQ</Link>
            <Link href="/faq#figures">Where the figures come from</Link>
            <Link href="/faq#allergens">Allergens</Link>
          </div>
          <div>
            <h4>Account</h4>
            <Link href="/signup">Start free</Link>
            <Link href="/login">Log in</Link>
          </div>
        </div>
        <div className="s-footer-note">
          <span>&copy; {new Date().getFullYear()} Herb</span>
          <span>Recipe figures are per portion, {REFERENCE_LABEL.toLowerCase()}, unless you&rsquo;re logged in.</span>
        </div>
      </div>
    </footer>
  );
}
