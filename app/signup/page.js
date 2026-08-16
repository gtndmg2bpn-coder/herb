'use client';
// app/signup/page.js

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';

// Editorial split-screen auth layout, matching the Signup/Login design file.
// Left: full-bleed photography + gradient + serif quote. Right: the form pane.
// The pill toggle switches between /login and /signup (two real routes).
// The design file's 3-step mini-wizard is NOT reproduced here: the real app
// collects body/goal/allergen data in /onboarding after account creation,
// so this page stays account-only (email + password) with the same look.

const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';

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
            onClick={() => router.push('/login')}
            style={{ border: 'none', borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: INK }}
          >
            Log in
          </button>
          <button
            type="button"
            style={{ border: 'none', borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: INK, color: CREAM }}
          >
            Sign up
          </button>
        </div>

        {checkEmail ? (
          <>
            <h1 style={{ fontWeight: 800, fontSize: 32, letterSpacing: '-.03em', margin: 0 }}>Check your email</h1>
            <p style={{ fontSize: 14, color: MUTED, marginTop: 8, lineHeight: 1.6 }}>
              Confirm your account from the email we sent, then log in to set up your plan,
              pantry and targets.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              style={{ ...primaryButtonStyle, marginTop: 28 }}
            >
              Go to log in
            </button>
          </>
        ) : (
          <>
            <h1 style={{ fontWeight: 800, fontSize: 32, letterSpacing: '-.03em', margin: 0 }}>Create your account</h1>
            <p style={{ fontSize: 14, color: MUTED, marginTop: 8 }}>
              We&rsquo;ll use this to save your plan and pantry. Your goals and targets come next.
            </p>

            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
              <div>
                <label htmlFor="signup-email" style={labelStyle}>Email</label>
                <input
                  id="signup-email"
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
                <label htmlFor="signup-password" style={labelStyle}>Password</label>
                <input
                  id="signup-password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="8+ characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </div>

              {error ? <p role="alert" style={{ color: '#b00020', margin: 0, fontSize: 14 }}>{error}</p> : null}

              <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Creating account…' : 'Sign up'}
              </button>
            </form>
          </>
        )}

        <p style={{ fontSize: 13, color: MUTED, marginTop: 28 }}>
          By continuing you agree to Herb&rsquo;s terms and privacy policy.
        </p>
      </div>
    </main>
  );
}
