// lib/demoLogin.js
// DEV-PHASE ONLY (Karum, 22–23 Nov 2026: "development phase, no sign up
// required"). Per-person demo mode: every browser silently claims its own
// throwaway demo account (credentials kept in localStorage), gets a seeded
// sample profile, and lands on a live generated week — no more everyone
// sharing Dave's data.
//
// TWO DEPENDENCIES, both founder-side:
//  1. "Confirm email" must be OFF in Supabase auth settings, or signUp returns
//     no session. While it is ON (or the shared-SMTP hourly cap bites), the
//     code falls back to the shared Dave test login so the button never
//     dead-ends.
//  2. Demo accounts accumulate in auth.users — the parked QA-cleanup job
//     purges them before launch. Remove this file and its call sites then.
//
// The credentials live in the bundle by design: they identify throwaway demo
// rows on a dev deployment, NOT a production pattern.
import { getBrowserClient } from './supabaseBrowser';
import { calculateTargets } from './targets';
import { logWeight } from './actions';
import { generatePlan } from './generatePlan';
import { isoDate } from './dates';

const STORAGE_KEY = 'herb_demo_account_v1';

// Fallback only — used when silent account creation is unavailable.
export const DEMO_EMAIL = 'karumsandhu+herbtest2@gmail.com';
export const DEMO_PASSWORD = 'herb-demo-2026';

// The sample person every fresh demo gets. Fixed and believable; nothing real.
const SAMPLE = {
  display_name: 'Sam',
  sex: 'male',
  dob: '1988-06-12',
  heightCm: 176,
  startKg: 84,
  goalKg: 80,
  activity: 'light',
  pace: 'steady',
};

const MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner'];

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Seed the fresh demo account so the app is ALIVE on first view: profile with
// targets, a starting weigh-in, and this week's plan generated through the same
// engine + RPCs the plan page uses. Mirrors the plan page's default
// constraints (all five windows, no outs, no batching, no exclusions).
async function seedDemoProfile(supabase, uid, email) {
  const targets = calculateTargets({
    sex: SAMPLE.sex,
    date_of_birth: SAMPLE.dob,
    height_cm: SAMPLE.heightCm,
    weight_kg: SAMPLE.startKg,
    start_weight_kg: SAMPLE.startKg,
    goal_weight_kg: SAMPLE.goalKg,
    activity_level: SAMPLE.activity,
    pace: SAMPLE.pace,
    avg_daily_burn_kcal: null,
  });

  const { error: weightError } = await logWeight({
    weightKg: SAMPLE.startKg,
    note: 'Starting weight (demo)',
  });
  if (weightError) return weightError;

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: uid,
    email,
    display_name: SAMPLE.display_name,
    sex: SAMPLE.sex,
    date_of_birth: SAMPLE.dob,
    height_cm: SAMPLE.heightCm,
    weight_kg: SAMPLE.startKg,
    start_weight_kg: SAMPLE.startKg,
    goal_weight_kg: SAMPLE.goalKg,
    goal: 'lose weight',
    activity_level: SAMPLE.activity,
    avg_daily_burn_kcal: null,
    preferred_units: 'metric',
    pace: SAMPLE.pace,
    diet: 'keto',
    allergens: [],
    dislikes: [],
    liked_cuisines: [],
    disliked_cuisines: [],
    meal_windows: MEALS,
    target_kcal: targets.target_kcal,
    target_protein_g: targets.target_protein_g,
    target_carbs_g: targets.target_carbs_g,
    target_fat_g: targets.target_fat_g,
    onboarded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (profileError) return profileError;

  return generateDemoWeek(supabase);
}

// One generated week for the demo, through the real engine: save default
// constraints, read the assembled inputs, filter the pool for allergens,
// generate, apply. Same path as the plan page's Generate button.
async function generateDemoWeek(supabase) {
  const weekStart = isoDate(new Date());
  const constraints = {
    meals_to_plan: MEALS,
    outs: [],
    batch_days: [],
    appetite: {
      avoid_meat: false,
      cuisines: [],
      dish_types: [],
      cuisine: null,
      avoid_allergens: [],
      include_recipe_ids: [],
    },
    allergens: [],
    exclude_recipe_ids: [],
    guests: [],
    household: 1,
  };
  const { error: saveError } = await supabase.rpc('save_plan_constraints', {
    p_week_start: weekStart,
    p_constraints: constraints,
  });
  if (saveError) return saveError;

  const { data: inputs, error: inputsError } = await supabase.rpc('get_plan_inputs', {
    p_week_start: weekStart,
  });
  if (inputsError) return inputsError;

  const { data: allergenRows } = await supabase
    .from('recipe_allergens')
    .select('recipe_id, contains');
  const byId = Object.fromEntries((allergenRows || []).map((r) => [r.recipe_id, r.contains || []]));
  const pool = (inputs.recipes || []).map((r) => ({ ...r, allergens: byId[r.id] || [] }));

  const result = generatePlan(
    { ...inputs.constraints, targets: inputs.targets || null, diet: inputs.diet || null },
    inputs.inventory,
    pool,
    { weekStart },
  );

  const { error: applyError } = await supabase.rpc('apply_generated_plan', {
    p_week_start: weekStart,
    p_slots: result.slots,
  });
  return applyError || null;
}

// Returns { error } — error is null on success. On success the caller reloads
// so every page loads against the fresh session.
export async function signInAsDemo() {
  const supabase = getBrowserClient();

  // 1. This browser already has its own demo account — sign straight in.
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.email && saved.password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: saved.email,
        password: saved.password,
      });
      if (!error) return { error: null };
      // Bad stored creds (e.g. account purged) — recreate below.
    }
  } catch { /* fall through */ }

  // 2. Fresh throwaway account. Needs "Confirm email" OFF (see header).
  const id = randomHex(6);
  const email = `demo-${id}@herb-demo.co.uk`;
  const password = `Demo-${randomHex(4)}!K2`;
  const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !data || !data.session) {
    // Silent creation unavailable — fall back to the shared Dave login rather
    // than dead-ending the demo button.
    const fallback = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    return { error: fallback.error };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
  const seedError = await seedDemoProfile(supabase, data.session.user.id, email);
  return { error: seedError };
}
