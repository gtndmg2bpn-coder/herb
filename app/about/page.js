// app/about/page.js
// Every sentence here is true today. Claims about things still being built say so.
import Link from 'next/link';
import SiteFooter from '../../components/site/SiteFooter';

export const metadata = { title: 'About · HERB', description: 'Why Herb exists and how it is built.' };

const PRINCIPLES = [
  { title: 'The numbers have to be right', body: 'Every figure on a recipe is added up from its ingredients: UK label nutrition, real supermarket prices and the pack sizes you actually buy. If a number can’t be backed up, it doesn’t go on the page.' },
  { title: 'Real food, not a regime', body: 'Curries, stews, a full English, pie and mash. High in protein, low in carbs, and the kind of food you’d cook anyway.' },
  { title: 'Plans that survive real life', body: 'Nobody eats perfectly for a week. Herb treats calories as a weekly budget, so a night out is a rebalance, not a failure.' },
  { title: 'Waste is money', body: 'Whole packs on the list, a plan that finishes what you open, and a clear view of what got eaten and what got binned.' },
];

export default function AboutPage() {
  return (
    <>
      <main>
        <section className="s-hero">
          <div className="s-wrap s-hero-grid">
            <div>
              <p className="s-eyebrow">About Herb</p>
              <h1 className="s-h1" style={{ fontSize: 'clamp(36px,8vw,64px)' }}>Food, health and the bill, in one place.</h1>
              <p className="s-lede">
                Losing weight usually means one app for calories, a spreadsheet for the shopping and a fridge full of half-used packs.
                Herb puts the food, the numbers and the cost in one plan, and keeps it working when the week goes sideways.
              </p>
            </div>
            <div className="s-recipe-img" style={{ backgroundImage: "url('/assets/chicken-shawarma.jpg')", margin: 0, borderRadius: 24 }} role="img" aria-label="Slow cooked chicken shawarma" />
          </div>
        </section>

        <section className="s-section s-rule">
          <div className="s-wrap">
            <p className="s-eyebrow">What we hold ourselves to</p>
            <h2 className="s-h2">Four rules.</h2>
            <div className="s-steps">
              {PRINCIPLES.map((p) => (
                <div className="s-step" key={p.title}>
                  <h3 className="s-h3">{p.title}</h3>
                  <p className="s-body">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="s-section s-rule">
          <div className="s-wrap s-prose">
            <p className="s-eyebrow">Who&rsquo;s behind it</p>
            <h2 className="s-h2" style={{ marginBottom: 24 }}>Built in Cornwall.</h2>
            <p>
              Herb was started by a founder who spent twenty years in food manufacturing, operations and product development
              before deciding the problem worth solving was a personal one: losing weight without living on a spreadsheet, and without the food bill getting out of hand.
            </p>
            <p>
              The approach comes from the factory floor. Know exactly what goes into every portion, know exactly what it costs, plan production
              around what&rsquo;s in stock, and don&rsquo;t throw money in the bin. Herb does that for a home kitchen.
            </p>
            <p>
              It&rsquo;s early. The recipe book is growing, with 45 British, takeaway and winter dishes being tested now, and every recipe is
              cooked before its timings are trusted.
            </p>
          </div>
        </section>

        <section className="s-section-tight">
          <div className="s-wrap">
            <div className="s-cta">
              <h2 className="s-h2">See what a week looks like.</h2>
              <div className="s-btns">
                <Link href="/signup" className="s-btn s-btn-primary">Start free</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
