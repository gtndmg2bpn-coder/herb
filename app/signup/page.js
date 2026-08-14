'use client';
// app/signup/page.js

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    const supabase = getBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // KIMI NOTE: this fork is essential. If email confirmation is ON there is no session,
    // so no profile write is attempted here; RLS would reject it. The profile is written
    // only in onboarding, after login/confirmation produces an active session.
    if (data.session) {
      router.push('/onboarding');
    } else {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <main style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
        <h1>Check your email</h1>
        <p>Confirm your account from the email we sent, then log in to start onboarding.</p>
        <p>
          <a href="/login">Go to login</a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <h1>Create your HERB account</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>

        {error ? <p role="alert" style={{ color: '#b00020', margin: 0 }}>{error}</p> : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
