// app/plan/_plan/planGenerate.js

import { getBrowserClient } from '../../../lib/supabaseBrowser';
import { generatePlan } from '../../../lib/generatePlan';
import { planComponents } from '../../../lib/planComponents';

// KIMI NOTE: module split (2026-11-24) — verbatim from the single-file
// build; closures read the per-render deps bag (fresh every render, so
// no stale-closure change from the original component-scope functions).
export function createPlanGenerate(deps) {
  const {
    avoidMeat, batchDays, dislikedCuisines, dislikedIds,
    guests, includeIds, likedCuisines, mealsToPlan,
    outs, profileAllergens, refreshSlots, setDirty,
    setError, setGenerating, setLastSave, setPlanResult,
    userId, weekAllergens, weekCuisines, weekDishTypes,
    weekStart,
  } = deps;

  async function generateNow(useSeed) {
    setGenerating(true);
    setError(null);
    setPlanResult(null);
    try {
      const supabase = getBrowserClient();
      const constraints = {
        meals_to_plan: mealsToPlan,
        outs: outs,
        batch_days: batchDays,
        appetite: {
          avoid_meat: avoidMeat,
          cuisines: weekCuisines,                  // steers lunch + dinner only
          dish_types: weekDishTypes,               // steers lunch + dinner only
          cuisine: null,                           // retired free-text field
          avoid_allergens: weekAllergens,          // this week only
          include_recipe_ids: includeIds,          // empty = the whole book
        },
        allergens: profileAllergens,               // PERMANENT — the planner must never violate these
        exclude_recipe_ids: dislikedIds,           // PERMANENT
        guests: guests.filter((g) => g.date && g.meal && g.count > 0),
        household: 1,
      };
      const { error: saveErr } = await supabase.rpc('save_plan_constraints', {
        p_week_start: weekStart, p_constraints: constraints,
      });
      if (saveErr) throw saveErr;

      const { data: inputs, error: readErr } = await supabase.rpc('get_plan_inputs', {
        p_week_start: weekStart,
      });
      if (readErr) throw readErr;

      // ── BRIDGE ITEM 3 — the client-side merge is RETIRED.
      //
      // get_plan_inputs now selects meal_type, meal_types, cuisine and dish_type
      // itself, so the pool arrives complete and this page no longer re-reads
      // `recipes` to patch it. That removes the second derivation of the recipe
      // pool: one query, one shape, one source of truth.
      //
      // It also removes a real failure mode. The old merge was best-effort — a
      // silent catch — so a failed read meant every recipe fell back to
      // ['lunch','dinner'], the breakfast pool emptied, and the week came back
      // with seven blank breakfasts and no explanation anywhere.
      const recipePool0 = inputs.recipes || [];

      let recipePool = recipePool0;

      // Allergens are matched against recipe_allergens.contains, exactly as the
      // dashboard's Swap chooser does. If this read fails we must NOT plan blind —
      // an unfiltered plan could propose a declared allergen — so we stop instead.
      const { data: allergenRows, error: allergenErr } = await supabase
        .from('recipe_allergens')
        .select('recipe_id, contains');
      if (allergenErr) throw allergenErr;
      const allergensById = Object.fromEntries((allergenRows || []).map((row) => [row.recipe_id, row.contains || []]));
      recipePool = recipePool.map((r) => ({ ...r, allergens: allergensById[r.id] || [] }));

      // KIMI NOTE: disliked cuisines are a HARD exclusion, allergen-style (Karum,
      // 16 Nov 2026). The pool is pre-filtered here — the same place
      // disliked_recipe_ids already binds — so the engine needs NO cuisine-dislike
      // knowledge, and a disliked dish in the freezer stays there.
      const dislikedCuisineSet = new Set(dislikedCuisines);
      recipePool = recipePool.filter((r) => !dislikedCuisineSet.has(r.cuisine));

      // ── BRIDGE ITEMS 4 + 6 — targets reach the engine ────────────────────
      // get_plan_inputs v4 returns `targets` read LIVE from profiles on every
      // call. That is item 6 in one line: commit_targets writes profiles,
      // get_plan_inputs reads profiles, so the next plan generated after a
      // commit uses the new numbers. There is no cached copy to invalidate and
      // nothing here to remember to refresh.
      //
      // Merging them into the constraints object is NOT the retired
      // client-side merge — both halves came out of the same RPC call, so
      // there is still exactly one derivation. What was wrong before was
      // re-reading `recipes` separately and patching the pool with it.
      //
      // `diet` (v5) carries the carb ceiling. 35 g/day belongs to keto, not to
      // HERB, so the engine holds no diet knowledge at all and takes whatever
      // ceiling arrives here — including none, which is a real answer for a
      // plain deficit or a bulk.
      const planConstraints = {
        ...inputs.constraints,
        targets: inputs.targets || null,
        diet: inputs.diet || null,
      };
      // KIMI NOTE: PROFILE LIKES AS A PERMANENT DEFAULT (Karum, 16 Nov 2026). The
      // manual weekly steer (appetite.cuisines, restored from the saved week above)
      // takes precedence by construction: likes are handed to the engine as
      // appetite.preferred_cuisines, which the engine applies ONLY when no manual
      // cuisine steer is set — and soft-falls back to the full book when the liked
      // pool cannot fill the week. They are injected here, not saved into
      // plan_weeks.constraints, so a dashboard edit takes effect on the very next
      // plan without re-saving the week.
      planConstraints.appetite = {
        ...(planConstraints.appetite || {}),
        preferred_cuisines: likedCuisines,
      };

      const result = generatePlan(planConstraints, inputs.inventory, recipePool, {
        weekStart, seed: useSeed,
      });

      const { data: applied, error: applyErr } = await supabase.rpc('apply_generated_plan', {
        p_week_start: weekStart, p_slots: result.slots,
      });
      if (applyErr) throw applyErr;

      // ── COMPONENT (prep) PLANNING ────────────────────────────────────────
      // Runs AFTER the plan exists, and that order is not incidental: component
      // demand is a CONSEQUENCE of which dishes landed on which days, so it
      // cannot be known before there is a plan to read.
      //
      // Best-effort on purpose. A component is a convenience — it saves money
      // and a shop — so a failed read must never cost you the week. That is the
      // opposite of the allergen read above, which throws rather than plan
      // blind. Convenience degrades; safety stops.
      let componentPlan = null;
      try {
        const [{ data: compRows }, { data: inputRows }] = await Promise.all([
          supabase.from('components')
            .select('id, name, produces_ingredient_id, yield_qty, yield_unit, shelf_life_days, location')
            .eq('active', true),
          supabase.from('component_inputs').select('component_id, ingredient_id, quantity, unit'),
        ]);
        const producible = [...new Set((compRows || []).map((c) => c.produces_ingredient_id))];
        const plannedIds = [...new Set(result.slots.filter((s) => s.recipe_id).map((s) => s.recipe_id))];

        if (producible.length && plannedIds.length) {
          const inputsByComponent = {};
          for (const row of inputRows || []) {
            (inputsByComponent[row.component_id] ||= []).push({
              ingredient_id: row.ingredient_id, quantity: Number(row.quantity),
            });
          }
          const components = (compRows || []).map((c) => ({
            ...c,
            yield_qty: Number(c.yield_qty),
            shelf_life_days: Number(c.shelf_life_days),
            inputs: inputsByComponent[c.id] || [],
          }));

          // Only the producible ingredients, and only for dishes that actually
          // landed. Asking for the whole join would pull ~390 rows to use six.
          const { data: riRows } = await supabase
            .from('recipe_ingredients')
            .select('recipe_id, ingredient_id, quantity')
            .in('recipe_id', plannedIds)
            .in('ingredient_id', producible);
          const needsByRecipe = {};
          for (const row of riRows || []) {
            (needsByRecipe[row.recipe_id] ||= []).push({
              ingredient_id: row.ingredient_id, quantity: Number(row.quantity),
            });
          }

          // Existing stock of the produced ingredient. Netted per
          // (ingredient, expiry_date) — deliberately the SAME bucket shape as
          // get_plan_inputs and eat_portions use for portions. A lot is a lot;
          // the write path and the planner must agree on what one is.
          const { data: stockRows } = await supabase
            .from('pantry_log')
            .select('ingredient_id, quantity, expiry_date')
            .eq('user_id', userId)
            .eq('item_kind', 'ingredient')
            .in('ingredient_id', producible);
          const buckets = {};
          for (const row of stockRows || []) {
            const key = `${row.ingredient_id}|${row.expiry_date || ''}`;
            buckets[key] ||= { ingredient_id: row.ingredient_id, expiry_date: row.expiry_date, quantity: 0 };
            buckets[key].quantity += Number(row.quantity);
          }
          const stock = Object.values(buckets).filter((l) => l.quantity > 0);

          componentPlan = planComponents(result.slots, needsByRecipe, components, stock, {
            weekStart, batchDays,
          });
        }
      } catch { /* a component is a convenience — never lose the week over one */ }

      // ── BRIDGE ITEM 6 — stamp what this week was planned AGAINST ─────────
      // Without this, "did my new targets reach the plan?" can only be
      // answered by regenerating and squinting. The week now records the
      // numbers it was built on, so a week planned under old targets is
      // identifiable rather than merely suspected.
      //
      // Best-effort on purpose, and the reasoning is the component rule again:
      // the plan is already written and applied by this point, so failing to
      // record a stamp must not present as a failed plan. Convenience
      // degrades; safety stops.
      try {
        await supabase.rpc('save_plan_constraints', {
          p_week_start: weekStart,
          p_constraints: {
            ...constraints,
            planned_against: {
              targets: inputs.targets || null,
              diet: inputs.diet || null,
              carb_ceiling_g: result.macroSummary?.carb_ceiling_g ?? null,
              at: new Date().toISOString(),
            },
          },
        });
      } catch { /* the plan is already saved; the stamp is a nicety */ }

      setPlanResult({
        rationale: result.rationale || [],
        slotsWritten: applied?.slots_written ?? 0,
        components: componentPlan,
        macros: result.macroSummary || null,
      });
      setLastSave('generated');
      setDirty(false);
      await refreshSlots();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setGenerating(false);
    }
  }
  return { generateNow };
}
