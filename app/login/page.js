'use client';
// app/login/page.js

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';

// Editorial split-screen auth layout, matching the Signup/Login design file.
// Left: full-bleed photography + gradient + serif quote. Right: the form pane.
// The pill toggle switches between /login and /signup (two real routes).

const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: MUTED,
  display: 'block',
};

const inputStyle = {
  width: '100%',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 15,
  fontFamily: 'inherit',
  marginTop: 6,
  boxSizing: 'border-box',
  background: '#fff',
  color: INK,
};

const primaryButtonStyle = {
  background: INK,
  color: CREAM,
  border: 'none',
  borderRadius: 100,
  padding: 14,
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  marginTop: 6,
  width: '100%',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setResetMessage('');
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

  // Sends a real Supabase password-reset email for the address in the email field.
  async function onForgotPassword() {
    setError('');
    setResetMessage('');
    if (!email.trim()) {
      setError('Enter your email above first, then tap "Forgot password?".');
      return;
    }
    setBusy(true);
    const supabase = getBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setResetMessage('Reset email sent — check your inbox and follow the link to set a new password.');
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', color: INK }}>
      <style>{`
        @media (max-width: 900px) {
          .auth-visual { display: none !important; }
          .auth-pane { max-width: none !important; padding: 40px 24px !important; }
        }
      `}</style>

      {/* Left: full-bleed photography with gradient + serif quote */}
      <div
        className="auth-visual"
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundImage: "url('/assets/tbone-pak-choi.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 44,
          boxSizing: 'border-box',
          minHeight: '100vh',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(42,41,50,.15) 0%, rgba(42,41,50,.55) 100%)' }} />
        <a href="/" style={{ position: 'relative', fontWeight: 800, fontSize: 28, color: CREAM, textDecoration: 'none' }}>
          HERB<span style={{ color: '#F3C6D0' }}>.</span>
        </a>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <p style={{ fontFamily: 'var(--font-newsreader), Georgia, serif', fontStyle: 'italic', fontWeight: 500, fontSize: 28, lineHeight: 1.3, color: CREAM, margin: 0 }}>
            Herb plans your week, tracks the macros and the cost, and rebalances when life gets in the way.
          </p>
        </div>
      </div>

      {/* Right: form pane */}
      <div
        className="auth-pane"
        style={{
          flex: 1,
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 60,
          boxSizing: 'border-box',
        }}
      >
        {/* Pill toggle */}
        <div style={{ display: 'flex', border: `1.5px solid ${HAIRLINE}`, borderRadius: 100, padding: 4, marginBottom: 36, width: 'fit-content' }}>
          <button
            type="button"
            style={{ border: 'none', borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: INK, color: CREAM }}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => router.push('/signup')}
            style={{ border: 'none', borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: INK }}
          >
            Sign up
          </button>
        </div>

        <h1 style={{ fontWeight: 800, fontSize: 32, letterSpacing: '-.03em', margin: 0 }}>Welcome back</h1>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 8 }}>Log in to see this week&rsquo;s plan.</p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
          <div>
            <label htmlFor="login-email" style={labelStyle}>Email</label>
            <input
              id="login-email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="login-password" style={labelStyle}>Password</label>
            <input
              id="login-password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          <div style={{ textAlign: 'right' }}>
            <span
              role="button"
              tabIndex={0}
              onClick={onForgotPassword}
              onKeyDown={(event) => { if (event.key === 'Enter') onForgotPassword(); }}
              style={{ fontSize: 13, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Forgot password?
            </span>
          </div>

          {error ? <p role="alert" style={{ color: '#b00020', margin: 0, fontSize: 14 }}>{error}</p> : null}
          {resetMessage ? <p role="status" style={{ color: '#1E3A52', margin: 0, fontSize: 14 }}>{resetMessage}</p> : null}

          <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'One moment…' : 'Log in'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: MUTED, marginTop: 28 }}>
          By continuing you agree to Herb&rsquo;s terms and privacy policy.
        </p>
      </div>
    </main>
  );
}
