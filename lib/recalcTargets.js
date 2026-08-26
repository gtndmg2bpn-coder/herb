// lib/recalcTargets.js
// The adaptive-targets brain. Pure function — no React, no Supabase, no I/O — so it can
// be graded in isolation and stays builder-safe, exactly like lib/targets.js.
//
// It re-runs the SINGLE shared calculator (lib/targets.calculateTargets) against a DRIVER
// weight derived from recent weigh-ins, compares the result to the user's stored targets,
// and returns a PROPOSE-ONLY object. It NEVER writes. The commit is a deliberate user tap
// that routes through commitTargets -> the commit_targets RPC.
//
// Why a JS brain and not a server route or a SQL RPC: the app has no authenticated server
// context (anon client only; the service-role key is forbidden), and the target maths must
// live in exactly one place — calculateTargets. Running recalc in JS against that one
// function keeps a single source of truth; re-implementing it in plpgsql would fork it.
// The dashboard (client) reads profile + weight_log under RLS and hands them in.

import { calculateTargets } from './targets';

const DRIVER_FRESH_DAYS = 14;       // a reading older than this can't pair into the mean
const PROPOSE_THRESHOLD_KCAL = 25;  // below this kcal move, no proposal — just "unchanged"

function daysAgo(iso, now) {
  return (now.getTime() - new Date(iso).getTime()) / 86400000;
}

// profile: the stored profiles row (static fields + current stored targets).
// readings: array of { weight_kg, created_at } in ANY order (raw weight_log rows are fine).
// now: injectable clock for testing.
export function recalcTargets({ profile, readings, now = new Date() }) {
  if (!profile) return { status: 'UNCHANGED', reason: 'no profile' };

  const sorted = (readings || [])
    .filter((r) => r && r.weight_kg != null && r.created_at)
    .map((r) => ({ kg: Number(r.weight_kg), at: r.created_at, ageDays: daysAgo(r.created_at, now) }))
    .sort((a, b) => new Date(b.at) - new Date(a.at)); // most recent first

  if (sorted.length === 0) return { status: 'UNCHANGED', reason: 'no weigh-ins' };

  const latest = sorted[0];
  const prev = sorted[1] || null;
  const stale = latest.ageDays > DRIVER_FRESH_DAYS; // latest itself is old — targets hold

  // Driver weight: mean of the last two readings when BOTH are fresh (<=14d); otherwise
  // the latest reading alone. A stale previous reading is dropped, not averaged in.
  let driverWeightKg;
  let readingsUsed;
  if (prev && prev.ageDays <= DRIVER_FRESH_DAYS && latest.ageDays <= DRIVER_FRESH_DAYS) {
    driverWeightKg = (latest.kg + prev.kg) / 2;
    readingsUsed = 2;
  } else {
    driverWeightKg = latest.kg;
    readingsUsed = 1;
  }
  driverWeightKg = Math.round(driverWeightKg * 100) / 100;

  const weightDeltaKg = prev ? Math.round((latest.kg - prev.kg) * 100) / 100 : 0;

  const old = {
    target_kcal: profile.target_kcal ?? null,
    target_protein_g: profile.target_protein_g ?? null,
    target_carbs_g: profile.target_carbs_g ?? null,
    target_fat_g: profile.target_fat_g ?? null,
  };

  // Re-run the ONE shared calculator, re-anchored to the driver weight. Passing it as
  // start_weight_kg re-anchors BOTH the TDEE and the pace deficit to current weight, and
  // protein (2.0 x driver) tracks it — exactly how the calculator treats start_weight_kg.
  // goal / height / sex / dob / activity / pace / burn are the static set-once fields.
  const next = calculateTargets({
    sex: profile.sex,
    date_of_birth: profile.date_of_birth,
    height_cm: profile.height_cm,
    weight_kg: driverWeightKg,
    start_weight_kg: driverWeightKg,
    goal_weight_kg: profile.goal_weight_kg,
    activity_level: profile.activity_level,
    pace: profile.pace,
    avg_daily_burn_kcal: profile.avg_daily_burn_kcal,
  });

  // Goal reached = a loss journey whose driver weight has met/passed the goal. The
  // calculator already returns maintenance (deficit 0) in that case; this is just the
  // label the card uses to switch to the celebration copy.
  const goalKg = profile.goal_weight_kg != null ? Number(profile.goal_weight_kg) : null;
  const startKg = profile.start_weight_kg != null ? Number(profile.start_weight_kg) : null;
  const isLossGoal = goalKg != null && startKg != null && goalKg < startKg;
  const goalReached = isLossGoal && driverWeightKg <= goalKg;

  const kcalMove = old.target_kcal == null ? Infinity : Math.abs(next.target_kcal - old.target_kcal);
  const thresholdMet = kcalMove >= PROPOSE_THRESHOLD_KCAL;

  let status;
  if (goalReached) status = 'GOAL_REACHED';
  else if (thresholdMet) status = 'PROPOSE';
  else status = 'UNCHANGED';

  return {
    status,                 // 'PROPOSE' | 'UNCHANGED' | 'GOAL_REACHED'
    driverWeightKg,
    weightDeltaKg,          // latest vs previous reading, for display only
    readingsUsed,           // 1 or 2
    stale,                  // latest reading older than 14 days
    thresholdMet,
    kcalMove: kcalMove === Infinity ? null : kcalMove,
    old,
    new: next,
  };
}
