'use client';
// app/onboarding/page.js
//
// Five questions, then a plan (Karum, 8 Nov 2026): goal, you, size, goal weight,
// activity. Everything else lives under "Tailor your plan" (/tailor) and is asked
// only when the person wants it. One optional safety check on allergies sits at
// the end; it is skippable and is not a question about the plan.
//
// Writes: logWeight RPC first (the starting weigh-in), then the profiles upsert
// with onboarded_at set last, so a failed weigh-in leaves the wizard re-runnable.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { calculateTargets } from '../../lib/targets';
import { logWeight } from '../../lib/actions';
import { MODES, STEP_OPTIONS, modeByKey } from '../../lib/modes';

const SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

const CM_PER_FOOT = 30.48;
const CM_PER_INCH = 2.54;
const LBS_PER_STONE = 14;
const KG_PER_LB = 0.45359237;

// The 14 UK declarable allergens. Hard exclusions everywhere in the plan.
const ALLERGEN_OPTIONS = [
  'celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk',
  'molluscs', 'mustard', 'tree nuts', 'peanuts', 'sesame', 'soya', 'sulphites',
];
function allergenLabel(token) {
  if (token === 'tree nuts') return 'Tree nuts';
  if (token === 'sulphites') return 'Sulphites (SO₂)';
  return token.charAt(0).toUpperCase() + token.slice(1);
}

const QUESTIONS = ['Your goal', 'About you', 'Your size', 'Goal weight', 'Your activity'];
const LAST = QUESTIONS.length; // index of the optional allergy check

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round1(v) { return Math.round(v * 10) / 10; }

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [availableModes, setAvailableModes] = useState(['keto']);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('keto');
  const [sex, setSex] = useState('');
  const [dob, setDob] = useState('');
  const [units, setUnits] = useState('metric');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [goalKg, setGoalKg] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [weightStone, setWeightStone] = useState('');
  const [weightLb, setWeightLb] = useState('');
  const [goalStone, setGoalStone] = useState('');
  const [goalLb, setGoalLb] = useState('');
  const [steps, setSteps] = useState(null);
  const [gym, setGym] = useState(null);
  const [allergens, setAllergens] = useState([]);

  useEffect(() => {
    let alive = true;
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session: found } }) => {
      if (!alive) return;
      if (!found) { router.replace('/login'); return; }
      setSession(found);
      // A mode can only be chosen if its row exists in `diets` (the engine reads
      // its rules from there). Keto always exists. Others appear as they land.
      try {
        const { data } = await supabase.from('diets').select('key');
        const keys = (data || []).map((d) => d.key).filter((k) => MODES.some((m) => m.key === k));
        if (alive && keys.length) setAvailableModes(Array.from(new Set(['keto', ...keys])));
      } catch {}
      if (alive) setChecking(false);
    });
    return () => { alive = false; };
  }, [router]);

  const parsed = useMemo(() => {
    if (units === 'imperial') {
      return {
        heightCm: Math.round(num(heightFeet) * CM_PER_FOOT + num(heightInches) * CM_PER_INCH),
        weightKg: round1((num(weightStone) * LBS_PER_STONE + num(weightLb)) * KG_PER_LB),
        goalKg: round1((num(goalStone) * LBS_PER_STONE + num(goalLb)) * KG_PER_LB),
      };
    }
    return { heightCm: Number(heightCm), weightKg: Number(weightKg), goalKg: Number(goalKg) };
  }, [units, heightCm, weightKg, goalKg, heightFeet, heightInches, weightStone, weightLb, goalStone, goalLb]);

  const goal = useMemo(() => {
    if (!parsed.weightKg || !parsed.goalKg) return 'maintain';
    if (parsed.weightKg > parsed.goalKg) return 'lose weight';
    if (parsed.weightKg < parsed.goalKg) return 'gain weight';
    return 'maintain';
  }, [parsed.weightKg, parsed.goalKg]);

  const validators = [
    () => (availableModes.includes(mode) ? '' : 'Choose a goal.'),
    () => {
      if (!sex) return 'Choose one, so Herb can work out what you burn.';
      if (!dob) return 'Herb needs your date of birth to work out what you burn.';
      const d = new Date(dob);
      if (d > new Date()) return 'That date is in the future.';
      const age = (Date.now() - d.getTime()) / (365.25 * 86400000);
      if (age < 18) return 'Herb is for adults. It never sets a plan for anyone under 18.';
      if (age > 110) return 'Check the date of birth.';
      return '';
    },
    () => {
      if (units === 'imperial' && !(num(heightInches) >= 0 && num(heightInches) < 12)) return 'Inches run 0 to 11.';
      if (units === 'imperial' && !(num(weightLb) >= 0 && num(weightLb) < 14)) return 'Pounds run 0 to 13.';
      if (!(parsed.heightCm >= 100 && parsed.heightCm <= 250)) return 'Height needs to be between 100 and 250 cm.';
      if (!(parsed.weightKg >= 30 && parsed.weightKg <= 300)) return 'Weight needs to be between 30 and 300 kg.';
      return '';
    },
    () => {
      if (units === 'imperial' && !(num(goalLb) >= 0 && num(goalLb) < 14)) return 'Pounds run 0 to 13.';
      if (!(parsed.goalKg >= 30 && parsed.goalKg <= 300)) return 'Goal weight needs to be between 30 and 300 kg.';
      if (mode === 'muscle' && parsed.goalKg < parsed.weightKg) return 'Muscle gain means a small surplus. Set a goal weight at or above where you are now, or pick Calorie deficit.';
      return '';
    },
    () => (steps == null || gym == null ? 'Pick a steps band and how often you train.' : ''),
  ];

  const allValid = validators.every((v) => v() === '');
  const preview = allValid
    ? calculateTargets({
        sex, date_of_birth: dob, height_cm: parsed.heightCm,
        weight_kg: parsed.weightKg, start_weight_kg: parsed.weightKg, goal_weight_kg: parsed.goalKg,
        activity_level: 'sedentary', pace: 'steady',
        mode, avg_daily_steps: steps, gym_sessions_per_week: gym,
      })
    : null;

  if (checking || !session) return null;

  function next() {
    setError('');
    const msg = step < LAST ? validators[step]() : '';
    if (msg) { setError(msg); return; }
    setStep((s) => Math.min(LAST, s + 1));
  }
  function back() { setError(''); setStep((s) => Math.max(0, s - 1)); }
  function toggleAllergen(t) { setAllergens((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t])); }

  async function finish() {
    setError('');
    const firstBad = validators.map((v) => v()).find(Boolean);
    if (firstBad) { setError(firstBad); return; }
    setBusy(true);
    const supabase = getBrowserClient();
    const { data: { session: live } } = await supabase.auth.getSession();
    if (!live) { setBusy(false); router.replace('/login'); return; }

    const targets = calculateTargets({
      sex, date_of_birth: dob, height_cm: parsed.heightCm,
      weight_kg: parsed.weightKg, start_weight_kg: parsed.weightKg, goal_weight_kg: parsed.goalKg,
      activity_level: 'sedentary', pace: 'steady',
      mode, avg_daily_steps: steps, gym_sessions_per_week: gym,
    });

    const { error: weightError } = await logWeight({ weightKg: parsed.weightKg, note: 'Starting weight (onboarding)' });
    if (weightError) { setBusy(false); setError(weightError.message); return; }

    const now = new Date().toISOString();
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: live.user.id,
      email: live.user.email,
      display_name: (live.user.email || '').split('@')[0] || 'You',
      sex,
      date_of_birth: dob,
      height_cm: parsed.heightCm,
      weight_kg: parsed.weightKg,
      start_weight_kg: parsed.weightKg,
      goal_weight_kg: parsed.goalKg,
      goal,
      // Legacy field. The steps/gym answer replaces the multiplier in the
      // calculation; this stays populated so older code paths have a value.
      activity_level: 'sedentary',
      avg_daily_steps: steps,
      gym_sessions_per_week: gym,
      pace: goal === 'lose weight' ? 'steady' : null,
      diet: mode,
      preferred_units: units,
      allergens,
      target_kcal: targets.target_kcal,
      target_protein_g: targets.target_protein_g,
      target_carbs_g: targets.target_carbs_g,
      target_fat_g: targets.target_fat_g,
      onboarded_at: now,
      updated_at: now,
    }, { onConflict: 'id' });
    setBusy(false);
    if (profileError) { setError(profileError.message); return; }
    router.push('/dashboard');
  }

  const chosen = modeByKey(mode);

  return (
    <main className="ob">
      <div className="ob-top">
        <span className="s-eyebrow" style={{ margin: 0 }}>{step < LAST ? `Question ${step + 1} of ${LAST}` : 'One safety check'}</span>
        <div className="ob-dots" aria-hidden="true">
          {QUESTIONS.map((q, i) => <span key={q} className={i <= step ? 'on' : ''} />)}
        </div>
      </div>

      {step === 0 ? (
        <section>
          <h1 className="ob-h">What are you here to do?</h1>
          <p className="ob-sub">Pick one. You can change it later.</p>
          <div className="ob-cards" role="radiogroup" aria-label="Goal">
            {MODES.map((m) => {
              const on = availableModes.includes(m.key);
              return (
                <button
                  type="button" key={m.key} role="radio" aria-checked={mode === m.key}
                  className={`ob-card ${mode === m.key ? 'sel' : ''}`} disabled={!on}
                  onClick={() => on && setMode(m.key)}
                >
                  <b>{m.label}{!on ? <span className="ob-soon">Coming soon</span> : null}</b>
                  <span>{m.short}</span>
                </button>
              );
            })}
          </div>
          <p className="ob-note">{chosen.body}</p>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <h1 className="ob-h">A bit about you.</h1>
          <p className="ob-sub">Herb uses these to work out what your body burns at rest.</p>
          <div className="ob-pills" role="radiogroup" aria-label="Sex">
            {SEX_OPTIONS.map((o) => (
              <button type="button" key={o.value} role="radio" aria-checked={sex === o.value} className={`ob-pill ${sex === o.value ? 'sel' : ''}`} onClick={() => setSex(o.value)}>{o.label}</button>
            ))}
          </div>
          <label className="ob-field">
            <span>Date of birth</span>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h1 className="ob-h">Your height and weight.</h1>
          <div className="ob-pills" role="radiogroup" aria-label="Units">
            <button type="button" role="radio" aria-checked={units === 'metric'} className={`ob-pill ${units === 'metric' ? 'sel' : ''}`} onClick={() => setUnits('metric')}>cm &amp; kg</button>
            <button type="button" role="radio" aria-checked={units === 'imperial'} className={`ob-pill ${units === 'imperial' ? 'sel' : ''}`} onClick={() => setUnits('imperial')}>ft &amp; stone</button>
          </div>
          {units === 'metric' ? (
            <>
              <label className="ob-field"><span>Height (cm)</span><input type="number" inputMode="decimal" min="100" max="250" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} /></label>
              <label className="ob-field"><span>Weight today (kg)</span><input type="number" inputMode="decimal" min="30" max="300" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} /></label>
            </>
          ) : (
            <>
              <div className="ob-field"><span>Height</span>
                <div className="ob-pair">
                  <input type="number" inputMode="numeric" min="3" max="8" placeholder="ft" value={heightFeet} onChange={(e) => setHeightFeet(e.target.value)} aria-label="Feet" />
                  <input type="number" inputMode="numeric" min="0" max="11" placeholder="in" value={heightInches} onChange={(e) => setHeightInches(e.target.value)} aria-label="Inches" />
                </div>
              </div>
              <div className="ob-field"><span>Weight today</span>
                <div className="ob-pair">
                  <input type="number" inputMode="numeric" min="4" max="47" placeholder="st" value={weightStone} onChange={(e) => setWeightStone(e.target.value)} aria-label="Stone" />
                  <input type="number" inputMode="decimal" min="0" max="13.9" step="0.5" placeholder="lb" value={weightLb} onChange={(e) => setWeightLb(e.target.value)} aria-label="Pounds" />
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h1 className="ob-h">{mode === 'muscle' ? 'Where do you want to get to?' : 'What weight are you aiming for?'}</h1>
          <p className="ob-sub">
            {mode === 'muscle'
              ? 'Herb plans a small surplus, about 1% of body weight a month. Set a goal at or above today’s weight.'
              : 'Herb sets your calories a steady step below what you burn, and holds protein high so you keep muscle as you lose.'}
          </p>
          {units === 'metric' ? (
            <label className="ob-field"><span>Goal weight (kg)</span><input type="number" inputMode="decimal" min="30" max="300" step="0.1" value={goalKg} onChange={(e) => setGoalKg(e.target.value)} /></label>
          ) : (
            <div className="ob-field"><span>Goal weight</span>
              <div className="ob-pair">
                <input type="number" inputMode="numeric" min="4" max="47" placeholder="st" value={goalStone} onChange={(e) => setGoalStone(e.target.value)} aria-label="Stone" />
                <input type="number" inputMode="decimal" min="0" max="13.9" step="0.5" placeholder="lb" value={goalLb} onChange={(e) => setGoalLb(e.target.value)} aria-label="Pounds" />
              </div>
            </div>
          )}
          {parsed.weightKg && parsed.goalKg ? (
            <p className="ob-note">
              {goal === 'lose weight' ? `${round1(parsed.weightKg - parsed.goalKg)} kg to lose. Steady pace, roughly half a kilo a week.` : goal === 'gain weight' ? `${round1(parsed.goalKg - parsed.weightKg)} kg to gain.` : 'Holding steady. Herb plans at maintenance.'}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <h1 className="ob-h">How much do you move?</h1>
          <p className="ob-sub">Herb counts your steps and training as calories burned, on top of what your body uses at rest.</p>
          <p className="ob-label">Steps on a normal day</p>
          <div className="ob-cards" role="radiogroup" aria-label="Steps a day">
            {STEP_OPTIONS.map((o) => (
              <button type="button" key={o.value} role="radio" aria-checked={steps === o.value} className={`ob-card ${steps === o.value ? 'sel' : ''}`} onClick={() => setSteps(o.value)}>
                <b>{o.label}</b><span>{o.hint}</span>
              </button>
            ))}
          </div>
          <p className="ob-label">Gym or strength sessions a week</p>
          <div className="ob-pills" role="radiogroup" aria-label="Gym sessions a week">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={gym === n} className={`ob-pill ${gym === n ? 'sel' : ''}`} onClick={() => setGym(n)}>{n === 6 ? '6+' : n}</button>
            ))}
          </div>
          <p className="ob-note">A session counts as about an hour of moderate training. Tell Herb if that changes.</p>
        </section>
      ) : null}

      {step === LAST ? (
        <section>
          <h1 className="ob-h">Any allergies?</h1>
          <p className="ob-sub">Optional, but Herb will never put these in your plan. Skip if none.</p>
          <div className="ob-check">
            {ALLERGEN_OPTIONS.map((t) => (
              <label key={t} className={allergens.includes(t) ? 'sel' : ''}>
                <input type="checkbox" checked={allergens.includes(t)} onChange={() => toggleAllergen(t)} />
                {allergenLabel(t)}
              </label>
            ))}
          </div>
          {preview ? (
            <div className="ob-preview">
              <p className="s-eyebrow" style={{ marginBottom: 8 }}>Your daily targets · {chosen.label}</p>
              <div className="ob-preview-grid">
                <div><b>{preview.target_kcal.toLocaleString('en-GB')}</b><span>kcal</span></div>
                <div><b>{preview.target_protein_g}g</b><span>protein</span></div>
                <div><b>{preview.target_carbs_g}g</b><span>carbs</span></div>
                <div><b>{preview.target_fat_g}g</b><span>fat</span></div>
              </div>
              <p className="ob-note" style={{ marginTop: 10 }}>{chosen.targetsNote}</p>
            </div>
          ) : null}
          <p className="ob-note">Dislikes, pace, household size and more live under <b>Tailor your plan</b> once you&rsquo;re in.</p>
        </section>
      ) : null}

      {error ? <p role="alert" className="ob-error">{error}</p> : null}

      <div className="ob-nav">
        {step > 0 ? <button type="button" className="s-btn s-btn-secondary" onClick={back} disabled={busy}>Back</button> : <Link href="/" className="s-btn s-btn-secondary">Cancel</Link>}
        {step < LAST
          ? <button type="button" className="s-btn s-btn-primary" onClick={next} disabled={busy}>Next</button>
          : <button type="button" className="s-btn s-btn-primary" onClick={finish} disabled={busy}>{busy ? 'Saving…' : 'Finish'}</button>}
      </div>
    </main>
  );
}
