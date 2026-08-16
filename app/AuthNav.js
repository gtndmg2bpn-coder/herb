'use client';
// app/AuthNav.js
// Client-side nav that knows the login session (the homepage itself is a
// server component and cannot). Logged out: Log in / Sign up.
// Logged in: the user's display name, Dashboard, and Log out.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../lib/supabaseBrowser';

export default function AuthNav() {
  const router = useRouter();
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

  // Render nothing until we know the session, so the nav doesn't flash
  // from "Log in" to the user's name on every page load.
  if (!ready) return null;

  return (
    <nav style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <Link href="/about">About us</Link>
      {name ? (
        <>
          <span>Hi, {name}</span>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/shopping">Shopping list</Link>
          <button type="button" onClick={signOut}>Log out</button>
        </>
      ) : (
        <>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
        </>
      )}
    </nav>
  );
}
