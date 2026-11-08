'use client';
// app/recipes/RecipeBrowser.js — search, section, sort and a "lighter" filter
// over the recipe book. Pure filtering of figures already worked out on the server.
import { useMemo, useState } from 'react';
import RecipeCard from '../../components/site/RecipeCard';
import { SECTION_ORDER, sectionLabel, proteinPer100Kcal } from '../../lib/recipeDisplay';

// Shakes and snacks are top-ups, not meals: in the default view they follow the meals.
const TOP_UPS = new Set(['shakes', 'snacks']);
const SORTS = {
  protein: { label: 'Most protein per calorie', fn: (a, b) => (TOP_UPS.has(a.section) - TOP_UPS.has(b.section)) || proteinPer100Kcal(b) - proteinPer100Kcal(a) },
  kcal: { label: 'Fewest calories', fn: (a, b) => (a.kcal ?? 1e9) - (b.kcal ?? 1e9) },
  cost: { label: 'Cheapest', fn: (a, b) => (a.cost_gbp ?? 1e9) - (b.cost_gbp ?? 1e9) },
  name: { label: 'A to Z', fn: (a, b) => a.name.localeCompare(b.name) },
};

export default function RecipeBrowser({ recipes, initialSection = 'all' }) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(initialSection);
  const [sort, setSort] = useState('protein');
  const [lighter, setLighter] = useState(false);

  const sections = useMemo(() => {
    const counts = {};
    recipes.forEach((r) => { counts[r.section] = (counts[r.section] || 0) + 1; });
    const known = SECTION_ORDER.filter((s) => counts[s]);
    const other = Object.keys(counts).filter((s) => s && !SECTION_ORDER.includes(s)).sort();
    return [...known, ...other].map((s) => ({ key: s, count: counts[s] }));
  }, [recipes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => section === 'all' || r.section === section)
      .filter((r) => !lighter || (r.kcal != null && r.kcal <= 450))
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => SORTS[sort].fn(a, b) || a.name.localeCompare(b.name));
  }, [recipes, query, section, sort, lighter]);

  return (
    <>
      <div className="s-tools">
        <input
          className="s-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search: chicken, curry, salmon…"
          aria-label="Search recipes"
        />
        <select className="s-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort recipes">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="s-check">
          <input type="checkbox" checked={lighter} onChange={(e) => setLighter(e.target.checked)} />
          450 kcal or under
        </label>
      </div>
      <div className="s-chips" role="group" aria-label="Sections">
        <button type="button" className="s-chip-btn" aria-pressed={section === 'all'} onClick={() => setSection('all')}>
          All<small>{recipes.length}</small>
        </button>
        {sections.map((s) => (
          <button key={s.key} type="button" className="s-chip-btn" aria-pressed={section === s.key} onClick={() => setSection(s.key)}>
            {sectionLabel(s.key)}<small>{s.count}</small>
          </button>
        ))}
      </div>
      {visible.length > 0 ? (
        <div className="s-cards">
          {visible.map((r) => <RecipeCard key={r.id} recipe={r} />)}
        </div>
      ) : (
        <div className="s-empty">
          Nothing matches that.{' '}
          <button type="button" className="s-link" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
            onClick={() => { setQuery(''); setSection('all'); setLighter(false); }}>
            Clear the filters
          </button>
        </div>
      )}
    </>
  );
}
