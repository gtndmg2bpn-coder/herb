'use client';
// app/AuthNav.js
// Editorial nav. Logged out: marketing nav (center links + Log in / Start free).
// Logged in: app nav (Hi {name}, Browse recipes, Shopping list, Log out).
// Hidden on the auth pages — those are full split-screen layouts with their
// own logo.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getBrowserClient } from '../lib/supabaseBrowser';

const HIDDEN_ON = ['/login', '/signup'];

export default function AuthNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState(null);

  useEffect(() => {
    let alive = true;

    async function load() {
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
      setReady(true);
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  async function signOut() {
    await getBrowserClient().auth.signOut();
    setName(null);
    router.push('/');
    router.refresh();
  }

  if (HIDDEN_ON.includes(pathname)) return null;
  // Render nothing until we know the session, so the nav doesn't flash
  // from "Log in" to the user's name on every page load.
  if (!ready) return null;

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: name ? '16px 32px' : '14px 32px',
      position: 'sticky', top: 0,
      background: 'rgba(251,247,241,.92)', backdropFilter: 'blur(12px)',
      zIndex: 100, borderBottom: '1px solid #E7DFD4',
    }}>
      <Link href="/" style={{
        fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1,
        fontSize: name ? 24 : 40, color: '#2A2932', textDecoration: 'none',
      }}>
        HERB<span style={{ color: '#E7A6B5' }}>.</span>
      </Link>

      {name ? (
        <div style={{ display: 'flex', gap: 24, fontSize: 14, fontWeight: 600, color: '#5B5966', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard" style={{ color: '#2A2932', fontWeight: 700, textDecoration: 'none' }}>Hi, {name}</Link>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>Browse recipes</Link>
          <Link href="/shopping" style={{ textDecoration: 'none', color: 'inherit' }}>Shopping list</Link>
          <button
            type="button"
            onClick={signOut}
            style={{ border: '1.5px solid #2A2932', borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#2A2932', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Log out
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 30, fontSize: 16, fontWeight: 600, color: '#5B5966' }} className="herb-nav-center">
            <Link href="/#recipes" style={{ textDecoration: 'none', color: 'inherit' }}>Recipes</Link>
            <Link href="/about" style={{ textDecoration: 'none', color: 'inherit' }}>About</Link>
            <Link href="/about" style={{ textDecoration: 'none', color: 'inherit' }}>What is Herb</Link>
            <Link href="/#blog" style={{ textDecoration: 'none', color: 'inherit' }}>Blog</Link>
            <Link href="/#faq" style={{ textDecoration: 'none', color: 'inherit' }}>FAQ</Link>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: 15, fontWeight: 600, color: '#2A2932', textDecoration: 'none' }}>Log in</Link>
            <Link href="/signup" style={{ border: '1.5px solid #2A2932', borderRadius: 100, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#2A2932', textDecoration: 'none' }}>
              Start free
            </Link>
          </div>
        </>
      )}
    </nav>
  );
}
