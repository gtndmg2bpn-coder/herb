// test/allergenCoverage.test.js — run: node test/allergenCoverage.test.js
//
// Allergen coverage guard (Job 1, Karum approved 15 Nov 2026).
// HARD RULE: a dish with a declared allergen must never reach a user who
// declared it. recipe_allergens reads ingredients.allergens, so an EMPTY
// array reads as "contains nothing" — which is only true once a human has
// checked the pack and said so. An empty array that nobody reviewed is not
// "no allergens"; it is "unknown", and unknown is how the August miss
// (Blue cheese dressing, milk) shipped.
//
// A check that cannot fail is not a check: this test FAILS while any
// ingredient used by a LIVE recipe has an empty allergens array with no
// explicit 'none' marker. Chef Herb's review pass marks reviewed-clean
// rows as {none}; the test then goes green and stays green as the gate.
//
// CI note: the workflow runs this with PLACEHOLDER Supabase env vars, where
// it prints SKIP and passes (the live check is run against the real project
// by the builder). Ruling 15 Nov 2026: never call a run "verified" without
// green CI AND the live run stated.

const assert = require('assert');

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isPlaceholder = !url || !anonKey || url === PLACEHOLDER_URL || anonKey === 'placeholder';

if (isPlaceholder) {
  console.log('SKIP allergenCoverage: placeholder Supabase env vars — run against the live project to enforce.');
  process.exit(0);
}

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, anonKey);

  // Ingredient ids used by at least one live recipe, with their allergen arrays.
  const { data: rows, error } = await supabase
    .from('recipe_ingredients')
    .select('ingredient_id, ingredients!inner(id, name, allergens), recipes!inner(status)')
    .eq('recipes.status', 'live');

  if (error) {
    console.error(`FAIL allergenCoverage: query error — ${error.message} (state which check could not run)`);
    process.exit(1);
  }

  const byIngredient = new Map();
  for (const row of rows || []) {
    const ing = row.ingredients;
    if (ing && !byIngredient.has(ing.id)) byIngredient.set(ing.id, ing);
  }

  const offenders = [...byIngredient.values()].filter((ing) => {
    const a = ing.allergens;
    const empty = a == null || a.length === 0;
    const markedNone = Array.isArray(a) && a.includes('none');
    return empty && !markedNone;
  });

  offenders.sort((a, b) => a.name.localeCompare(b.name));

  if (offenders.length > 0) {
    console.error(`FAIL allergenCoverage: ${offenders.length} ingredient(s) used by live recipes have an unreviewed empty allergens array:`);
    for (const ing of offenders) console.error(`  - ${ing.name} (${ing.id})`);
    console.error("Mark each reviewed-clean row as {none}, or add the declared allergens from the pack label.");
    process.exit(1);
  }

  assert.strictEqual(offenders.length, 0);
  console.log('allergenCoverage: every live-recipe ingredient has declared allergens or an explicit {none} marker.');
})().catch((err) => {
  console.error(`FAIL allergenCoverage: ${err.message}`);
  process.exit(1);
});
