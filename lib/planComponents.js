// lib/planComponents.js
//
// HERB — the COMPONENT (prep) scheduler.
//
// PURE FUNCTION. Same contract as generatePlan: no DB, no clock, no I/O.
//
// ── What a component is, and why it is neither a recipe nor an ingredient ──
//
// A roast chicken is not a meal. Nobody plans "roast chicken" for Tuesday and
// eats it; they roast a bird once and it turns up inside six different dishes
// across the week as `Cooked chicken, pulled`. It is an INGREDIENT that HERB can
// PRODUCE instead of buy.
//
// That distinction is the whole model:
//
//   recipe     -> occupies a plan SLOT, measured in PORTIONS, capped at 2 slots
//                 a week (the 2-and-2 rule), banked as cooked_portion lots.
//   component  -> occupies NO slot, measured in GRAMS, has no slot cap at all,
//                 banked as an ordinary INGREDIENT lot with an expiry.
//
// So the 2-and-2 rule genuinely does not apply — there is nothing to apply it
// to. What binds a component is its SHELF LIFE: five days from the day it is
// cooked. If a dish that needs pulled chicken lands on day 6, that dish is not
// covered by Sunday's bird and the plan must say so rather than quietly assume
// the fridge is magic.
//
// The generalisation is deliberate. `Cooked chicken, pulled` is the first
// component; a pasta base sauce, a curry base, roasted veg or cooked cauli rice
// are all the same object with different numbers. Nothing below mentions
// chicken.
//
// ── Where it sits in the pipeline ──
//
//   generatePlan()  -> slots are placed (which dish, which day)
//   planComponents()-> reads those slots, works out component demand, schedules
//                      the prep cooks, and reports what it cannot cover
//   shopping list   -> buys the component's INPUTS (a whole bird) instead of the
//                      bought form (pre-cooked slices), when a cook is scheduled
//
// It runs AFTER generatePlan on purpose. Demand is a consequence of the plan,
// so it cannot be known before the plan exists.

const DEFAULT_SHELF_LIFE_DAYS = 5;

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

/**
 * @param {Array}  slots       generatePlan's output slots (source, recipe_id, slot_date)
 * @param {Object} needsByRecipe  { recipe_id: [{ ingredient_id, quantity }] }
 *                                only COMPONENT-PRODUCIBLE ingredients belong here
 * @param {Array}  components  [{ id, name, produces_ingredient_id, yield_qty,
 *                                shelf_life_days, inputs:[{ingredient_id,quantity}] }]
 * @param {Array}  stock       existing ingredient lots:
 *                             [{ ingredient_id, quantity, expiry_date }]
 * @param {Object} opts        { weekStart, batchDays: [iso], today }
 * @returns {{cooks:Array, coverage:Array, shortfalls:Array, rationale:Array}}
 */
function planComponents(slots, needsByRecipe, components, stock, opts) {
  // maxCooksPerDay is an OVEN constraint, not a calendar one: two birds fit,
  // five do not. Configurable because a slow cooker or a bigger oven changes it.
  const { weekStart, batchDays = [], maxCooksPerDay = 2 } = opts;
  const maxPerDay = maxCooksPerDay;
  const rationale = [];
  const cooks = [];
  const coverage = [];
  const shortfalls = [];

  const byIngredient = {};
  for (const c of components) byIngredient[c.produces_ingredient_id] = c;

  // ---- 1. DEMAND: what the placed plan actually asks for, and WHEN ----------
  // Keyed by ingredient, each entry keeping the individual consuming slots so
  // shelf life can be checked per-day rather than in aggregate. An aggregate
  // would say "560g covers 730g? no" and stop there — it would never notice
  // that the failure is a Friday dish, not a quantity.
  const demand = {};
  const real = slots.filter((s) => s.recipe_id && s.source !== 'out' && s.source !== 'empty');
  for (const s of real) {
    for (const need of needsByRecipe[s.recipe_id] || []) {
      if (!byIngredient[need.ingredient_id]) continue;   // not producible; buy it
      const d = (demand[need.ingredient_id] ||= { total: 0, uses: [] });
      // A slot feeding more than one person scales its ingredients with it.
      const qty = need.quantity * (Number(s.portions) > 0 ? Number(s.portions) : 1);
      d.total += qty;
      d.uses.push({ date: s.slot_date, meal: s.meal, recipe_id: s.recipe_id, quantity: qty });
    }
  }

  // ---- 2. For each producible ingredient, net off stock then schedule cooks --
  for (const [ingredientId, d] of Object.entries(demand)) {
    const comp = byIngredient[ingredientId];
    const shelf = comp.shelf_life_days ?? DEFAULT_SHELF_LIFE_DAYS;
    d.uses.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Existing lots count only against uses that fall on or before their expiry.
    // Soonest-expiry first: anti-waste is the same principle here as in the
    // portion ledger.
    const lots = stock
      .filter((l) => l.ingredient_id === ingredientId && l.quantity > 0)
      .map((l) => ({ ...l }))
      .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));

    // Cook days available: the batch days, in order. A component rides along
    // with a batch cook because the oven is already on and the effort is
    // marginal — that is Karum's rule, and it is also why a component must
    // never demand a cook day of its own.
    const cookDays = batchDays.slice().sort();
    const cooksOnDay = {};  // day -> how many cooks of THIS component are on it
    const openCooks = [];   // cooks scheduled so far, with remaining yield

    for (const use of d.uses) {
      let remaining = use.quantity;

      // (a) existing stock that is still in date on the day it is needed
      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.quantity <= 0) continue;
        if (lot.expiry_date && lot.expiry_date < use.date) continue;
        const take = Math.min(lot.quantity, remaining);
        lot.quantity -= take;
        remaining -= take;
        coverage.push({ ...use, from: 'stock', quantity: take, expiry_date: lot.expiry_date });
      }
      if (remaining <= 0) continue;

      // (b) a cook already scheduled, IF this use is still inside its shelf life
      for (const ck of openCooks) {
        if (remaining <= 0) break;
        if (ck.remaining <= 0) continue;
        const age = daysBetween(ck.cook_date, use.date);
        if (age < 0 || age > shelf) continue;   // cooked after, or gone off
        const take = Math.min(ck.remaining, remaining);
        ck.remaining -= take;
        remaining -= take;
        coverage.push({ ...use, from: 'component_cook', quantity: take, cook_date: ck.cook_date });
      }
      if (remaining <= 0) continue;

      // (c) schedule NEW cooks until this use is covered. EARLIEST eligible
      //     cook day first, because the rule is "it rides along with the first
      //     batch cook" — the oven is already on and the marginal effort is
      //     near zero.
      //
      //     Keep going while the use is still short. A day may host more than
      //     one cook of the same component: the constraint on roasting two
      //     birds is oven space, not the calendar. Scheduling one cook and
      //     stopping declared a 170g shortfall on the six pulled-chicken
      //     dishes (730g against a 560g bird) for a week you would simply have
      //     roasted two birds for. Found by tests C8/C11, which is the tests
      //     doing their job.
      const dayIsEligible = (dy) => {
        const age = daysBetween(dy, use.date);
        return age >= 0 && age <= shelf;
      };
      while (remaining > 0) {
        const day = cookDays.find((dy) => dayIsEligible(dy) && (cooksOnDay[dy] || 0) < maxPerDay);
        if (!day) break;
        const ck = { component_id: comp.id, component_name: comp.name,
                     produces_ingredient_id: ingredientId, cook_date: day,
                     yield_qty: comp.yield_qty, remaining: comp.yield_qty,
                     expiry_date: addDays(day, shelf), inputs: comp.inputs || [] };
        cooks.push(ck); openCooks.push(ck);
        cooksOnDay[day] = (cooksOnDay[day] || 0) + 1;
        const take = Math.min(ck.remaining, remaining);
        ck.remaining -= take; remaining -= take;
        coverage.push({ ...use, from: 'component_cook', quantity: take, cook_date: day });
      }

      // (d) nothing could cover it — say so, precisely, and name the reason.
      if (remaining > 0) {
        const why = !cookDays.length
          ? 'no batch day to cook it on'
          : (cookDays.some(dayIsEligible)
              ? `only ${maxPerDay} prep cook${maxPerDay > 1 ? 's' : ''} fit on a cook day`
              : `outside its ${shelf}-day shelf life`);
        shortfalls.push({ ...use, ingredient_id: ingredientId, component_id: comp.id,
                          short_by: remaining, reason: why });
      }
    }

    const cooked = cooks.filter((c) => c.produces_ingredient_id === ingredientId);
    if (cooked.length) {
      rationale.push(
        `${comp.name}: ${cooked.length} prep cook${cooked.length > 1 ? 's' : ''} ` +
        `(${cooked.map((c) => c.cook_date).join(', ')}) covering ${Math.round(d.total)}g across ` +
        `${d.uses.length} dish${d.uses.length > 1 ? 'es' : ''}. Keeps ${shelf} days.`
      );
    }
  }

  for (const s of shortfalls) {
    rationale.push(
      `${Math.round(s.short_by)}g short for ${s.meal} on ${s.date} — ${s.reason}. Buy it ready-made or move the dish.`
    );
  }

  // Strip the mutable bookkeeping field before handing the cooks out.
  const cleanCooks = cooks.map(({ remaining, ...c }) => c);
  return { cooks: cleanCooks, coverage, shortfalls, rationale };
}

module.exports = { planComponents, DEFAULT_SHELF_LIFE_DAYS };
