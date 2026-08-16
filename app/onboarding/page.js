'use client';
// app/onboarding/page.js

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { calculateTargets } from '../../lib/targets';
import { logWeight } from '../../lib/actions';

const SEX_OPTIONS = ['male', 'female', 'other'];
const ACTIVITY_OPTIONS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

// KIMI NOTE: pace tokens are the profiles.pace contract. Labels are microcopy-only; the
// stored value remains the small machine token.
const PACE_OPTIONS = [
  { value: 'steady', label: 'Steady — about 0.5% body weight per week' },
  { value: 'moderate', label: 'Moderate — about 0.75% body weight per week' },
  { value: 'faster', label: 'Faster — about 1% body weight per week, capped near 2 lb/week' },
];

// KIMI NOTE: conversion happens only at the input layer. Storage, validation, and target
// maths remain metric; constants are named so the imperial path is auditable.
const CM_PER_FOOT = 30.48;
const CM_PER_INCH = 2.54;
const LBS_PER_STONE = 14;
const KG_PER_LB = 0.45359237;

// KIMI NOTE: diet is a rule-set, not a goal. Keto is live; the other visible options are
// disabled roadmap placeholders and are never written.
const DIET_OPTIONS = [
  { value: 'keto', label: 'Keto', enabled: true, tag: '' },
  { value: 'mediterranean', label: 'Mediterranean', enabled: false, tag: 'coming soon' },
  { value: 'low_carb', label: 'Low-carb', enabled: false, tag: 'coming soon' },
  { value: 'vegetarian_keto', label: 'Vegetarian keto', enabled: false, tag: 'coming soon' },
];

// KIMI NOTE: allergens are the 14 UK declarables and are hard exclusions. Tokens are stored
// verbatim; only two display labels need friendlier wording.
const ALLERGEN_OPTIONS = [
  'celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk',
  'molluscs', 'mustard', 'tree nuts', 'peanuts', 'sesame', 'soya', 'sulphites',
];

// KIMI NOTE: dislikes are soft exclusions. This curated list covers common HERB blockers;
// the free-type box below merges into the same profiles.dislikes array.
const DISLIKE_OPTIONS = [
  'mushrooms', 'olives', 'coriander', 'blue cheese', 'goat’s cheese', 'anchovies',
  'sardines', 'mackerel', 'liver', 'kidney', 'black pudding', 'brussels sprouts',
  'cabbage', 'kale', 'beetroot', 'aubergine', 'courgette', 'fennel', 'gherkins', 'capers',
  'horseradish', 'onions', 'garlic', 'very spicy / chilli', 'tomatoes', 'peppers',
  'avocado', 'tofu', 'marmite / yeast extract', 'prawns',
];

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

function titleCaseToken(token) {
  return token
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function allergenLabel(token) {
  if (token === 'gluten') return 'Cereals containing gluten';
  if (token === 'sulphites') return 'Sulphur dioxide / sulphites';
  return titleCaseToken(token);
}

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
  const [avgDailyBurnKcal, setAvgDailyBurnKcal] = useState('');
  // KIMI NOTE: pace defaults to steady and is only meaningful/persisted for a loss goal.
  const [pace, setPace] = useState('steady');

  // KIMI NOTE: allergens and curated dislikes are independent tick-lists; dislikesText is
  // now only the "anything else" free-type box that merges into the final dislikes array.
  const [allergens, setAllergens] = useState([]);
  const [dislikeChoices, setDislikeChoices] = useState([]);
  const [dislikesText, setDislikesText] = useState('');

  // KIMI NOTE: units default to metric. Imperial inputs are kept as their raw ft/in and
  // st/lb strings so the user can type naturally; parsed below is the only canonical form.
  const [units, setUnits] = useState('metric');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [startStone, setStartStone] = useState('');
  const [startPounds, setStartPounds] = useState('');
  const [goalStone, setGoalStone] = useState('');
  const [goalPounds, setGoalPounds] = useState('');

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

  const parsed = useMemo(() => {
    if (units === 'imperial') {
      const heightCmImperial = numberOrZero(heightFeet) * CM_PER_FOOT + numberOrZero(heightInches) * CM_PER_INCH;
      const startWeightKgImperial = (numberOrZero(startStone) * LBS_PER_STONE + numberOrZero(startPounds)) * KG_PER_LB;
      const goalWeightKgImperial = (numberOrZero(goalStone) * LBS_PER_STONE + numberOrZero(goalPounds)) * KG_PER_LB;

      // KIMI NOTE: converted metric values are rounded before use — height to the nearest
      // whole cm, weight to 1 dp — matching the precision of the metric inputs they replace.
      return {
        heightCm: Math.round(heightCmImperial),
        startWeightKg: roundToOne(startWeightKgImperial),
        goalWeightKg: roundToOne(goalWeightKgImperial),
      };
    }

    return {
      heightCm: Number(heightCm),
      startWeightKg: Number(startWeightKg),
      goalWeightKg: Number(goalWeightKg),
    };
  }, [
    units,
    heightCm,
    startWeightKg,
    goalWeightKg,
    heightFeet,
    heightInches,
    startStone,
    startPounds,
    goalStone,
    goalPounds,
  ]);

  // KIMI NOTE: goal is derived from start vs goal weight rather than asked separately:
  // start > goal => 'lose weight', start < goal => 'gain weight', equal => 'maintain'.
  const goal = useMemo(() => {
    if (!parsed.startWeightKg || !parsed.goalWeightKg) return 'maintain';
    if (parsed.startWeightKg > parsed.goalWeightKg) return 'lose weight';
    if (parsed.startWeightKg < parsed.goalWeightKg) return 'gain weight';
    return 'maintain';
  }, [parsed.startWeightKg, parsed.goalWeightKg]);

  // KIMI NOTE: blank burn stays null; a supplied burn is stored as an integer kcal value.
  const avgDailyBurn = avgDailyBurnKcal.trim() === '' ? null : Math.round(Number(avgDailyBurnKcal));

  // KIMI NOTE: final dislikes = curated ticks + free-type entries split on commas, trimmed,
  // blanks dropped, then deduped with Set. Case is preserved exactly as typed rather than
  // normalised, because these are user-facing avoidance labels.
  const freeTypedDislikes = dislikesText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const dislikes = Array.from(new Set([...dislikeChoices, ...freeTypedDislikes]));

  if (checking || !session) return null;

  function toggleAllergen(token) {
    setAllergens((current) => (
      current.includes(token) ? current.filter((item) => item !== token) : [...current, token]
    ));
  }

  function toggleDislike(token) {
    setDislikeChoices((current) => (
      current.includes(token) ? current.filter((item) => item !== token) : [...current, token]
    ));
  }

  function validateIdentity() {
    if (!displayName.trim()) return 'Display name is required.';
    // KIMI NOTE: date_of_birth is required here because Part 6 target calculation needs age.
    if (!dob) return 'Date of birth is required.';
    if (new Date(dob) > new Date()) return 'Date of birth cannot be in the future.';
    if (!SEX_OPTIONS.includes(sex)) return 'Choose a sex option.';
    if (!ACTIVITY_OPTIONS.includes(activityLevel)) return 'Choose an activity level.';
    if (avgDailyBurnKcal.trim() !== '' && !(Number(avgDailyBurnKcal) > 0)) return 'Average daily burn must be a positive number of kcal, or left blank.';
    return '';
  }

  function validateBody() {
    if (units === 'imperial') {
      const imperialValues = [heightFeet, heightInches, startStone, startPounds, goalStone, goalPounds].map(numberOrZero);
      if (imperialValues.some((value) => value < 0)) return 'Imperial measurements cannot be negative.';
      if (!(numberOrZero(heightInches) >= 0 && numberOrZero(heightInches) < 12)) return 'Inches must be between 0 and 11.';
      if (!(numberOrZero(startPounds) >= 0 && numberOrZero(startPounds) < LBS_PER_STONE)) return 'Starting pounds must be between 0 and 13.';
      if (!(numberOrZero(goalPounds) >= 0 && numberOrZero(goalPounds) < LBS_PER_STONE)) return 'Goal pounds must be between 0 and 13.';
    }

    if (!(parsed.heightCm >= 100 && parsed.heightCm <= 250)) return 'Height must be between 100 and 250 cm.';
    if (!(parsed.startWeightKg >= 30 && parsed.startWeightKg <= 300)) return 'Starting weight must be between 30 and 300 kg.';
    if (!(parsed.goalWeightKg >= 30 && parsed.goalWeightKg <= 300)) return 'Goal weight must be between 30 and 300 kg.';
    if (goal === 'lose weight' && !PACE_OPTIONS.some((option) => option.value === pace)) return 'Choose a weight-loss pace.';
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

    const targets = calculateTargets({
      sex,
      date_of_birth: dob,
      height_cm: parsed.heightCm,
      weight_kg: parsed.startWeightKg,
      start_weight_kg: parsed.startWeightKg,
      goal_weight_kg: parsed.goalWeightKg,
      activity_level: activityLevel,
      pace,
      avg_daily_burn_kcal: avgDailyBurn,
    });

    // KIMI NOTE: write order is load-bearing. The starting weigh-in is inserted FIRST;
    // onboarded_at is set LAST, inside the profiles upsert, only after that dependent row
    // exists. Client-side supabase-js cannot wrap both writes in one transaction, so if
    // the weigh-in fails the gate stays closed and the wizard is safely re-runnable.
    // Routed through the log_weight RPC — the sole write path to the weight ledger.
    // The RPC derives user_id from auth.uid() internally and preserves the note, so
    // the 'Starting weight (onboarding)' provenance is kept. Order is still load-bearing:
    // the weigh-in lands FIRST and gates the profiles upsert below.
    const { error: weightError } = await logWeight({
      weightKg: parsed.startWeightKg,
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
      avg_daily_burn_kcal: avgDailyBurn,
      preferred_units: units,
      // KIMI NOTE: pace is persisted only for a loss goal; gain/maintain writes null so a
      // previous loss pace cannot go stale after the user changes direction.
      pace: goal === 'lose weight' ? pace : null,
      diet: 'keto',
      allergens,
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
        pace,
        avg_daily_burn_kcal: avgDailyBurn,
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

          <label style={{ display: 'grid', gap: 6 }}>
            Average daily calorie burn (kcal) — optional, if you know it
            <input
              type="number"
              min="1"
              step="1"
              value={avgDailyBurnKcal}
              onChange={(event) => setAvgDailyBurnKcal(event.target.value)}
              placeholder="Leave blank to use activity level"
            />
          </label>

          {/* KIMI NOTE: tracker affordance is visual roadmap only — one disabled element,
              no handler, no state, no DB column, placed beside activity level where a future
              tracker would refine effort. */}
          <div
            aria-disabled="true"
            style={{
              border: '1px dashed #bbb',
              borderRadius: 8,
              color: '#777',
              padding: '10px 12px',
              background: '#f7f7f7',
            }}
          >
            Connect a fitness tracker — coming soon
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 16 }}>
            <legend style={{ padding: 0, marginBottom: 6 }}>Units</legend>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="units" value="metric" checked={units === 'metric'} onChange={() => setUnits('metric')} />
              Metric (cm / kg)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="units" value="imperial" checked={units === 'imperial'} onChange={() => setUnits('imperial')} />
              Imperial (ft/in / st/lb)
            </label>
          </fieldset>

          {units === 'metric' ? (
            <>
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
            </>
          ) : (
            <>
              {/* KIMI NOTE: imperial layout keeps each dual input on one labelled row; the
                  visible inputs stay imperial while parsed.* remains the metric source of truth. */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span>Height</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 6, flex: 1 }}>
                    Feet
                    <input type="number" min="0" step="1" value={heightFeet} onChange={(event) => setHeightFeet(event.target.value)} required />
                  </label>
                  <label style={{ display: 'grid', gap: 6, flex: 1 }}>
                    Inches
                    <input type="number" min="0" max="11" step="1" value={heightInches} onChange={(event) => setHeightInches(event.target.value)} required />
                  </label>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <span>Starting weight</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 6, flex: 1 }}>
                    Stone
                    <input type="number" min="0" step="1" value={startStone} onChange={(event) => setStartStone(event.target.value)} required />
                  </label>
                  <label style={{ display: 'grid', gap: 6, flex: 1 }}>
                    Pounds
                    <input type="number" min="0" max="13" step="0.1" value={startPounds} onChange={(event) => setStartPounds(event.target.value)} required />
                  </label>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <span>Goal weight</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 6, flex: 1 }}>
                    Stone
                    <input type="number" min="0" step="1" value={goalStone} onChange={(event) => setGoalStone(event.target.value)} required />
                  </label>
                  <label style={{ display: 'grid', gap: 6, flex: 1 }}>
                    Pounds
                    <input type="number" min="0" max="13" step="0.1" value={goalPounds} onChange={(event) => setGoalPounds(event.target.value)} required />
                  </label>
                </div>
              </div>
            </>
          )}

          {goal === 'lose weight' ? (
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {/* KIMI NOTE: pace sits in Step 1 immediately after goal weight because it only
                  changes the loss deficit; radios match the existing sex control's choice style. */}
              <legend>Weight-loss pace</legend>
              {PACE_OPTIONS.map((option) => (
                <label key={option.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="pace"
                    value={option.value}
                    checked={pace === option.value}
                    onChange={() => setPace(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          ) : null}

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {/* KIMI NOTE: keto remains the only enabled diet and the stored value; other
                diets are visible but disabled roadmap rows, deliberately separate from goal. */}
            <legend>Diet</legend>
            {DIET_OPTIONS.map((option) => (
              <label
                key={option.value}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  color: option.enabled ? 'inherit' : '#777',
                }}
              >
                <input
                  type="radio"
                  name="diet"
                  value={option.value}
                  checked={option.value === 'keto'}
                  disabled={!option.enabled}
                  readOnly
                />
                {option.label}
                {option.tag ? <span style={{ fontSize: 12 }}>({option.tag})</span> : null}
              </label>
            ))}
          </fieldset>

          <p style={{ margin: 0, color: '#666' }}>Derived goal: {goal}</p>
        </section>
      ) : null}

      {step === 2 ? (
        <section style={{ display: 'grid', gap: 12 }}>
          {/* KIMI NOTE: helper line states the product rule plainly — allergens are hard
              exclusions everywhere; dislikes are avoided where possible but never treated as
              a safety constraint. */}
          <p style={{ margin: 0, color: '#666' }}>
            Allergens are excluded from every suggestion; dislikes are avoided where possible.
          </p>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            <legend>Allergens</legend>
            {/* KIMI NOTE: two-column checkbox grid keeps Step 2 compact while allowing the
                page to scroll naturally on small screens. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {ALLERGEN_OPTIONS.map((token) => (
                <label key={token} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allergens.includes(token)}
                    onChange={() => toggleAllergen(token)}
                  />
                  {allergenLabel(token)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            <legend>Dislikes</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {DISLIKE_OPTIONS.map((token) => (
                <label key={token} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={dislikeChoices.includes(token)}
                    onChange={() => toggleDislike(token)}
                  />
                  {token}
                </label>
              ))}
            </div>
          </fieldset>

          <label style={{ display: 'grid', gap: 6 }}>
            Anything else you'd rather avoid (comma-separated)
            <input
              value={dislikesText}
              onChange={(event) => setDislikesText(event.target.value)}
              placeholder="e.g. raw onion, sweetcorn"
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
