// app/dashboard/_dash/dashShared.js — split from app/dashboard/page.js (spec v2 pantry refresh)

export const MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner'];
// Display only — the stored values are the keys above.
export const MEAL_LABELS = {
  breakfast: 'Breakfast', snack_am: 'Morning snack', lunch: 'Lunch',
  snack_pm: 'Afternoon snack', dinner: 'Dinner', snack: 'Snack',
};
export const LOCATIONS = ['fridge', 'freezer', 'cupboard'];
export const SPEND_CATEGORIES = ['grocery', 'eating_out', 'sundry'];
// The 14 UK major allergens.
// These codes are written to profiles.allergens and matched, verbatim, against
// recipe_allergens.contains — so they MUST equal the data's canonical codes.
// tree_nuts / soybeans are the canonical forms (were shipped as nuts / soy,
// which matched nothing and silently filtered nothing).
export const ALLERGENS = ['celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'tree_nuts', 'peanuts', 'sesame', 'soybeans', 'sulphites'];

// KIMI NOTE: cuisine preference buckets — 10 buckets INCLUDING 'British & Classic',
// EXCLUDING 'Anytime' (Anytime means "no cuisine" — shakes and bowls — so disliking
// it would empty breakfast/snack slots; Karum, 16 Nov 2026). Tokens equal
// recipes.cuisine verbatim — matched, never mapped, same contract discipline as
// allergens. 'British & Classic' is included now so its dislikes survive the future
// category split.
export const CUISINES = [
  'British & Classic', 'Italian', 'Indian', 'Thai', 'Asian', 'Spanish',
  'Mexican', 'Middle Eastern', 'Mediterranean', 'French',
];

// Readable labels for display only — never written to the DB, never matched.
export const ALLERGEN_LABELS = {
  celery: 'Celery',
  gluten: 'Gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  lupin: 'Lupin',
  milk: 'Milk',
  molluscs: 'Molluscs',
  mustard: 'Mustard',
  tree_nuts: 'Tree nuts',
  peanuts: 'Peanuts',
  sesame: 'Sesame',
  soybeans: 'Soya',
  sulphites: 'Sulphites',
};

// Editorial design tokens
export const INK = '#2A2932';
export const CREAM = '#FBF7F1';
export const MUTED = '#5B5966';
export const HAIRLINE = '#E7DFD4';
export const PINK = '#E7A6B5';
export const BLUE = '#8FBBD6';
export const GREEN = '#5E7A63';

// Pastel washes: meal slots and pantry appliances, from the design file.
export const MEAL_WASHES = {
  breakfast: 'linear-gradient(155deg,#F1E7D5,#F7F0E2)',
  snack_am: 'linear-gradient(155deg,#F6EDE0,#FBF6EE)',
  lunch: 'linear-gradient(155deg,#C8E6C9,#E8F5E9)',
  snack_pm: 'linear-gradient(155deg,#E4F0E5,#F1F8F1)',
  dinner: 'linear-gradient(155deg,#BCD7E9,#DCEBF3)',
  snack: 'linear-gradient(155deg,#F6EDE0,#FBF6EE)',
};
// KIMI NOTE: age is computed from date_of_birth at render, never stored — it stays
// correct on the user's birthday without any update job. Same arithmetic as
// lib/targets.js ageFromDob; duplicated here rather than imported because the
// dashboard is a client component and targets.js stays a pure builder-safe lib.
export function ageFromDob(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

export function dayLabelShort(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

export function money(pence) {
  if (pence == null) return '—';
  return `£${(Number(pence) / 100).toFixed(2)}`;
}

export function poundsToPence(value) {
  if (value === '' || value == null) return null;
  const pounds = Number(value);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

export function optionalNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatWeight(weightKg, units) {
  if (weightKg == null) return '—';
  if (units === 'imperial') {
    const totalLb = Number(weightKg) * 2.2046226218;
    let stone = Math.floor(totalLb / 14);
    let pounds = Math.round(totalLb - stone * 14);
    // Rounding can push pounds to 14 (e.g. 76.20 kg = 167.99 lb) —
    // roll over into the stone so we never print "N st 14 lb".
    if (pounds === 14) { stone += 1; pounds = 0; }
    return `${stone} st ${pounds} lb`;
  }
  return `${Number(weightKg).toFixed(1)} kg`;
}

// Signed weight delta for the check-in card. Deltas read cleanest as a single unit
// (lb or kg), not st+lb, so this stays flat rather than reusing formatWeight.
export function formatDelta(deltaKg, units) {
  if (deltaKg == null) return null;
  const sign = deltaKg <= 0 ? '\u2212' : '+'; // minus sign / plus
  if (units === 'imperial') {
    return `${sign}${(Math.abs(deltaKg) * 2.2046226218).toFixed(1)} lb`;
  }
  return `${sign}${Math.abs(deltaKg).toFixed(1)} kg`;
}

export function slotKey(slotDate, meal) {
  return `${slotDate}|${meal}`;
}

// Linear regression over a weight series (index-based), used for the
// predicted trend line and the goal ETA on the progress chart.
export function linreg(ys) {
  const n = ys.length;
  const sx = ys.reduce((s, _, i) => s + i, 0);
  const sy = ys.reduce((s, y) => s + y, 0);
  const sxy = ys.reduce((s, y, i) => s + i * y, 0);
  const sxx = ys.reduce((s, _, i) => s + i * i, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope };
}

export const CHART_W = 320;
export const CHART_H = 130;
export const CHART_PAD = 4;
export const PREDICT_WEEKS = 8;

export function buildChart(history, goalKg) {
  const n = history.length;
  const totalWeeks = n - 1 + PREDICT_WEEKS;
  const { slope } = linreg(history.slice(Math.max(0, n - 6)));
  const intAtFull = history[n - 1] - slope * (n - 1);

  const predicted = [];
  for (let i = n - 1; i <= totalWeeks; i += 1) predicted.push(intAtFull + slope * i);

  const allVals = goalKg != null ? history.concat(predicted, [goalKg]) : history.concat(predicted);
  const yMin = Math.min(...allVals) - 0.6;
  const yMax = Math.max(...allVals) + 0.6;
  const xStep = (CHART_W - CHART_PAD * 2) / totalWeeks;
  const yFor = (kg) => CHART_PAD + (CHART_H - CHART_PAD * 2) * (1 - (kg - yMin) / (yMax - yMin));

  const actualPts = history.map((kg, i) => [CHART_PAD + i * xStep, yFor(kg)]);
  const predictedPts = predicted.map((kg, i) => [CHART_PAD + (n - 1 + i) * xStep, yFor(kg)]);
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  // ETA: weeks until the predicted line crosses the goal, in whichever
  // direction the goal sits (loss or gain).
  let etaLabel = null;
  if (goalKg != null && Math.abs(slope) > 0.02) {
    const movingToward = (goalKg < history[n - 1] && slope < 0) || (goalKg > history[n - 1] && slope > 0);
    if (movingToward) {
      const weeksToGoal = (goalKg - intAtFull) / slope - (n - 1);
      if (weeksToGoal > 0) {
        etaLabel = weeksToGoal <= PREDICT_WEEKS
          ? `On track: ~${Math.round(weeksToGoal)}w to goal`
          : `~${Math.round(weeksToGoal)}w to goal at this pace`;
      }
    }
  }

  const last = actualPts[actualPts.length - 1];
  return {
    actualPath: toPath(actualPts),
    predictedPath: toPath(predictedPts),
    lastX: last[0],
    lastY: last[1],
    goalY: goalKg != null ? yFor(goalKg) : null,
    goalTextY: goalKg != null ? yFor(goalKg) - 5 : null,
    etaLabel,
  };
}

// Shared Editorial input styles
export const inputStyle = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: '#fff',
  color: INK,
  boxSizing: 'border-box',
};

export const darkPillButton = {
  background: INK,
  color: CREAM,
  border: 'none',
  borderRadius: 100,
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export const outlinePillButton = {
  background: 'transparent',
  color: INK,
  border: `1.5px solid ${HAIRLINE}`,
  borderRadius: 100,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// Tiny underlined action link used inside meal chips and pantry rows.
export function ChipAction({ onClick, disabled, children, colour = MUTED }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : (event) => { if (event.key === 'Enter') onClick(); }}
      style={{ fontSize: 9, fontWeight: 700, textDecoration: 'underline', color: disabled ? '#B9B6C2' : colour, cursor: disabled ? 'default' : 'pointer' }}
    >
      {children}
    </span>
  );
}
