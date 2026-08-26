// app/admin/page.js
'use client';

// Admin Dashboard v1 — read-only. The ONLY data call on this page is
// supabase.rpc('admin_overview'); the RPC owns authorisation (it raises for
// non-admins, which we render as a calm "Not authorized" card). No .from(),
// no .select(), no writes, no other endpoints. All colours come from the
// globals.css custom properties — no hex values are hard-coded here.

import { useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabaseBrowser';

const fontSerif = 'var(--font-newsreader), "Newsreader", Georgia, serif';

const cardStyle = {
  background: 'var(--cream)',
  border: '1px solid var(--hairline)',
  borderRadius: 20,
  padding: '24px 28px',
};
const eyebrowStyle = {
  fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
  color: 'var(--muted)', marginBottom: 12,
};
const bigNumberStyle = {
  fontFamily: fontSerif, fontSize: 40, fontWeight: 500, lineHeight: 1.1,
  color: 'var(--ink)', letterSpacing: '-.01em',
};

function formatStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatWeek(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || '');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function StatCard({ label, value }) {
  return (
    <div style={{ ...cardStyle, padding: '20px 22px' }}>
      <div style={{ ...eyebrowStyle, marginBottom: 8 }}>{label}</div>
      <div style={bigNumberStyle}>{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = getBrowserClient();
      // The one and only Supabase call on this page.
      const { data, error } = await supabase.rpc('admin_overview');
      if (cancelled) return;
      if (error) {
        setDenied(true);
      } else {
        setStats(data || {});
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <main style={{ background: 'var(--cream)', minHeight: '100vh', color: 'var(--ink)' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px' }}>
          <div style={{ ...cardStyle, marginTop: 24, color: 'var(--muted)', fontSize: 14 }}>Loading…</div>
        </div>
      </main>
    );
  }

  if (denied) {
    return (
      <main style={{ background: 'var(--cream)', minHeight: '100vh', color: 'var(--ink)' }}>
        <div style={{
          maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px',
          minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ ...cardStyle, textAlign: 'center', maxWidth: 420 }}>
            <div style={eyebrowStyle}>Admin</div>
            <div style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 500, marginBottom: 8 }}>
              Not authorized
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              This page is for Herb admins only.
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Defensive reads — every field may be 0 / empty / missing, and that renders clean.
  const accounts = stats.accounts || {};
  const total = accounts.total || 0;
  const signups = Array.isArray(stats.signups_by_week) ? stats.signups_by_week : [];
  const activation = stats.activation || {};
  const diets = Array.isArray(stats.by_diet) ? stats.by_diet : [];
  const maxSignups = signups.reduce((m, w) => Math.max(m, w.count || 0), 0);

  const activationItems = [
    { label: 'Planned', value: activation.with_plan || 0 },
    { label: 'Shopped', value: activation.with_shop || 0 },
    { label: 'Onboarded', value: activation.onboarded || 0 },
  ];

  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh', color: 'var(--ink)' }}>
      <div className="rise" style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px' }}>

        {/* 1 — Header */}
        <header style={{ marginTop: 8, marginBottom: 24 }}>
          <h1 style={{ fontFamily: fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-.02em', margin: 0 }}>
            Admin
          </h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            as of {formatStamp(stats.generated_at)}
          </div>
        </header>

        {/* 2 — Four stat cards (4-up on desktop, 2x2 on phones via .herb-grid-2) */}
        <div className="herb-grid herb-grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
          <StatCard label="Total accounts" value={total} />
          <StatCard label="New this week" value={accounts.new_7d || 0} />
          <StatCard label="Active (7d)" value={accounts.active_7d || 0} />
          <StatCard label="Dormant" value={accounts.dormant || 0} />
        </div>

        {/* 3 — Signups strip: plain CSS bars, height proportional to count */}
        <section style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={eyebrowStyle}>Signups by week</div>
          {signups.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>No signups yet.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 150 }}>
              {signups.map((w) => {
                const count = w.count || 0;
                const height = maxSignups > 0 ? Math.max(3, Math.round((count / maxSignups) * 110)) : 3;
                return (
                  <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{count}</div>
                    <div
                      title={`${formatWeek(w.week)} — ${count}`}
                      style={{
                        width: '100%', maxWidth: 40, height, borderRadius: 6,
                        background: 'var(--pink)',
                      }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {formatWeek(w.week)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 4 — Activation row: each shown as n / total */}
        <section style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={eyebrowStyle}>Activation</div>
          <div className="herb-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {activationItems.map((item) => (
              <div key={item.label}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: fontSerif, fontSize: 26, color: 'var(--ink)' }}>
                  {item.value}
                  <span style={{ fontSize: 15, color: 'var(--muted)' }}> / {total}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5 — Diet split: labelled list */}
        <section style={cardStyle}>
          <div style={eyebrowStyle}>Diet split</div>
          {diets.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>No diet data yet.</div>
          ) : (
            <div>
              {diets.map((row, i) => (
                <div
                  key={row.diet || i}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>
                    {row.diet}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{row.count || 0}</span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
