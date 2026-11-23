// app/dashboard/_dash/DashSpend.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import { CREAM, INK, PINK, SPEND_CATEGORIES, money } from './dashShared';
import Link from 'next/link';

export function DashSpend({ p }) {
  const { binnedPence, busy, eatenPence, eatingOutPence, grocerySpendPence, offPlanPence, setSpendForm, spendForm, submitSpend, sundrySpendPence, weekTotalPence } = p;

  return (
      //── This week's spend (dark card) ─────────────────────────────
      <section style={{ background: 'linear-gradient(135deg,#2A2932,#3A3847)', color: CREAM, borderRadius: 24, padding: '36px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: PINK, marginBottom: 8 }}>This week&rsquo;s spend</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.02em' }}>{money(weekTotalPence)}</div>
          <div style={{ fontSize: 13, color: '#C7C4D1', marginTop: 8 }}>
            Groceries {money(grocerySpendPence)} · Eating out (est.) {money(eatingOutPence)} · Off-plan {money(offPlanPence)} · Sundries {money(sundrySpendPence)}
          </div>
          <Link href="/spend" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, fontWeight: 700, color: CREAM, textDecoration: 'underline' }}>View logged spend →</Link>
          <div style={{ fontSize: 13, color: '#C7C4D1', marginTop: 4 }}>
            Eaten {money(eatenPence)} <span style={{ opacity: 0.75 }}>— what you actually consumed</span> · Binned {money(binnedPence)} <span style={{ opacity: 0.75 }}>— paid for but thrown away</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Amount (£)"
            value={spendForm.amountPounds}
            onChange={(event) => setSpendForm({ ...spendForm, amountPounds: event.target.value })}
            style={{ border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: CREAM, borderRadius: 12, padding: '12px 16px', fontSize: 14, width: 130, fontFamily: 'inherit' }}
          />
          <select
            value={spendForm.category}
            onChange={(event) => setSpendForm({ ...spendForm, category: event.target.value })}
            style={{ border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: CREAM, borderRadius: 12, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit' }}
          >
            {SPEND_CATEGORIES.map((category) => <option key={category} value={category} style={{ color: INK }}>{category.replace('_', ' ')}</option>)}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={submitSpend}
            style={{ background: PINK, color: INK, border: 'none', borderRadius: 100, padding: '0 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1 }}
          >
            Log spend
          </button>
        </div>
      </section>
  );
}