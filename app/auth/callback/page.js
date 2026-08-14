'use client';
// app/auth/callback/page.js

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../../lib/supabaseBrowser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getBrowserClient();

    // If the confirmation link itself carried an error (e.g. expired/invalid),
    // Supabase redirects here with #error=...&error_description=... — surface it.
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash.includes('error')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      setError(params.get('error_description') || 'This link is invalid or has expired.');
      return;
    }

    let done = false;

    async function routeForSession(session) {
      if (done || !session) return;
      done = true;
      // Same fork as /login: onboarded users go to the dashboard, new ones onboard.
      const { data: prof } = await supabase
        .from('profiles')
        .select('onboarded_at')
        .eq('id', session.user.id)
        .maybeSingle();
      router.replace(prof?.onboarded_at ? '/dashboard' : '/onboarding');
    }

    // detectSessionInUrl parses the hash and fires SIGNED_IN once the session is set.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      routeForSession(session);
    });

    // Fallback: the session may already be present if detection completed
    // before the listener attached (getSession awaits URL processing).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) routeForSession(data.session);
    });

    // Safety net: if nothing resolves, send them to log in manually.
    const timer = setTimeout(() => {
      if (!done) setError('Could not complete sign-in automatically. Please log in.');
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <main style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      {error ? (
        <>
          <h1>Sign-in link problem</h1>
          <p role="alert" style={{ color: '#b00020', margin: 0 }}>{error}</p>
          <p style={{ marginTop: 16 }}>
            <a href="/login">Go to login</a>
          </p>
        </>
      ) : (
        <>
          <h1>Signing you in…</h1>
          <p>One moment while we confirm your account.</p>
        </>
      )}
    </main>
  );
}
