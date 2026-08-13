'use client';
// app/login/page.js

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);

    const supabase = getBrowserClient();
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });

    if (loginError) {
      setBusy(false);
      setError(loginError.message);
      return;
    }

    const { data: prof, error: profError } = await supabase
      .from('profiles')
      .select('onboarded_at')
      .eq('id', data.user.id)
      .maybeSingle();

    setBusy(false);

    if (profError) {
      setError(profError.message);
      return;
    }

    router.push(prof?.onboarded_at ? '/dashboard' : '/onboarding');
  }

  return (
    <main style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <h1>Log in to HERB</h1>
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
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error ? <p role="alert" style={{ color: '#b00020', margin: 0 }}>{error}</p> : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p>
        New here? <a href="/signup">Create an account</a>
      </p>
    </main>
  );
}
