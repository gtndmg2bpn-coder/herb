'use client';
// app/shopping/page.js
// Three-step flow: questions -> the list -> log the shop.
// The list rolls up planned meals minus pantry stock and auto-splits into a
// main shop and a midweek top-up (short-life food can't survive one weekly shop).
// Lines show what you actually carry home: "2 × 500g packs" with the raw need
// underneath, so the pack rounding is never a mystery.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { generateShoppingList, logShoppingTrip, confirmTripPrices, setIngredientPrice } from '../../lib/actions';

const INK = '#2A2932';
const CREAM = '#FBF7F1';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';
const BLUE = '#8FBBD6';
const GREEN = '#7BB88F';
const AMBER = '#E9C067';

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
const inputStyle = {
  border: `1px solid ${HAIRLINE}`,
  background: CREAM,
  color: INK,
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 14,
  fontFamily: 'inherit',
};

const primaryBtnStyle = {
  background: PINK,
  color: INK,
  border: 'none',
  borderRadius: 100,
  padding: '14px 32px',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const secondaryBtnStyle = {
  border: `1px solid ${HAIRLINE}`,
  background: '#fff',
  color: INK,
  borderRadius: 100,
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

function isoDate(date) {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(pence) {
  if (pence == null) return '—';
  return `£${(Number(pence) / 100).toFixed(2)}`;
}

function poundsToPence(value) {
  if (value === '' || value == null) return null;
  const pounds = Number(value);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

// "2 × 500g packs" when we know the pack size, plain quantity otherwise.
function packLabel(item) {
  const packSize = Number(item.pack_size);
  if (packSize > 0) {
    const packs = Math.max(1, Math.round(Number(item.quantity) / packSize));
    return `${packs} × ${packSize}${item.unit || ''} pack${packs > 1 ? 's' : ''}`;
  }
  return `${item.quantity} ${item.unit || ''}`.trim();
}

// "need 550g" — only shown when the packs round up beyond the raw need.
function needLabel(item) {
  if (item.needed_qty == null) return null;
  const needed = Number(item.needed_qty);
  if (!(needed > 0) || needed >= Number(item.quantity)) return null;
  return `need ${needed}${item.unit || ''}`;
}

export default function ShoppingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [step, setStep] = useState('questions'); // questions | list | log | done
  const [weekStart, setWeekStart] = useState(isoDate());
  const [mainDate, setMainDate] = useState(isoDate());
  const [cadence, setCadence] = useState('3');

  const [trips, setTrips] = useState([]);
  const [items, setItems] = useState([]);
  const [ticks, setTicks] = useState({});
  const [actualTotal, setActualTotal] = useState('');

  async function loadTrips() {
    const supabase = getBrowserClient();
    const { data: tripRows, error: tripErr } = await supabase
      .from('shopping_trips')
      .select('*')
      .order('trip_date', { ascending: true });
    if (tripErr) throw tripErr;
    const planned = (tripRows || []).filter((trip) => trip.status === 'planned');
    setTrips(planned);
    if (planned.length) {
      const { data: itemRows, error: itemErr } = await supabase
        .from('shopping_list_items')
        .select('*')
        .in('trip_id', planned.map((trip) => trip.id))
        .order('aisle_rank', { ascending: true })
        .order('label', { ascending: true });
      if (itemErr) throw itemErr;
      setItems(itemRows || []);
    } else {
      setItems([]);
    }
    return planned;
  }

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const supabase = getBrowserClient();
        const { data: { session: found } } = await supabase.auth.getSession();
        if (!alive) return;
        if (!found) {
          router.replace('/login');
          return;
        }
        setSession(found);
        const planned = await loadTrips();
        // Returning to the page with trips already planned: skip the questions.
        if (alive && planned.length) setStep('list');
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setChecking(false);
      }
    }

    boot();
    return () => {
      alive = false;
    };
  }, [router]);

  function itemsFor(tripId) {
    return items.filter((item) => item.trip_id === tripId);
  }

  function tripTotal(tripId) {
    return itemsFor(tripId).reduce((sum, item) => sum + (item.est_cost_pence || 0), 0);
  }

  async function onGenerate() {
    setBusy(true);
    setError('');
    const { error: genError } = await generateShoppingList({
      weekStart,
      mainTripDate: mainDate,
      topupCadenceDays: Number(cadence) || 3,
    });
    if (genError) setError(genError.message);
    try {
      await loadTrips();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
    setStep('list');
  }

  function startLog() {
    const initial = {};
    items.forEach((item) => {
      initial[item.id] = { bought: true, actualPounds: '' };
    });
    setTicks(initial);
    setActualTotal('');
    setStep('log');
  }

  async function onEditPack(item) {
    const priceIn = window.prompt(
      `Price for a pack of ${item.label} in £.\nThis updates your pricing database and refreshes the list.`,
      ''
    );
    if (priceIn == null) return;
    const pence = poundsToPence(priceIn);
    if (pence == null) {
      setError('Price must be a non-negative number.');
      return;
    }
    const packIn = window.prompt(
      `Pack size for ${item.label} in ${item.unit || 'units'} (e.g. 500 for a 500g pack).\nLeave blank to keep the current pack size${item.pack_size ? ` (${item.pack_size}${item.unit || ''})` : ''}.`,
      ''
    );
    if (packIn == null) return;
    let packSize = null;
    if (packIn.trim() !== '') {
      packSize = Number(packIn);
      if (!Number.isFinite(packSize) || packSize <= 0) {
        setError('Pack size must be a positive number.');
        return;
      }
    }
    setBusy(true);
    setError('');
    const { error: priceError } = await setIngredientPrice({ ingredientId: item.ingredient_id, pricePence: pence, packSize });
    if (priceError) {
      setError(priceError.message);
      setBusy(false);
      return;
    }
    // regenerate so every estimate reflects the new price
    const { error: genError } = await generateShoppingList({
      weekStart,
      mainTripDate: mainDate,
      topupCadenceDays: Number(cadence) || 3,
    });
    if (genError) setError(genError.message);
    try {
      await loadTrips();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function onConfirmPrices(trip) {
    if (!window.confirm('Confirm the estimated prices for this trip are about right?')) return;
    setBusy(true);
    setError('');
    const { error: confirmError } = await confirmTripPrices({ tripId: trip.id });
    if (confirmError) setError(confirmError.message);
    try {
      await loadTrips();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function onLogTrip(trip) {
    const payload = itemsFor(trip.id).map((item) => ({
      itemId: item.id,
      bought: ticks[item.id]?.bought ?? true,
      actualCostPence: poundsToPence(ticks[item.id]?.actualPounds),
    }));
    if (!payload.some((entry) => entry.bought)) {
      setError('Tick at least one item, or go back to the list.');
      return;
    }
    if (!window.confirm(`Log the ${trip.kind === 'main' ? 'main shop' : 'top-up shop'} as done?`)) return;
    setBusy(true);
    setError('');
    const { error: logError } = await logShoppingTrip({
      tripId: trip.id,
      items: payload,
      actualTotalPence: poundsToPence(actualTotal),
    });
    if (logError) setError(logError.message);
    try {
      await loadTrips();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
    setStep('done');
  }

  if (checking || !session) return null;

  return (
    <main style={{ background: CREAM, minHeight: '100vh', color: INK }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px', display: 'grid', gap: 24 }}>
        <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>Shopping list</h1>
            {error ? <p role="alert" style={{ color: '#C0392B', margin: '16px 0 0 0' }}>{error}</p> : null}
          </div>

          {step === 'questions' ? (
            <div style={{ display: 'grid', gap: 20 }}>
              <p style={{ margin: 0, color: MUTED }}>Three quick questions and HERB builds your list from the meals you have planned.</p>
              <label style={{ display: 'grid', gap: 8, color: INK, fontSize: 14, fontWeight: 600 }}>
                Week to cover (7 days from this date)
                <input type="date" style={inputStyle} value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 8, color: INK, fontSize: 14, fontWeight: 600 }}>
                When is your main shop?
                <input type="date" style={inputStyle} value={mainDate} onChange={(event) => setMainDate(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 8, color: INK, fontSize: 14, fontWeight: 600 }}>
                Top up every how many days? (fish, salad and other short-life food)
                <input type="number" min="1" max="7" style={inputStyle} value={cadence} onChange={(event) => setCadence(event.target.value)} />
              </label>
              <div style={{ paddingTop: 8 }}>
                <button type="button" disabled={busy} onClick={onGenerate} style={{ ...primaryBtnStyle, opacity: busy ? 0.6 : 1 }}>Build my list</button>
              </div>
            </div>
          ) : null}

          {step === 'list' ? (
            <div style={{ display: 'grid', gap: 24 }}>
              {trips.length === 0 ? (
                <div style={{ display: 'grid', gap: 16 }}>
                  <p style={{ margin: 0, color: MUTED }}>Nothing to buy — either your pantry already covers the planned meals, or no meals are planned for that week.</p>
                  <div>
                    <button type="button" disabled={busy} onClick={() => setStep('questions')} style={{ ...secondaryBtnStyle, opacity: busy ? 0.6 : 1 }}>Back to questions</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 24 }}>
                  <p style={{ margin: 0, color: MUTED }}>
                    Two trips, on purpose: fish, salad and other short-life food would not survive a single weekly
                    shop, so HERB moves those lines to a midweek top-up.
                  </p>
                  {trips.map((trip) => (
                    <div key={trip.id} style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20 }}>
                      <h2 style={eyebrowStyle}>
                        {trip.kind === 'main' ? 'Main shop' : 'Midweek top-up'} — {trip.trip_date}{' '}
                        <span style={{ color: trip.price_status === 'ESTIMATED' ? AMBER : GREEN, marginLeft: 8 }}>
                          {trip.price_status === 'ESTIMATED' ? 'estimated prices' : 'prices confirmed'}
                        </span>
                      </h2>
                      <div style={{ display: 'grid', gap: 0 }}>
                        {itemsFor(trip.id).map((item) => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '16px 0', borderTop: `1px solid ${HAIRLINE}` }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ color: INK, fontSize: 15, fontWeight: 500 }}>
                                {item.label || 'Item'} — {packLabel(item)}
                              </span>
                              {needLabel(item) ? <span style={{ color: MUTED, fontSize: 12 }}>{needLabel(item)}</span> : null}
                            </div>
                            <span style={{ color: MUTED, display: 'flex', gap: 12, alignItems: 'center', fontSize: 14 }}>
                              {item.buy_on_day ? 'buy on the day · ' : ''}{money(item.est_cost_pence)}
                              <button type="button" disabled={busy} onClick={() => onEditPack(item)} style={{ ...secondaryBtnStyle, opacity: busy ? 0.6 : 1 }}>edit pack</button>
                            </span>
                          </div>
                        ))}
                      </div>
                      <p style={{ textAlign: 'right', margin: '16px 0 0', color: INK, fontSize: 15 }}>Est. total: <b>{money(tripTotal(trip.id))}</b></p>
                      {trip.price_status === 'ESTIMATED' ? (
                        <div style={{ textAlign: 'right', marginTop: 12 }}>
                          <button type="button" disabled={busy} onClick={() => onConfirmPrices(trip)} style={{ ...secondaryBtnStyle, opacity: busy ? 0.6 : 1 }}>Prices were about right</button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8 }}>
                    <button type="button" disabled={busy} onClick={startLog} style={{ ...primaryBtnStyle, opacity: busy ? 0.6 : 1 }}>Log a shop</button>
                    <button type="button" disabled={busy} onClick={() => setStep('questions')} style={{ ...secondaryBtnStyle, opacity: busy ? 0.6 : 1 }}>Change answers</button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {step === 'log' ? (
            trips.length === 0 ? (
              <p style={{ margin: 0, color: MUTED }}>No planned trips left to log.</p>
            ) : (
              <div style={{ display: 'grid', gap: 24 }}>
                <div>
                  <h2 style={eyebrowStyle}>
                    Log the {trips[0].kind === 'main' ? 'main shop' : 'top-up shop'} — {trips[0].trip_date}
                  </h2>
                  <p style={{ margin: 0, color: MUTED }}>Untick anything you did not buy. Actual prices are optional.</p>
                </div>
                <div style={{ display: 'grid', gap: 0 }}>
                  {itemsFor(trips[0].id).map((item) => (
                    <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: `1px solid ${HAIRLINE}`, padding: '16px 0' }}>
                      <input
                        type="checkbox"
                        checked={ticks[item.id]?.bought ?? true}
                        onChange={(event) => setTicks({ ...ticks, [item.id]: { ...ticks[item.id], bought: event.target.checked } })}
                        style={{ accentColor: PINK, width: 18, height: 18 }}
                      />
                      <span style={{ flex: 1, color: INK, fontSize: 15, fontWeight: 500 }}>{item.label} — {packLabel(item)}</span>
                      <span style={{ color: MUTED, fontSize: 14 }}>{money(item.est_cost_pence)}</span>
                      <input
                        placeholder="actual £"
                        style={{ ...inputStyle, width: 80, padding: '8px 12px' }}
                        value={ticks[item.id]?.actualPounds ?? ''}
                        onChange={(event) => setTicks({ ...ticks, [item.id]: { ...ticks[item.id], actualPounds: event.target.value } })}
                      />
                    </div>
                  ))}
                </div>
                <label style={{ display: 'grid', gap: 8, color: INK, fontWeight: 600, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 16 }}>
                  Actual total paid (£, optional — overrides the estimate)
                  <input style={{ ...inputStyle, maxWidth: 200 }} value={actualTotal} onChange={(event) => setActualTotal(event.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                  <button type="button" disabled={busy} onClick={() => onLogTrip(trips[0])} style={{ ...primaryBtnStyle, opacity: busy ? 0.6 : 1 }}>Log this shop</button>
                  <button type="button" disabled={busy} onClick={() => setStep('list')} style={{ ...secondaryBtnStyle, opacity: busy ? 0.6 : 1 }}>Back to list</button>
                </div>
              </div>
            )
          ) : null}

          {step === 'done' ? (
            <div style={{ display: 'grid', gap: 20 }}>
              <p style={{ margin: 0, color: INK, fontSize: 16, fontWeight: 500 }}>Shop logged — your pantry and this week&rsquo;s spend are up to date.</p>
              {trips.length > 0 ? (
                <div style={{ display: 'grid', gap: 16, alignItems: 'start', borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20 }}>
                  <p style={{ margin: 0, color: MUTED }}>
                    You still have a planned {trips[0].kind === 'main' ? 'main shop' : 'top-up'} on {trips[0].trip_date}.
                  </p>
                  <div>
                    <button type="button" onClick={() => setStep('list')} style={secondaryBtnStyle}>View remaining list</button>
                  </div>
                </div>
              ) : null}
              <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20 }}>
                <Link href="/dashboard" style={{ color: BLUE, textDecoration: 'none', fontWeight: 600 }}>Back to dashboard</Link>
              </div>
            </div>
          ) : null}
        </section>

        <div style={{ display: 'flex', gap: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/dashboard" style={{ color: MUTED, textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>Dashboard</Link>
          <Link href="/" style={{ color: MUTED, textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>Browse recipes</Link>
        </div>
      </div>
    </main>
  );
}
