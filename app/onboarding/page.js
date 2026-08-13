'use client';
// app/onboarding/page.js

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { calculateTargets } from '../../lib/targets';

const SEX_OPTIONS = ['male', 'female', 'other'];
const ACTIVITY_OPTIONS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

export default function OnboardingPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  // KIMI NOTE: profiles.sex is free text in the database; these three tokens are the
  // app-level contract consumed by onboarding and the target calculation.
  const [sex, setSex] = useState('male');
  const [dob, setDob] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [startWeightKg, setStartWeightKg] = useState('');
  const [goalWeightKg, setGoalWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState('sedentary');
  const [dislikesText, setDislikesText] = useState('');

  useEffect(() => {
    let alive = true;

    // KIMI NOTE: client-side guard duplicated with dashboard rather than extracted into an
    // extra helper file, keeping the new-file list exact and avoiding protected UI flash.
    getBrowserClient().auth.getSession().then(({ data: { session: found } }) => {
      if (!alive) return;
      if (!found) {
        router.replace('/login');
        return;
      }
      setSession(found);
      setChecking(false);
    });

    return () => {
      alive = false;
    };
  }, [router]);

  const parsed = useMemo(() => ({
    heightCm: Number(heightCm),
    startWeightKg: Number(startWeightKg),
    goalWeightKg: Number(goalWeightKg),
  }), [heightCm, startWeightKg, goalWeightKg]);

  // KIMI NOTE: goal is derived from start vs goal weight rather than asked separately:
  // start > goal => 'lose weight', start < goal => 'gain weight', equal => 'maintain'.
  const goal = useMemo(() => {
    if (!parsed.startWeightKg || !parsed.goalWeightKg) return 'maintain';
    if (parsed.startWeightKg > parsed.goalWeightKg) return 'lose weight';
    if (parsed.startWeightKg < parsed.goalWeightKg) return 'gain weight';
    return 'maintain';
  }, [parsed.startWeightKg, parsed.goalWeightKg]);

  if (checking || !session) return null;

  function validateIdentity() {
    if (!displayName.trim()) return 'Display name is required.';
    // KIMI NOTE: date_of_birth is required here because Part 6 target calculation needs age.
    if (!dob) return 'Date of birth is required.';
    if (new Date(dob) > new Date()) return 'Date of birth cannot be in the future.';
    if (!SEX_OPTIONS.includes(sex)) return 'Choose a sex option.';
    if (!ACTIVITY_OPTIONS.includes(activityLevel)) return 'Choose an activity level.';
    return '';
  }

  function validateBody() {
    if (!(parsed.heightCm >= 100 && parsed.heightCm <= 250)) return 'Height must be between 100 and 250 cm.';
    if (!(parsed.startWeightKg >= 30 && parsed.startWeightKg <= 300)) return 'Starting weight must be between 30 and 300 kg.';
    if (!(parsed.goalWeightKg >= 30 && parsed.goalWeightKg <= 300)) return 'Goal weight must be between 30 and 300 kg.';
    return '';
  }

  function nextStep() {
    setError('');
    const message = step === 0 ? validateIdentity() : step === 1 ? validateBody() : '';
    if (message) {
      setError(message);
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  }

  function previousStep() {
    setError('');
    setStep((current) => Math.max(0, current - 1));
  }

  async function finish() {
    setError('');

    const identityError = validateIdentity();
    const bodyError = validateBody();
    if (identityError || bodyError) {
      setError(identityError || bodyError);
      return;
    }

    setBusy(true);

    const supabase = getBrowserClient();
    const { data: { session: liveSession } } = await supabase.auth.getSession();

    if (!liveSession) {
      setBusy(false);
      router.replace('/login');
      return;
    }

    const uid = liveSession.user.id;
    const dislikes = dislikesText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const targets = calculateTargets({
      sex,
      date_of_birth: dob,
      height_cm: parsed.heightCm,
      weight_kg: parsed.startWeightKg,
      start_weight_kg: parsed.startWeightKg,
      goal_weight_kg: parsed.goalWeightKg,
      activity_level: activityLevel,
    });

    // KIMI NOTE: write order is load-bearing. The starting weigh-in is inserted FIRST;
    // onboarded_at is set LAST, inside the profiles upsert, only after that dependent row
    // exists. Client-side supabase-js cannot wrap both writes in one transaction, so if
    // the weigh-in fails the gate stays closed and the wizard is safely re-runnable.
    const { error: weightError } = await supabase.from('weight_log').insert({
      user_id: uid,
      weight_kg: parsed.startWeightKg,
      note: 'Starting weight (onboarding)',
    });

    if (weightError) {
      setBusy(false);
      setError(weightError.message);
      return;
    }

    // KIMI NOTE: profiles is an UPSERT keyed on id because this database may or may not
    // have an auth trigger that pre-creates the row. This works in both cases and never
    // writes another user's row because id is the session user's auth.users.id.
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: uid,
      email: liveSession.user.email,
      display_name: displayName.trim(),
      sex,
      date_of_birth: dob,
      height_cm: parsed.heightCm,
      weight_kg: parsed.startWeightKg,
      start_weight_kg: parsed.startWeightKg,
      goal_weight_kg: parsed.goalWeightKg,
      goal,
      activity_level: activityLevel,
      diet: 'keto',
      dislikes,
      ...targets,
      onboarded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    setBusy(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    router.push('/dashboard');
  }

  const previewTargets = validateIdentity() || validateBody()
    ? null
    : calculateTargets({
        sex,
        date_of_birth: dob,
        height_cm: parsed.heightCm,
        weight_kg: parsed.startWeightKg,
        start_weight_kg: parsed.startWeightKg,
        goal_weight_kg: parsed.goalWeightKg,
        activity_level: activityLevel,
      });

  return (
    <main style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
      <h1>Set up HERB</h1>
      <p style={{ color: '#666' }}>Step {step + 1} of 3</p>

      {step === 0 ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            What should HERB call you?
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            <legend>Sex</legend>
            {SEX_OPTIONS.map((option) => (
              <label key={option} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="sex"
                  value={option}
                  checked={sex === option}
                  onChange={() => setSex(option)}
                />
                {option}
              </label>
            ))}
          </fieldset>

          <label style={{ display: 'grid', gap: 6 }}>
            Date of birth
            <input type="date" value={dob} onChange={(event) => setDob(event.target.value)} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            Activity level
            <select value={activityLevel} onChange={(event) => setActivityLevel(event.target.value)}>
              {ACTIVITY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {step === 1 ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            Height (cm)
            <input type="number" min="100" max="250" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            Starting weight (kg)
            <input type="number" min="30" max="300" step="0.1" value={startWeightKg} onChange={(event) => setStartWeightKg(event.target.value)} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            Goal weight (kg)
            <input type="number" min="30" max="300" step="0.1" value={goalWeightKg} onChange={(event) => setGoalWeightKg(event.target.value)} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            Diet
            <input value="keto" readOnly />
          </label>

          <p style={{ margin: 0, color: '#666' }}>Derived goal: {goal}</p>
        </section>
      ) : null}

      {step === 2 ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            Dislikes (optional, comma-separated)
            <input
              value={dislikesText}
              onChange={(event) => setDislikesText(event.target.value)}
              placeholder="mushrooms, olives, coriander"
            />
          </label>

          {previewTargets ? (
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <strong>Daily targets</strong>
              <p style={{ margin: '8px 0 0' }}>
                {previewTargets.target_kcal} kcal · protein {previewTargets.target_protein_g} g · carbs{' '}
                {previewTargets.target_carbs_g} g · fat {previewTargets.target_fat_g} g
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? <p role="alert" style={{ color: '#b00020' }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {step > 0 ? <button type="button" onClick={previousStep} disabled={busy}>Back</button> : null}
        {step < 2 ? <button type="button" onClick={nextStep} disabled={busy}>Next</button> : null}
        {step === 2 ? (
          <button type="button" onClick={finish} disabled={busy}>
            {busy ? 'Saving…' : 'Finish'}
          </button>
        ) : null}
      </div>
    </main>
  );
}
