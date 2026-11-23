// app/plan/_plan/planShared.js
'use client';

// Editorial design tokens (match dashboard / spend / recipe book)
export const INK = '#2A2932';
export const CREAM = '#FBF7F1';
export const MUTED = '#5B5966';
export const HAIRLINE = '#E7DFD4';
export const PINK = '#E7A6B5';
export const BLUE = '#8FBBD6';
export const GREEN = '#7BB88F';
export const AMBER = '#E9C067';

export const eyebrowStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 12,
};

// Every plannable meal, in day order. snack_am / snack_pm are separate slots so a
// morning and an afternoon snack can both sit on one date — plan_slots is unique on
// (user, date, meal), so they cannot share one 'snack' key. Both draw the same
// 'snack' recipe tag: a dish is tagged for what it IS, not for when it is eaten.
export const PLANNABLE_MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'snack_am',  label: 'Morning snack' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'snack_pm',  label: 'Afternoon snack' },
  { key: 'dinner',    label: 'Dinner' },
];

// The 14 UK major allergens. Codes MUST equal profiles.allergens /
// recipe_allergens.contains verbatim — they are matched, not displayed.
export const ALLERGENS = ['celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'tree_nuts', 'peanuts', 'sesame', 'soybeans', 'sulphites'];
export const ALLERGEN_LABELS = {
  celery: 'Celery', gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish',
  lupin: 'Lupin', milk: 'Milk', molluscs: 'Molluscs', mustard: 'Mustard', tree_nuts: 'Tree nuts',
  peanuts: 'Peanuts', sesame: 'Sesame', soybeans: 'Soybeans', sulphites: 'Sulphites',
};

// Cuisine + dish-type tags. These MUST equal recipes.cuisine / recipes.dish_type
// verbatim — they are matched against the column, not displayed from it, so a
// label change here without the matching UPDATE silently empties a chip.
//
// Two dimensions on purpose. "Indian" and "a salad" are different questions and
// people ask both: pick a cuisine to steer the week's flavour, pick a dish type
// to steer its shape. Either alone works; together they narrow.
export const CUISINE_TAGS = [
  'British & Classic', 'Italian', 'Indian', 'Thai', 'Asian', 'Spanish',
  'Mexican', 'Middle Eastern', 'Mediterranean', 'French', 'Anytime',
];
// 'Anytime' is not a cuisine — it is the honest label for the dishes that have
// none: shakes, yoghurt bowls, cottage cheese. Better a truthful bucket than
// pretending a protein shake is British.

export const DISH_TAGS = [
  { key: 'salad', label: 'Salads' },
  { key: 'grill', label: 'Grills & steaks' },
  { key: 'curry', label: 'Curries' },
  { key: 'pasta', label: 'Pasta' },
  { key: 'roast', label: 'Roasts & slow-cooked' },
  { key: 'stew', label: 'Stews' },
  { key: 'bowl', label: 'Bowls' },
  { key: 'breakfast', label: 'Breakfasts' },
  { key: 'shake', label: 'Shakes' },
  { key: 'board', label: 'Boards & snacks' },
];
export const DISH_LABEL = Object.fromEntries(DISH_TAGS.map((d) => [d.key, d.label]));

// One chip, used for cuisines, dish types and the week's allergens.
// 40px minimum height — a chip is a thumb control, not a footnote.
export function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', minHeight: 40,
        border: `1px solid ${on ? INK : HAIRLINE}`, background: on ? INK : '#fff',
        color: on ? CREAM : INK, borderRadius: 100, padding: '6px 14px',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

// Small pill toggle used for "Freezer first" and "Off meat".
export function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 40, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
    >
      <span style={{ width: 44, height: 24, borderRadius: 100, background: on ? GREEN : HAIRLINE, position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{label}</span>
    </button>
  );
}

export const inputStyle = {
    border: `1px solid ${HAIRLINE}`,
    background: CREAM,
    color: INK,
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
  };
