'use client';
// app/spend/page.js

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabaseBrowser';

// Editorial design tokens (match dashboard / recipe book)
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
function dayLabel(iso) { return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function money(pence) { if (pence == null) return '—'; return `£${(Number(pence) / 100).toFixed(2)}`; }

// Display labels — never written to the DB.
const CATEGORY_LABELS = {
  grocery: 'Groceries',
  eating_out: 'Eating out',
  sundry: 'Sundries',
};
// Display order for the by-category breakdown.
const CATEGORY_ORDER = ['grocery', 'eating_out', 'sundry'];
// Accent per category, purely visual.
const CATEGORY_ACCENT = {
  grocery: GREEN,
  eating_out: BLUE,
  sundry: AMBER,
};

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

export default function SpendPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);

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

      // Week window replicated EXACTLY from the dashboard (Monday-based).
      const today = isoDate(new Date());
      const monday = new Date(`${today}T00:00:00`);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const weekStart = isoDate(monday);

      const { data, error } = await supabase
        .from('spend_log')
        .select('amount_pence, spend_date, category, note')
        .eq('user_id', uid)
        .gte('spend_date', weekStart)
        .order('spend_date', { ascending: false });

      if (cancelled) return;
      // KIMI NOTE: on read error we fall back to the empty state rather than
      // crashing the page — spend_log is read-only here and there is no
      // dashboard-style error surface specified for this slice.
      setRows(error ? [] : (data || []));
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const totalPence = rows.reduce((sum, row) => sum + (row.amount_pence || 0), 0);

  // By category — only categories present in the data, in the spec's order.
  const byCategory = CATEGORY_ORDER
    .map((category) => ({
      category,
      pence: rows
        .filter((row) => row.category === category)
        .reduce((sum, row) => sum + (row.amount_pence || 0), 0),
    }))
    .filter((entry) => entry.pence > 0);

  // By day — newest first (rows already arrive newest-first).
  const dayTotals = new Map();
  for (const row of rows) {
    dayTotals.set(row.spend_date, (dayTotals.get(row.spend_date) || 0) + (row.amount_pence || 0));
  }
  const byDay = Array.from(dayTotals.entries()).map(([date, pence]) => ({ date, pence }));

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

  return (
    <main style={{ background: CREAM, minHeight: '100vh', color: INK }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px' }}>
        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: MUTED, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        {loading ? (
          <div style={{ ...cardStyle, marginTop: 24, color: MUTED, fontSize: 14 }}>Loading this week&rsquo;s spend…</div>
        ) : loggedOut ? (
          <div style={{ ...cardStyle, marginTop: 24 }}>
            <div style={eyebrowStyle}>This week</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sign in to see your spend.</div>
          </div>
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────────── */}
            <header style={{ marginTop: 24, marginBottom: 28 }}>
              <div style={{ ...eyebrowStyle, color: PINK }}>This week</div>
              <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>{money(totalPence)}</h1>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>Logged spend</div>
            </header>

            {rows.length === 0 ? (
              <div style={cardStyle}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>No spend logged this week yet.</div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
                  Log a spend from the dashboard and it will show up here.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 20 }}>
                {/* ── By category ────────────────────────────────────── */}
                <section style={cardStyle}>
                  <div style={eyebrowStyle}>By category</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {byCategory.map((entry) => (
                      <div key={entry.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_ACCENT[entry.category] || HAIRLINE }} />
                          {categoryLabel(entry.category)}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{money(entry.pence)}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ── By day ─────────────────────────────────────────── */}
                <section style={cardStyle}>
                  <div style={eyebrowStyle}>By day</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {byDay.map((entry) => (
                      <div key={entry.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{dayLabel(entry.date)}</span>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{money(entry.pence)}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ── Transactions ───────────────────────────────────── */}
                <section style={cardStyle}>
                  <div style={eyebrowStyle}>Transactions</div>
                  <div style={{ display: 'grid' }}>
                    {rows.map((row, index) => (
                      <div
                        key={`${row.spend_date}-${index}`}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: 16,
                          padding: '10px 0',
                          borderTop: index === 0 ? 'none' : `1px solid ${HAIRLINE}`,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>
                          <span style={{ color: MUTED }}>{dayLabel(row.spend_date)}</span>
                          {' · '}
                          <span style={{ fontWeight: 600 }}>{categoryLabel(row.category)}</span>
                          {row.note ? <span style={{ color: MUTED }}>{' · '}{row.note}</span> : null}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{money(row.amount_pence)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
