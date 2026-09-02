'use client';
// app/shopping/page.js
//
// REBUILT 2 September 2026 — against HERB_Design_Brief_Shopping_Cook_v1 and
// HERB_Design_Corrections_v1.1. Mobile-first, responsive to desktop.
//
// WHAT WAS BROKEN, and it was not the design ------------------------------
//
// 1. `.order('aisle_rank')` — THAT COLUMN DOES NOT EXIST. Verified live today:
//    `shopping_list_items` has 13 columns and `aisle_rank` is not one of them.
//    Every items query threw, the throw was swallowed into an error banner,
//    `setTrips` had already run, and the page rendered trip headings with no
//    rows and a £0.00 total. There are 62 real items across 3 planned trips
//    that have never once been drawn on screen.
//    The aisle data was there the whole time — on `ingredients.aisle`, complete
//    on all 150 rows. It just never reached the list. Fixed by embedding
//    `ingredients(aisle)` through the existing foreign key and holding the
//    SHOPPING ORDER client-side, rather than resurrecting a column that never
//    existed.
//
// 2. Stale-state regeneration. `boot()` jumped to the list without hydrating
//    weekStart / mainDate / cadence from the trip rows, so they stayed at
//    today/today/3 — and editing a pack price silently rebuilt the whole list
//    against the wrong week. Fixed twice over: the state is now hydrated from
//    the trips and the plan week, AND a price edit no longer regenerates at
//    all (see onSavePack).
//
// 3. Nothing on this page could respond to a viewport, because every style was
//    an inline object and an inline object cannot hold a media query. Layout
//    now lives in globals.css; colour tokens stay inline.
//
// WHAT IS DELIBERATELY NOT HERE ------------------------------------------
//
// - No per-item tick is written to the server. Ticks are client state mirrored
//   to localStorage and settled by ONE log_shopping_trip call. Stock is an
//   append-only ledger: a live tick would mint a pantry lot and an untick would
//   have to delete one. (Engine canon §8A.3.)
// - No optimistic UI on anything that writes, and no Undo. There are 26
//   functions in `public` and not one reverses an intake or a cook, so an Undo
//   chip could not be honoured.
// - No off-list "add something you picked up" yet. It needs a pantry-lot write
//   that does not exist. Named, not faked.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { isoDate, addDays, daysBetween, dayLabel } from '../../lib/dates';
import {
  generateShoppingList,
  logShoppingTrip,
  confirmTripPrices,
  setIngredientPrice,
} from '../../lib/actions';

// Tokens. Layout and breakpoints are in globals.css; these are the four values
// the markup needs to name directly.
const INK = '#2A2932';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const BLUE = '#8FBBD6';

// Shopping order, not alphabetical. Walk in at the veg, finish at the tills.
// These eight are every distinct value live on `ingredients.aisle`.
const AISLE_ORDER = [
  'fresh_veg', 'protein', 'dairy', 'fats', 'carbs', 'tins_jars', 'spices', 'other',
];
const AISLE_LABEL = {
  fresh_veg: 'Fruit & veg',
  protein: 'Meat & fish',
  dairy: 'Dairy & chilled',
  fats: 'Oils & fats',
  carbs: 'Bread & grains',
  tins_jars: 'Tins & jars',
  spices: 'Herbs & spices',
  other: 'Everything else',
};
const AISLE_RANK = Object.fromEntries(AISLE_ORDER.map((a, i) => [a, i]));

function money(pence) {
  if (pence == null) return '—';
  return `£${(Number(pence) / 100).toFixed(2)}`;
}

// "about £24.60" — an estimate should never be typeset like a receipt.
function roughMoney(pence) {
  if (pence == null) return '—';
  return `about £${(Number(pence) / 100).toFixed(2)}`;
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

// "need 550g" — only when the packs round up beyond the raw need.
function needLabel(item) {
  if (item.needed_qty == null) return null;
  const needed = Number(item.needed_qty);
  if (!(needed > 0) || needed >= Number(item.quantity)) return null;
  return `need ${needed}${item.unit || ''}`;
}

function aisleOf(item) {
  const a = item.ingredients?.aisle;
  return AISLE_ORDER.includes(a) ? a : 'other';
}

// The next Saturday, or today if today is Saturday. Seeded, not learned:
// `shopping_trips` holds no completed rows, so there is no trip history to
// learn a main-shop day from yet. Do not present learned behaviour that
// cannot yet be learned.
function nextSaturday(from = isoDate()) {
  const dow = new Date(`${from}T00:00:00Z`).getUTCDay(); // 6 = Saturday
  return addDays(from, (6 - dow + 7) % 7);
}

const tickKey = (tripId) => `herb.ticks.${tripId}`;

function readTicks(tripId) {
  if (typeof window === 'undefined' || !tripId) return {};
  try {
    return JSON.parse(window.localStorage.getItem(tickKey(tripId)) || '{}');
  } catch {
    return {};
  }
}

function writeTicks(tripId, ticks) {
  if (typeof window === 'undefined' || !tripId) return;
  try {
    window.localStorage.setItem(tickKey(tripId), JSON.stringify(ticks));
  } catch {
    /* private mode, quota — a lost tick is a nuisance, not a failure */
  }
}

export default function ShoppingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  const [trips, setTrips] = useState([]);
  const [items, setItems] = useState([]);
  const [activeTripId, setActiveTripId] = useState(null);
  const [ticks, setTicks] = useState({});
  const [done, setDone] = useState(false);

  // The plan window, hydrated from the engine — never asked for.
  const [weekStart, setWeekStart] = useState(isoDate());
  const [mainDate, setMainDate] = useState(nextSaturday());
  const [cadence, setCadence] = useState(3);

  // One sheet at a time: { kind: 'plan' | 'pack' | 'shop', item?, trip? }
  const [sheet, setSheet] = useState(null);

  const loadAll = useCallback(async () => {
    const supabase = getBrowserClient();

    const { data: tripRows, error: tripErr } = await supabase
      .from('shopping_trips')
      .select('*')
      .order('trip_date', { ascending: true });
    if (tripErr) throw tripErr;

    const planned = (tripRows || []).filter((trip) => trip.status === 'planned');
    setTrips(planned);

    // Hydrate the plan window from what the engine already holds, in priority
    // order: the planned trips, then the current plan week, then a seeded
    // default. This is the fix for the stale-state bug — these three values
    // used to sit at today/today/3 forever.
    const main = planned.find((t) => t.kind === 'main');
    const topup = planned.find((t) => t.kind !== 'main');
    if (main) setMainDate(main.trip_date);
    if (main && topup) {
      const gap = daysBetween(main.trip_date, topup.trip_date);
      if (gap > 0) setCadence(gap);
    }

    const { data: weekRows } = await supabase
      .from('plan_weeks')
      .select('week_start')
      .order('week_start', { ascending: false })
      .limit(1);
    if (weekRows && weekRows.length) {
      setWeekStart(weekRows[0].week_start);
      if (!main) setMainDate(nextSaturday(weekRows[0].week_start));
    }

    if (planned.length) {
      // THE FIX. Embed the aisle through shopping_list_items_ingredient_id_fkey
      // — `ingredients` is public-read, so this needs no server work — and sort
      // in shopping order on the client.
      const { data: itemRows, error: itemErr } = await supabase
        .from('shopping_list_items')
        .select('*, ingredients ( aisle, name )')
        .in('trip_id', planned.map((trip) => trip.id))
        .order('label', { ascending: true });
      if (itemErr) throw itemErr;
      setItems(itemRows || []);
    } else {
      setItems([]);
    }

    setActiveTripId((current) => {
      if (current && planned.some((t) => t.id === current)) return current;
      return planned.length ? planned[0].id : null;
    });

    return planned;
  }, []);

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
        await loadAll();
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setChecking(false);
      }
    }

    boot();
    return () => { alive = false; };
  }, [router, loadAll]);

  // The supermarket basement. Ticks are already safe in localStorage; this only
  // tells the truth about why nothing is settling. Never red.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => setOnline(window.navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    setTicks(readTicks(activeTripId));
  }, [activeTripId]);

  const activeTrip = trips.find((t) => t.id === activeTripId) || null;

  const activeItems = useMemo(
    () => items.filter((item) => item.trip_id === activeTripId),
    [items, activeTripId],
  );

  // Aisle sections, in shopping order, alphabetical inside each.
  const sections = useMemo(() => {
    const byAisle = new Map();
    activeItems.forEach((item) => {
      const a = aisleOf(item);
      if (!byAisle.has(a)) byAisle.set(a, []);
      byAisle.get(a).push(item);
    });
    return [...byAisle.entries()]
      .sort((a, b) => AISLE_RANK[a[0]] - AISLE_RANK[b[0]])
      .map(([aisle, rows]) => ({
        aisle,
        rows: rows.sort((x, y) => (x.label || '').localeCompare(y.label || '')),
      }));
  }, [activeItems]);

  const tickedCount = activeItems.filter((i) => ticks[i.id]).length;
  const runningPence = activeItems
    .filter((i) => ticks[i.id])
    .reduce((sum, i) => sum + (i.est_cost_pence || 0), 0);
  const tripPence = activeItems.reduce((sum, i) => sum + (i.est_cost_pence || 0), 0);

  function toggle(itemId) {
    const next = { ...ticks, [itemId]: !ticks[itemId] };
    if (!next[itemId]) delete next[itemId];
    setTicks(next);
    writeTicks(activeTripId, next);
  }

  // One line instead of three questions. The engine holds every value in it.
  const planLine = useMemo(() => {
    const covers = `Covers ${dayLabel(weekStart)} – ${dayLabel(addDays(weekStart, 6))}.`;
    if (!trips.length) return covers;
    const main = trips.find((t) => t.kind === 'main');
    const tops = trips.filter((t) => t.kind !== 'main');
    const bits = [];
    if (main) bits.push(`Main shop ${dayLabel(main.trip_date)}`);
    if (tops.length) bits.push(`top-up ${tops.map((t) => dayLabel(t.trip_date)).join(' and ')}`);
    return `${covers} ${bits.join(', ')}.`;
  }, [weekStart, trips]);

  async function onBuildList() {
    setBusy(true);
    setError('');
    setNote('');
    const { error: genError } = await generateShoppingList({
      weekStart,
      mainTripDate: mainDate,
      topupCadenceDays: Number(cadence) || 3,
    });
    if (genError) setError(genError.message);
    try {
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
    setSheet(null);
    setBusy(false);
  }

  // Wrong pack size or wrong price. Captures WHAT HE CARRIED HOME into the
  // pricing database — and deliberately does NOT regenerate the list.
  // Regenerating mid-shop rebuilt every row, threw away the ticks, and (before
  // the hydration fix) rebuilt against the wrong week. The durable value is the
  // corrected price; this week's estimate can stay an estimate.
  async function onSavePack({ item, pricePounds, packSizeIn }) {
    const pence = poundsToPence(pricePounds);
    if (pence == null) {
      setError('Price needs to be a number, like 2.40.');
      return;
    }
    let packSize = null;
    if (String(packSizeIn).trim() !== '') {
      packSize = Number(packSizeIn);
      if (!Number.isFinite(packSize) || packSize <= 0) {
        setError('Pack size needs to be a positive number.');
        return;
      }
    }
    setBusy(true);
    setError('');
    const { error: priceError } = await setIngredientPrice({
      ingredientId: item.ingredient_id,
      pricePence: pence,
      packSize,
    });
    if (priceError) {
      setError(priceError.message);
      setBusy(false);
      return;
    }
    setSheet(null);
    setBusy(false);
    setNote(`Saved — ${item.label} is ${money(pence)} a pack from now on.`);
  }

  async function onConfirmPrices(trip) {
    setBusy(true);
    setError('');
    const { error: confirmError } = await confirmTripPrices({ tripId: trip.id });
    if (confirmError) setError(confirmError.message);
    try {
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
    if (!confirmError) setNote('Prices locked in for this shop.');
  }

  // The tick IS the log. One call, at the end, from client state.
  async function onLogShop(trip, actualTotal) {
    const payload = activeItems.map((item) => ({
      itemId: item.id,
      bought: Boolean(ticks[item.id]),
      actualCostPence: null,
    }));
    if (!payload.some((entry) => entry.bought)) {
      setError('Nothing is ticked yet — tick what you put in the trolley first.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: logError } = await logShoppingTrip({
      tripId: trip.id,
      items: payload,
      actualTotalPence: poundsToPence(actualTotal),
    });
    if (logError) {
      setError(logError.message);
      setBusy(false);
      return;
    }
    writeTicks(trip.id, {});
    try {
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
    setSheet(null);
    setBusy(false);
    setDone(true);
  }

  if (checking || !session) return null;

  const missed = activeItems.length - tickedCount;

  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh', color: INK }}>
      <div className="herb-page">

        {/* Running total. Sticky under the nav on a phone; in the aside on
            desktop, where it does not need to follow you down the page. */}
        {!done && activeItems.length > 0 ? (
          <div className="shop-bar">
            <span style={{ fontWeight: 700, fontSize: 15 }} className="herb-num">
              {tickedCount} of {activeItems.length}
            </span>
            <span className="herb-num" style={{ color: MUTED, fontSize: 15 }}>
              {roughMoney(runningPence)}
            </span>
          </div>
        ) : null}

        <div>
          <h1 className="herb-h1">Shopping list</h1>
          <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 13 }}>
            {planLine}{' '}
            <button
              type="button"
              onClick={() => setSheet({ kind: 'plan' })}
              style={{
                background: 'none', border: 0, padding: 0, font: 'inherit',
                color: BLUE, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Change
            </button>
          </p>
        </div>

        {error ? (
          <p role="alert" style={{
            margin: 0, padding: '12px 14px', borderRadius: 12,
            background: 'var(--alert-wash)', color: 'var(--alert)', fontSize: 14,
          }}>
            {error}
          </p>
        ) : null}

        {note ? (
          <p style={{
            margin: 0, padding: '12px 14px', borderRadius: 12,
            background: 'var(--green-wash)', color: 'var(--green-text)', fontSize: 14,
          }}>
            {note}
          </p>
        ) : null}

        {!online ? (
          <p style={{
            margin: 0, padding: '12px 14px', borderRadius: 12,
            background: 'var(--amber-wash)', color: 'var(--amber-text)', fontSize: 14,
          }}>
            You&rsquo;re offline. Your ticks are safe — they&rsquo;ll go through when you&rsquo;re back.
          </p>
        ) : null}

        {done ? (
          <section className="herb-card" style={{ display: 'grid', gap: 20 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              Shop logged — your pantry and this week&rsquo;s spend are up to date.
            </p>
            {trips.length ? (
              <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20, display: 'grid', gap: 16, justifyItems: 'start' }}>
                <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>
                  You still have a {trips[0].kind === 'main' ? 'main shop' : 'top-up'} on {dayLabel(trips[0].trip_date)}.
                </p>
                <button
                  type="button"
                  className="herb-btn herb-btn-secondary herb-btn-inline"
                  onClick={() => { setDone(false); setActiveTripId(trips[0].id); }}
                >
                  View that list
                </button>
              </div>
            ) : null}
            <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20 }}>
              <Link href="/dashboard" style={{ color: BLUE, textDecoration: 'none', fontWeight: 700 }}>
                Back to dashboard
              </Link>
            </div>
          </section>
        ) : trips.length === 0 ? (
          <section className="herb-card" style={{ display: 'grid', gap: 20, justifyItems: 'start' }}>
            <p style={{ margin: 0, color: MUTED }}>
              Nothing to buy yet — either the pantry already covers the planned meals, or
              there are no meals planned for this week.
            </p>
            <button
              type="button"
              className="herb-btn herb-btn-primary"
              disabled={busy}
              onClick={onBuildList}
            >
              {busy ? 'Building…' : 'Build my list'}
            </button>
          </section>
        ) : (
          <div className="shop-layout">
            <section className="herb-card herb-card-bleed">

              {/* Two trips, on purpose. A segmented control, not two long
                  stacked lists you scroll past in a shop. */}
              {trips.length > 1 ? (
                <div className="shop-tabs">
                  {trips.map((trip) => {
                    const on = trip.id === activeTripId;
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        onClick={() => setActiveTripId(trip.id)}
                        className="herb-tap herb-btn-inline"
                        style={{
                          border: `1px solid ${on ? INK : HAIRLINE}`,
                          background: on ? INK : '#FFFFFF',
                          color: on ? '#FFFFFF' : INK,
                          borderRadius: 100, padding: '10px 16px',
                          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {trip.kind === 'main' ? 'Main shop' : 'Top-up'} · {dayLabel(trip.trip_date)}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {activeItems.length === 0 ? (
                <p style={{ margin: '16px 0', color: MUTED }}>
                  Nothing on this one — everything it covers is already in the pantry.
                </p>
              ) : (
                sections.map((section) => (
                  <div key={section.aisle}>
                    <h2 className="shop-aisle">{AISLE_LABEL[section.aisle]}</h2>
                    {section.rows.map((item) => {
                      const on = Boolean(ticks[item.id]);
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'stretch' }}>
                          <button
                            type="button"
                            className="shop-row"
                            aria-pressed={on}
                            onClick={() => toggle(item.id)}
                          >
                            <span className="shop-tickbox" aria-hidden="true">
                              {on ? (
                                <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                                  <path d="M1 5.2 4.4 8.6 12 1" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : null}
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                              <span className="shop-name">{item.label || 'Item'}</span>
                              <span className="shop-note">
                                {packLabel(item)}
                                {needLabel(item) ? ` · ${needLabel(item)}` : ''}
                                {item.buy_on_day ? ' · buy on the day' : ''}
                              </span>
                            </span>
                            <span className="shop-price">{money(item.est_cost_pence)}</span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Wrong price for ${item.label}`}
                            title="Wrong price?"
                            onClick={() => setSheet({ kind: 'pack', item })}
                            style={{
                              flex: '0 0 auto', width: 44, minHeight: 56,
                              border: 0, borderTop: `1px solid ${HAIRLINE}`,
                              background: 'transparent', color: MUTED,
                              fontSize: 18, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            ⋯
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </section>

            <aside className="shop-aside" style={{ display: 'grid', gap: 16 }}>
              <div className="herb-card shop-aside-total">
                <p className="herb-num" style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {roughMoney(runningPence)}
                </p>
                <p className="herb-num" style={{ margin: '4px 0 0', color: MUTED, fontSize: 13 }}>
                  {tickedCount} of {activeItems.length} in the trolley · {roughMoney(tripPence)} for the lot
                </p>
              </div>

              {activeTrip ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <button
                    type="button"
                    className="herb-btn herb-btn-primary"
                    disabled={busy || activeItems.length === 0}
                    onClick={() => setSheet({ kind: 'shop', trip: activeTrip })}
                  >
                    I&rsquo;ve been shopping
                  </button>
                  {activeTrip.price_status === 'ESTIMATED' ? (
                    <button
                      type="button"
                      className="herb-btn herb-btn-secondary"
                      disabled={busy}
                      onClick={() => onConfirmPrices(activeTrip)}
                    >
                      Prices looked right
                    </button>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--green-text)', fontSize: 13, fontWeight: 600 }}>
                      Prices confirmed
                    </p>
                  )}
                </div>
              ) : null}
            </aside>
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Link href="/dashboard" style={{ color: MUTED, textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>Dashboard</Link>
          <Link href="/" style={{ color: MUTED, textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>Browse recipes</Link>
        </div>
      </div>

      {sheet ? (
        <Sheet onClose={() => setSheet(null)}>
          {sheet.kind === 'plan' ? (
            <PlanSheet
              busy={busy}
              weekStart={weekStart}
              mainDate={mainDate}
              cadence={cadence}
              setWeekStart={setWeekStart}
              setMainDate={setMainDate}
              setCadence={setCadence}
              onSubmit={onBuildList}
              hasTrips={trips.length > 0}
            />
          ) : null}
          {sheet.kind === 'pack' ? (
            <PackSheet busy={busy} item={sheet.item} onSubmit={onSavePack} onClose={() => setSheet(null)} />
          ) : null}
          {sheet.kind === 'shop' ? (
            <ShopSheet
              busy={busy}
              trip={sheet.trip}
              ticked={tickedCount}
              missed={missed}
              estimate={runningPence}
              onSubmit={(total) => onLogShop(sheet.trip, total)}
              onClose={() => setSheet(null)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </main>
  );
}

/* --- sheets ---------------------------------------------------------------
   A bottom sheet on a phone, a centred card on desktop, same markup. These
   replace the two chained window.prompt() calls and the two window.confirm()
   gates. The confirms had no security value — every write is a
   security-definer RPC scoped to auth.uid() — they were mis-tap guards, and a
   9px target is what made them necessary.
   ------------------------------------------------------------------------- */

function Sheet({ children, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="herb-sheet-scrim"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="herb-sheet" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

const labelStyle = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#2A2932' };
const fieldStyle = {
  border: '1px solid #E7DFD4', background: '#FBF7F1', color: '#2A2932',
  borderRadius: 12, padding: '12px 14px', fontSize: 16, fontFamily: 'inherit',
  minHeight: 48, width: '100%',
};

function PlanSheet({ busy, weekStart, mainDate, cadence, setWeekStart, setMainDate, setCadence, onSubmit, hasTrips }) {
  return (
    <>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>The week this covers</h2>
      <p style={{ margin: 0, color: '#5B5966', fontSize: 14 }}>
        HERB takes these from your plan. Change them only if the shop is landing on the wrong day.
      </p>
      <label style={labelStyle}>
        Week to cover
        <input type="date" style={fieldStyle} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
      </label>
      <label style={labelStyle}>
        Main shop
        <input type="date" style={fieldStyle} value={mainDate} onChange={(e) => setMainDate(e.target.value)} />
      </label>
      <label style={labelStyle}>
        Top up every
        <select style={fieldStyle} value={String(cadence)} onChange={(e) => setCadence(Number(e.target.value))}>
          {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} days</option>)}
        </select>
      </label>
      <p style={{ margin: 0, color: '#5B5966', fontSize: 13 }}>
        Fish, salad and other short-life food will not survive a single weekly shop, so those lines move to the top-up.
      </p>
      <button type="button" className="herb-btn herb-btn-primary" disabled={busy} onClick={onSubmit}>
        {busy ? 'Building…' : hasTrips ? 'Rebuild the list' : 'Build my list'}
      </button>
      {hasTrips ? (
        <p style={{ margin: 0, color: 'var(--amber-text)', fontSize: 13 }}>
          Rebuilding starts the list again — anything you have already ticked clears.
        </p>
      ) : null}
    </>
  );
}

function PackSheet({ busy, item, onSubmit, onClose }) {
  const [price, setPrice] = useState('');
  const [pack, setPack] = useState('');

  return (
    <>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{item.label}</h2>
      <p style={{ margin: 0, color: '#5B5966', fontSize: 14 }}>
        What did you actually pick up? This teaches HERB the real price — this list keeps its estimate.
      </p>
      <label style={labelStyle}>
        Price for one pack (£)
        <input
          type="text" inputMode="decimal" placeholder="2.40" style={fieldStyle}
          value={price} onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Pack size in {item.unit || 'units'}{item.pack_size ? ` — currently ${item.pack_size}${item.unit || ''}` : ''}
        <input
          type="text" inputMode="decimal" placeholder="leave blank to keep it" style={fieldStyle}
          value={pack} onChange={(e) => setPack(e.target.value)}
        />
      </label>
      <button
        type="button" className="herb-btn herb-btn-primary" disabled={busy}
        onClick={() => onSubmit({ item, pricePounds: price, packSizeIn: pack })}
      >
        {busy ? 'Saving…' : 'Save it'}
      </button>
      <button type="button" className="herb-btn herb-btn-secondary" onClick={onClose}>Cancel</button>
    </>
  );
}

function ShopSheet({ busy, trip, ticked, missed, estimate, onSubmit, onClose }) {
  const [total, setTotal] = useState('');

  return (
    <>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
        {trip.kind === 'main' ? 'Main shop' : 'Top-up'} done
      </h2>
      <p style={{ margin: 0, color: '#5B5966', fontSize: 14 }}>
        {ticked} item{ticked === 1 ? '' : 's'} into the pantry
        {missed > 0 ? `, ${missed} left behind — they'll come back on the next list.` : '.'}
      </p>
      <label style={labelStyle}>
        What did it come to? (£, optional)
        <input
          type="text" inputMode="decimal" placeholder={(estimate / 100).toFixed(2)} style={fieldStyle}
          value={total} onChange={(e) => setTotal(e.target.value)}
        />
      </label>
      <p style={{ margin: 0, color: '#5B5966', fontSize: 13 }}>
        One number off the receipt. Leave it blank and HERB uses its own estimate.
      </p>
      <button type="button" className="herb-btn herb-btn-primary" disabled={busy} onClick={() => onSubmit(total)}>
        {busy ? 'Saving…' : 'That’s the shop done'}
      </button>
      <button type="button" className="herb-btn herb-btn-secondary" onClick={onClose}>Not yet</button>
    </>
  );
}
