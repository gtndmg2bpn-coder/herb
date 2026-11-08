// lib/recipeDisplay.js
// Pure display rules for the public site: section labels, the shop window,
// dish of the week, method steps, cost format. No Supabase, no React, so it can
// be tested with plain node (lib/recipeDisplay.test.js).

const SECTION_ORDER = [
  'breakfast', 'salads', 'mains', 'curries', 'stews', 'bowls', 'pasta',
  'soups', 'puddings', 'snacks', 'shakes',
];

const SECTION_LABELS = {
  breakfast: 'Breakfast',
  salads: 'Salads',
  mains: 'Mains',
  curries: 'Curries',
  stews: 'Stews',
  bowls: 'Bowls',
  pasta: 'Edamame pasta',
  soups: 'Soups',
  puddings: 'Puddings',
  snacks: 'Snacks',
  shakes: 'Shakes & smoothies',
};

function sectionLabel(section) {
  if (!section) return 'Recipe';
  return SECTION_LABELS[section] || section.charAt(0).toUpperCase() + section.slice(1);
}

// Sections that are meals. Shakes and snacks are useful but they are not
// what someone judges a food platform on, so they stay out of the shop window.
const MEAL_SECTIONS = new Set(['breakfast', 'salads', 'mains', 'curries', 'stews', 'bowls', 'pasta', 'soups']);

// Karum, 8 Nov: the shop window is low calorie, high protein, everyday food.
// Short ribs and sirloin are luxuries — in the book, not on the front.
const SHOP_WINDOW_RULES = { maxKcal: 550, minProtein: 30, maxCarbs: 12, maxCost: 3.5, perSection: 2 };

function proteinPer100Kcal(r) {
  if (!r || !r.kcal || r.protein_g == null) return 0;
  return (Number(r.protein_g) / Number(r.kcal)) * 100;
}

function pickShopWindow(recipes, n = 6, rules = SHOP_WINDOW_RULES) {
  const eligible = (recipes || [])
    .filter((r) => MEAL_SECTIONS.has(r.section))
    .filter((r) => r.kcal != null && r.kcal <= rules.maxKcal)
    .filter((r) => r.protein_g != null && r.protein_g >= rules.minProtein)
    .filter((r) => r.carbs_g == null || Number(r.carbs_g) <= rules.maxCarbs)
    .filter((r) => r.cost_gbp == null || Number(r.cost_gbp) <= rules.maxCost)
    .sort((a, b) => proteinPer100Kcal(b) - proteinPer100Kcal(a) || a.name.localeCompare(b.name));

  const perSection = {};
  const picked = [];
  for (const r of eligible) {
    if (picked.length >= n) break;
    const count = perSection[r.section] || 0;
    if (count >= rules.perSection) continue;
    perSection[r.section] = count + 1;
    picked.push(r);
  }
  return picked;
}

// Dish of the week: rotates through the shop window by ISO week, so it changes
// every Monday without anyone having to remember to change it.
function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function dishOfTheWeek(shopWindow, date = new Date()) {
  if (!shopWindow || shopWindow.length === 0) return null;
  return shopWindow[isoWeek(date) % shopWindow.length];
}

// Method text arrives as numbered lines ("1. Brown the ribs"). The page numbers
// its own steps, so strip the typed number or every step reads "1. 1.".
function methodSteps(method) {
  if (!method) return [];
  return method
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^(step\s*)?\d+\s*[.):-]\s*/i, ''));
}

function formatCost(gbp) {
  return gbp == null ? '—' : `£${Number(gbp).toFixed(2)}`;
}

module.exports = {
  SECTION_ORDER, SECTION_LABELS, sectionLabel, SHOP_WINDOW_RULES, proteinPer100Kcal,
  pickShopWindow, isoWeek, dishOfTheWeek, methodSteps, formatCost,
};
