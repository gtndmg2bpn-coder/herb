// app/how-it-works/page.js
import Link from 'next/link';
import { getSupabase } from '../../lib/supabase';
import { loadPublicRecipes } from '../../lib/publicRecipes';
import { pickShopWindow } from '../../lib/recipeDisplay';
import { STEPS } from '../../lib/siteCopy';
import { referenceTargets, REFERENCE_WEIGHT_KG } from '../../lib/referenceAdult';
import PhonePlan from '../../components/site/PhonePlan';
import SiteFooter from '../../components/site/SiteFooter';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'How it works · HERB', description: 'How Herb plans, sizes, costs and rebalances your week of food.' };

// Real pack prices from the ingredients table, so the example list isn't made up.
const LIST_ITEMS = ['Chicken thighs', 'Eggs', 'Tenderstem broccoli', 'Greek yoghurt', 'Salmon fillet'];

function packLine(i) {
  if (i.name === 'Eggs') return 'Pack of 6';
  const q = Number(i.pack_quantity);
  const u = i.pack_unit || i.unit || 'g';
  return q >= 1000 && (u === 'g' || u === 'ml') ? `${q / 1000} ${u === 'g' ? 'kg' : 'l'}` : `${q} ${u}`;
}

export default async function HowItWorksPage() {
  let picks = [];
  let list = [];
  try {
    const supabase = getSupabase();
    picks = pickShopWindow(await loadPublicRecipes(supabase), 6);
    const { data } = await supabase
      .from('ingredients')
      .select('name, aisle, pack_quantity, pack_unit, unit, pack_price_pence, shop')
      .in('name', LIST_ITEMS);
    list = (data || []).sort((a, b) => LIST_ITEMS.indexOf(a.name) - LIST_ITEMS.indexOf(b.name));
  } catch {}
  const listTotal = list.reduce((s, i) => s + (i.pack_price_pence || 0), 0);

  return (
    <>
      <main>
        <section className="s-hero">
          <div className="s-wrap" style={{ maxWidth: 860 }}>
            <p className="s-eyebrow">How it works</p>
            <h1 className="s-h1" style={{ fontSize: 'clamp(36px,8vw,64px)' }}>Takes the planning off your plate.</h1>
            <p className="s-lede">Four things Herb does every week, so you don&rsquo;t have to do them in your head.</p>
          </div>
        </section>

        {STEPS.map((s, i) => (
          <section className="s-section s-rule" key={s.title}>
            <div className="s-wrap s-hero-grid">
              <div>
                <div className="s-step-n">{i + 1}</div>
                <h2 className="s-h2">{s.title}</h2>
                <p className="s-lede">{s.body}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {i === 0 ? (
                  <div className="s-panel s-panel-white" style={{ width: '100%', maxWidth: 420 }}>
                    <p className="s-eyebrow">Example</p>
                    {[['Weight', `${REFERENCE_WEIGHT_KG} kg`], ['Goal', `${REFERENCE_WEIGHT_KG - 5} kg`], ['Pace', 'Steady: about 0.5% a week'], ['Daily calories', `${Math.round(referenceTargets.target_kcal).toLocaleString('en-GB')} kcal`], ['Daily protein', `${referenceTargets.target_protein_g} g`]].map(([k, v]) => (
                      <div key={k} className="s-ing-row"><span>{k}</span><span>{v}</span></div>
                    ))}
                  </div>
                ) : null}
                {i === 1 ? <PhonePlan picks={picks} /> : null}
                {i === 2 && list.length ? (
                  <div className="s-panel s-panel-white" style={{ width: '100%', maxWidth: 420 }}>
                    <p className="s-eyebrow">Example list · real prices</p>
                    {list.map((it) => (
                      <div key={it.name} className="s-ing-row">
                        <span>{it.name}<br /><span className="s-small" style={{ fontWeight: 400 }}>{packLine(it)} · {it.shop}</span></span>
                        <span>£{(it.pack_price_pence / 100).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="s-ing-row" style={{ borderBottom: 0, fontWeight: 800 }}><span>Total</span><span>£{(listTotal / 100).toFixed(2)}</span></div>
                  </div>
                ) : null}
                {i === 3 ? (
                  <div className="s-panel s-panel-white" style={{ width: '100%', maxWidth: 420 }}>
                    <p className="s-eyebrow">Wednesday</p>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Dinner out with friends</p>
                    <p className="s-body">Log it on the day. No guilt, no reset.</p>
                    <div className="s-phone-out" style={{ marginTop: 16, fontSize: 14 }}>
                      <b>Thursday and Friday rebalanced.</b> Calories are a weekly budget, so the week still lands. Protein stays where it should every day.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ))}

        <section className="s-section-tight">
          <div className="s-wrap">
            <div className="s-cta">
              <h2 className="s-h2">See your first week.</h2>
              <p className="s-body">Free to start. Your plan is sized to you from the first meal.</p>
              <div className="s-btns"><Link href="/signup" className="s-btn s-btn-primary">Start free</Link></div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
