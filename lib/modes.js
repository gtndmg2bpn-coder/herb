// lib/modes.js
// The four ways of eating Herb plans for (Karum, 8 Nov 2026, decisions 1–8).
// Keys match rows in the `diets` table; the engine reads its numbers from that
// table, never from here. This file holds only what the person reads.
//
// Every sentence here must be true today. Where the evidence is in
// HERB_Evidence_Diet_Modes_20261108, the figure is quoted as it is there.

export const MODES = [
  {
    key: 'keto',
    label: 'Keto',
    short: 'Low carb, high protein, steady loss.',
    body: 'Carbs held around 28 g a day, protein first, calories set a steady step below what you burn. The whole recipe book fits this mode.',
    targetsNote: 'Carbs are pinned low and fat fills the rest of your calories.',
  },
  {
    key: 'deficit',
    label: 'Calorie deficit',
    short: 'Lose weight, carbs allowed.',
    body: 'Calories a steady step below what you burn, protein kept high so you keep muscle while you lose fat. Carbs are not restricted, so dishes can have their rice and potatoes back.',
    targetsNote: 'Protein stays high because, in a deficit, it is what protects muscle and keeps you full (ISSN 2017; Leidy 2015).',
  },
  {
    key: 'gut',
    label: 'Gut health',
    short: 'Fibre, variety and fermented foods.',
    body: 'Calories set from your goal weight, protein kept up, and a focus on 30 g of fibre a day (the UK guideline) and plenty of different plants through the week.',
    targetsNote: 'The 30 g fibre target is the SACN guideline for adults. “30 plants a week” is a helpful aim, not a proven threshold.',
  },
  {
    key: 'muscle',
    label: 'Muscle gain',
    short: 'A small surplus, protein first.',
    body: 'About 300 kcal a day above what you burn, which is a lean-bulk pace of roughly 1% of body weight a month, with protein kept high and your training counted.',
    targetsNote: 'A +300 kcal surplus adds muscle without much fat (Iraki 2019). Bigger surpluses mostly add fat.',
  },
];

export const MODE_KEYS = MODES.map((m) => m.key);

export function modeByKey(key) {
  return MODES.find((m) => m.key === key) || MODES[0];
}

// Step buckets for the activity question. Values are the midpoint Herb uses in
// the calculation (lib/targets.js: 0.45 kcal × kg × steps/1000, net of resting).
export const STEP_OPTIONS = [
  { value: 3000, label: 'Under 4,000', hint: 'Mostly sitting' },
  { value: 6000, label: '4,000 to 8,000', hint: 'A normal day with some walking' },
  { value: 10000, label: '8,000 to 12,000', hint: 'On your feet a lot, or a daily walk' },
  { value: 14000, label: 'Over 12,000', hint: 'Active job or long walks' },
];
