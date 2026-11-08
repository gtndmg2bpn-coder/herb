// Things you buy and cook by the item, not the gram — eggs, sausages.
//
// The database keeps every quantity in grams, because macros are per 100 g and
// cost is per gram. An ingredient with `grams_per_item` set is COUNTED: the UI
// shows "2 sausages", never "151g". There is no half egg, so a count is always
// a whole number and never less than one.
//
// Display only. Nothing here changes a stored quantity.

function itemNoun(name, count) {
  const words = String(name || '').trim().toLowerCase().split(/\s+/);
  let noun = words[words.length - 1] || 'item';
  if (count === 1 && noun.length > 3 && noun.endsWith('s')) noun = noun.slice(0, -1);
  if (count !== 1 && !noun.endsWith('s')) noun = `${noun}s`;
  return noun;
}

// grams -> whole items, or null when the ingredient is not counted.
// mode 'round' for a recipe line (2.0 eggs is 2), 'up' for a shopping need
// (you cannot buy 1.3 eggs).
function itemCount(grams, gramsPerItem, mode = 'round') {
  const g = Number(grams);
  const per = Number(gramsPerItem);
  if (!(per > 0) || !(g > 0)) return null;
  const raw = g / per;
  // Absorb float noise (151.34 / 75.67) before rounding up.
  const n = mode === 'up' ? Math.ceil(raw - 1e-6) : Math.round(raw);
  return Math.max(1, n);
}

function countLabel(grams, gramsPerItem, name, mode = 'round') {
  const n = itemCount(grams, gramsPerItem, mode);
  if (n == null) return null;
  return `${n} ${itemNoun(name, n)}`;
}

module.exports = { itemCount, itemNoun, countLabel };
