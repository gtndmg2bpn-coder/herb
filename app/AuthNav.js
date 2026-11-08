'use client';
// app/AuthNav.js
// One nav, two states.
// Visitors: Recipes · How it works · About · FAQ, with Log in / Start free. On a
//   phone the links fold into a menu button (before, they were simply hidden,
//   so a phone visitor had no way to reach any page but the homepage).
// Logged in: the app nav (Hi {name}, Plan, Recipes, Shopping list, Scan receipt).
// Hidden on the auth pages — those are full split-screen layouts with their own logo.
//
// The bar renders straight away for everyone; only the right-hand side waits for
// the session, so the page no longer jumps down when the nav appears.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getBrowserClient } from '../lib/supabaseBrowser';

const HIDDEN_ON = ['/login', '/signup'];

const PUBLIC_LINKS = [
  { href: '/recipes', label: 'Recipes' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
];

function MenuIcon({ open }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="#2A2932" strokeWidth="2" strokeLinecap="round" /></svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" stroke="#2A2932" strokeWidth="2" strokeLinecap="round" /></svg>
  );
}

export default function AuthNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!alive) return;
        if (session) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', session.user.id)
            .maybeSingle();
          if (!alive) return;
          setName(prof?.display_name || session.user.email || 'there');
        }
      } finally {
        if (alive) setReady(true);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  // Close the phone menu whenever the page changes.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  async function signOut() {
    await getBrowserClient().auth.signOut();
    setName(null);
    router.push('/');
    router.refresh();
  }

  if (HIDDEN_ON.includes(pathname)) return null;

  if (name) {
    return (
      <nav className="herb-nav" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', position: 'sticky', top: 0,
        background: 'rgba(251,247,241,.92)', backdropFilter: 'blur(12px)',
        zIndex: 100, borderBottom: '1px solid #E7DFD4',
      }}>
        <Link href="/dashboard" className="herb-nav-brand s-brand" style={{ fontSize: 24, flex: '0 0 auto' }}>
          HERB<span>.</span>
        </Link>
        <div className="herb-nav-links" style={{ fontSize: 14, fontWeight: 600, color: '#5B5966' }}>
          <Link href="/dashboard" style={{ color: '#2A2932', fontWeight: 700, textDecoration: 'none' }}>Hi, {name}</Link>
          <Link href="/plan" style={{ textDecoration: 'none', color: 'inherit' }}>Plan</Link>
          <Link href="/recipes" style={{ textDecoration: 'none', color: 'inherit' }}>Recipes</Link>
          <Link href="/shopping" style={{ textDecoration: 'none', color: 'inherit' }}>Shopping list</Link>
          <Link href="/capture" style={{ textDecoration: 'none', color: 'inherit' }}>Scan receipt</Link>
          <button
            type="button"
            onClick={signOut}
            style={{ border: '1.5px solid #2A2932', borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#2A2932', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Log out
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="s-nav" aria-label="Main">
      <div className="s-wrap">
        <div className="s-nav-bar">
          <Link href="/" className="s-brand" aria-label="Herb home">HERB<span>.</span></Link>
          <div className="s-nav-links">
            {PUBLIC_LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined}>{l.label}</Link>
            ))}
          </div>
          <div className="s-nav-actions" style={{ visibility: ready ? 'visible' : 'hidden' }}>
            <Link href="/login" className="s-nav-login">Log in</Link>
            <Link href="/signup" className="s-btn s-btn-primary">Start free</Link>
          </div>
          <button
            type="button"
            className="s-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
        {menuOpen ? (
          <div id="site-menu" className="s-menu-panel">
            {PUBLIC_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="s-menu-item">{l.label}</Link>
            ))}
            <div className="s-btns">
              <Link href="/signup" className="s-btn s-btn-primary">Start free</Link>
              <Link href="/login" className="s-btn s-btn-secondary">Log in</Link>
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
