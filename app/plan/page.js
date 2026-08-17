'use client';
// app/plan/page.js

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabaseBrowser';

// Editorial design tokens (match dashboard / spend / recipe book)
const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';
const BLUE = '#8FBBD6';
const GREEN = '#7BB88F';
const AMBER = '#E9C067';

// Helpers copied verbatim from app/dashboard/page.js (local functions, not importable)
function isoDate(date) { return date.toISOString().slice(0, 10); }
function addDays(iso, days) { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return isoDate(d); }
function dayLabel(iso) { return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

const DAY_MODES = ['normal', 'busy', 'out'];
const DAY_MODE_LABELS = { normal: 'Normal', busy: 'Busy', out: 'Out' };

const cardStyle = {
  background: '#FFFFFF',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 20,
  padding: '24px 28px',
};
const eyebrowStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 12,
};

// Small pill toggle used for "Freezer first" and "Off meat".
function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
    >
      <span style={{ width: 44, height: 24, borderRadius: 100, background: on ? GREEN : HAIRLINE, position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{label}</span>
    </button>
  );
}

export default function PlanPage() {
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [weekStart, setWeekStart] = useState(null);
  const [days, setDays] = useState([]);
  const [freezerLots, setFreezerLots] = useState([]);

  // Constraint state — exact model from the brief.
  const [freezerFirst, setFreezerFirst] = useState(true);
  const [dayMode, setDayMode] = useState({});
  const [batchDay, setBatchDay] = useState(null);
  const [avoidMeat, setAvoidMeat] = useState(false);
  const [cuisine, setCuisine] = useState('');
  const [guests, setGuests] = useState([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) { setLoggedOut(true); setLoading(false); }
        return;
      }
      const uid = session.user.id;

      // The plan week is rolling 7 days from today (NOT Monday-based).
      const start = isoDate(new Date());
      const weekDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));

      const { data: lots } = await supabase
        .from('pantry_lots')
        .select('recipe_id, quantity, expiry_date')
        .eq('user_id', uid).eq('item_kind', 'recipe').eq('location', 'freezer');
      const { data: recipeRows } = await supabase.from('recipes').select('id, name');

      if (cancelled) return;

      const nameById = {};
      for (const recipe of recipeRows || []) nameById[recipe.id] = recipe.name;

      // KIMI NOTE: "due within ~14 days" is read as expiry_date present and
      // on/before today + 14. Already-overdue lots are included (they are the
      // most due of all); lots with no expiry_date are left off the list.
      const useByLimit = addDays(start, 14);
      const dueLots = (lots || [])
        .filter((lot) => lot.expiry_date && lot.expiry_date <= useByLimit)
        .map((lot) => ({ ...lot, recipeName: nameById[lot.recipe_id] || 'A recipe' }))
        .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));

      setWeekStart(start);
      setDays(weekDays);
      setFreezerLots(dueLots);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  function setMode(date, mode) {
    setDayMode((current) => ({ ...current, [date]: mode }));
    setSaved(false);
  }

  function addGuest() {
    setGuests((current) => [...current, { date: days[0], count: 1 }]);
    setSaved(false);
  }

  function updateGuest(index, patch) {
    setGuests((current) => current.map((guest, i) => (i === index ? { ...guest, ...patch } : guest)));
    setSaved(false);
  }

  function removeGuest(index) {
    setGuests((current) => current.filter((_, i) => i !== index));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const constraints = {
      freezer_first: freezerFirst,
      busy_days: days.filter((d) => (dayMode[d] || 'normal') === 'busy'),
      batch_day: batchDay,
      out_nights: days.filter((d) => (dayMode[d] || 'normal') === 'out'),
      appetite: { avoid_meat: avoidMeat, cuisine: cuisine || null },
      guests: guests.filter((g) => g.date && g.count > 0),
    };
    const supabase = getBrowserClient();
    const { error: rpcError } = await supabase.rpc('save_plan_constraints', {
      p_week_start: weekStart,
      p_constraints: constraints,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSaved(true);
    }
  }

  const inputStyle = {
    border: `1px solid ${HAIRLINE}`,
    background: CREAM,
    color: INK,
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
  };

  return (
    <main style={{ background: CREAM, minHeight: '100vh', color: INK }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px' }}>
        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: MUTED, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        {loading ? (
          <div style={{ ...cardStyle, marginTop: 24, color: MUTED, fontSize: 14 }}>Loading your week…</div>
        ) : loggedOut ? (
          <div style={{ ...cardStyle, marginTop: 24 }}>
            <div style={eyebrowStyle}>Plan my week</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sign in to plan your week.</div>
          </div>
        ) : (
          <>
            <header style={{ marginTop: 24, marginBottom: 28 }}>
              <div style={{ ...eyebrowStyle, color: PINK }}>Plan my week</div>
              <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>
                {dayLabel(days[0])} — {dayLabel(days[6])}
              </h1>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>
                Set this week&rsquo;s constraints. The plan itself is generated in a later step.
              </div>
            </header>

            <div style={{ display: 'grid', gap: 20 }}>
              {/* ── 1 · Freezer first ─────────────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Freezer first</div>
                {freezerLots.length === 0 ? (
                  <div style={{ fontSize: 14, color: MUTED }}>No freezer portions to use up this week.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                    {freezerLots.map((lot, index) => (
                      <div key={`${lot.recipe_id}-${index}`} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{lot.recipeName}</span>
                        <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>
                          {lot.quantity} portion{lot.quantity === 1 ? '' : 's'} · use by {dayLabel(lot.expiry_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Toggle on={freezerFirst} onChange={(value) => { setFreezerFirst(value); setSaved(false); }} label="Use these up first" />
              </section>

              {/* ── 2 · Your week ─────────────────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Your week</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {days.map((date) => {
                    const mode = dayMode[date] || 'normal';
                    return (
                      <div key={date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 110 }}>{dayLabel(date)}</span>
                        <span style={{ display: 'inline-flex', background: CREAM, border: `1px solid ${HAIRLINE}`, borderRadius: 100, padding: 3 }}>
                          {DAY_MODES.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setMode(date, option)}
                              style={{
                                border: 'none',
                                borderRadius: 100,
                                padding: '7px 16px',
                                fontSize: 13,
                                fontWeight: 700,
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                                background: mode === option ? (option === 'busy' ? AMBER : option === 'out' ? BLUE : INK) : 'transparent',
                                color: mode === option ? (option === 'normal' ? CREAM : INK) : MUTED,
                              }}
                            >
                              {DAY_MODE_LABELS[option]}
                            </button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Which day do you batch-cook?</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {days.map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => { setBatchDay(batchDay === date ? null : date); setSaved(false); }}
                        style={{
                          border: `1px solid ${batchDay === date ? INK : HAIRLINE}`,
                          background: batchDay === date ? INK : '#fff',
                          color: batchDay === date ? CREAM : INK,
                          borderRadius: 100,
                          padding: '8px 14px',
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {dayLabel(date)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setBatchDay(null); setSaved(false); }}
                      style={{
                        border: `1px solid ${batchDay === null ? INK : HAIRLINE}`,
                        background: batchDay === null ? INK : '#fff',
                        color: batchDay === null ? CREAM : MUTED,
                        borderRadius: 100,
                        padding: '8px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      None
                    </button>
                  </div>
                </div>
              </section>

              {/* ── 3 · This week's appetite ──────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>This week&rsquo;s appetite</div>
                <Toggle on={avoidMeat} onChange={(value) => { setAvoidMeat(value); setSaved(false); }} label="Off meat this week" />
                <div style={{ marginTop: 16 }}>
                  <label htmlFor="cuisine" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
                    Fancy a cuisine? <span style={{ fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    id="cuisine"
                    type="text"
                    placeholder="e.g. Italian, Indian, Mexican…"
                    value={cuisine}
                    onChange={(event) => { setCuisine(event.target.value); setSaved(false); }}
                    style={{ ...inputStyle, width: '100%', maxWidth: 320, background: '#fff' }}
                  />
                </div>
              </section>

              {/* ── 4 · Guests ────────────────────────────────────────── */}
              <section style={cardStyle}>
                <div style={eyebrowStyle}>Guests</div>
                {guests.length === 0 && (
                  <div style={{ fontSize: 14, color: MUTED, marginBottom: 12 }}>No guest nights this week.</div>
                )}
                <div style={{ display: 'grid', gap: 10 }}>
                  {guests.map((guest, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <select
                        value={guest.date}
                        onChange={(event) => updateGuest(index, { date: event.target.value })}
                        style={{ ...inputStyle, background: '#fff' }}
                      >
                        {days.map((date) => (
                          <option key={date} value={date}>{dayLabel(date)}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={guest.count}
                        onChange={(event) => updateGuest(index, { count: Number(event.target.value) })}
                        style={{ ...inputStyle, width: 80, background: '#fff' }}
                        aria-label="Number of guests"
                      />
                      <span style={{ fontSize: 13, color: MUTED }}>guest{guest.count === 1 ? '' : 's'}</span>
                      <button
                        type="button"
                        onClick={() => removeGuest(index)}
                        style={{ border: 'none', background: 'none', color: MUTED, fontSize: 13, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addGuest}
                  style={{
                    marginTop: 14,
                    border: `1px solid ${HAIRLINE}`,
                    background: '#fff',
                    color: INK,
                    borderRadius: 100,
                    padding: '9px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  + Add guest night
                </button>
              </section>

              {/* ── Save ──────────────────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  style={{
                    background: PINK,
                    color: INK,
                    border: 'none',
                    borderRadius: 100,
                    padding: '14px 32px',
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Save my week'}
                </button>
                {saved && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: GREEN }}>
                    Your week&rsquo;s set — plan generation is coming soon.
                  </span>
                )}
                {error && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#C0392B' }}>{error}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
