'use client';
// app/dashboard/page.js

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';

export default function DashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentWeight, setCurrentWeight] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    async function boot() {
      // KIMI NOTE: same client-side guard pattern as onboarding; no middleware and no SSR
      // session exists in this repo, so protected pages check getSession() on mount and
      // render nothing until the check resolves.
      const supabase = getBrowserClient();
      const { data: { session: found } } = await supabase.auth.getSession();

      if (!alive) return;

      if (!found) {
        router.replace('/login');
        return;
      }

      setSession(found);

      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('display_name, start_weight_kg, goal_weight_kg, target_kcal, diet')
        .eq('id', found.user.id)
        .maybeSingle();

      if (!alive) return;
      if (profError) {
        setError(profError.message);
        setChecking(false);
        return;
      }

      const { data: weight, error: weightError } = await supabase
        .from('weight_current')
        .select('weight_kg')
        .eq('user_id', found.user.id)
        .maybeSingle();

      if (!alive) return;
      if (weightError) {
        setError(weightError.message);
        setChecking(false);
        return;
      }

      setProfile(prof);
      setCurrentWeight(weight?.weight_kg ?? null);
      setChecking(false);
    }

    boot();

    return () => {
      alive = false;
    };
  }, [router]);

  async function logout() {
    const supabase = getBrowserClient();
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    router.push('/login');
  }

  if (checking || !session) return null;

  return (
    <main style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
      <h1>HERB dashboard stub</h1>

      {error ? <p role="alert" style={{ color: '#b00020' }}>{error}</p> : null}

      {profile ? (
        <p>
          Welcome, {profile.display_name}. Start {profile.start_weight_kg} kg → Now{' '}
          {currentWeight ?? '—'} kg → Goal {profile.goal_weight_kg} kg. Daily target{' '}
          {profile.target_kcal ?? '—'} kcal ({profile.diet}).
        </p>
      ) : (
        <p>No profile found yet. Complete onboarding first.</p>
      )}

      <button type="button" onClick={logout}>Log out</button>
    </main>
  );
}
