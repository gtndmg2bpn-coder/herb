'use client';
// app/tailor/page.js
//
// "Tailor your plan" (Karum, 8 Nov 2026): everything signup didn't ask, asked only
// when the person wants it. Up to ten things, none required. Each section saves
// on its own button so a half-finished page never loses anything.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import { MODES } from '../../lib/modes';

const PACE_OPTIONS = [
  { value: 'steady', label: 'Steady', hint: 'About 500 kcal a day below what you burn' },
  { value: 'moderate', label: 'Moderate', hint: 'About 750 kcal a day below' },
  { value: 'faster', label: 'Faster', hint: 'About 1,000 kcal a day below, never under your resting burn' },
];

const DISLIKE_OPTIONS = [
  'mushrooms', 'olives', 'coriander', 'blue cheese', 'goat’s cheese', 'anchovies',
  'sardines', 'mackerel', 'liver', 'kidney', 'black pudding', 'brussels sprouts',
  'cabbage', 'kale', 'beetroot', 'aubergine', 'courgette', 'fennel', 'gherkins', 'capers',
  'horseradish', 'onions', 'garlic', 'very spicy / chilli', 'tomatoes', 'peppers',
  'avocado', 'tofu', 'marmite / yeast extract', 'prawns',
];

export default function TailorPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [availableModes, setAvailableModes] = useState(['keto']);
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState('keto');
  const [pace, setPace] = useState('steady');
  const [units, setUnits] = useState('metric');
  const [household, setHousehold] = useState(1);
  const [dislikes, setDislikes] = useState([]);
  const [dislikesText, setDislikesText] = useState('');

  useEffect(() => {
    let alive = true;
    const supabase = getBrowserClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) { router.replace('/login'); return; }
      const [{ data: prof }, { data: diets }] = await Promise.all([
        supabase.from('profiles').select('display_name, diet, pace, preferred_units, household_portions, dislikes, goal').eq('id', session.user.id).maybeSingle(),
        supabase.from('diets').select('key'),
      ]);
      if (!alive) return;
      if (!prof) { router.replace('/onboarding'); return; }
      setProfile(prof);
      setDisplayName(prof.display_name || '');
      setMode(prof.diet || 'keto');
      setPace(prof.pace || 'steady');
      setUnits(prof.preferred_units || 'metric');
      setHousehold(prof.household_portions || 1);
      const curated = (prof.dislikes || []).filter((d) => DISLIKE_OPTIONS.includes(d));
      setDislikes(curated);
      setDislikesText((prof.dislikes || []).filter((d) => !DISLIKE_OPTIONS.includes(d)).join(', '));
      const keys = (diets || []).map((d) => d.key).filter((k) => MODES.some((m) => m.key === k));
      if (keys.length) setAvailableModes(Array.from(new Set(['keto', ...keys])));
    })();
    return () => { alive = false; };
  }, [router]);

  async function save(section, patch) {
    setError(''); setSaved(''); setSaving(section);
    const supabase = getBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/login'); return; }
    const { error: e } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', session.user.id);
    setSaving('');
    if (e) { setError(e.message); return; }
    setSaved(section);
  }

  if (!profile) return null;

  const Section = ({ id, title, sub, children, patch }) => (
    <section className="ob-preview" style={{ marginTop: 16 }}>
      <h2 className="ob-h" style={{ fontSize: 22, marginBottom: 4 }}>{title}</h2>
      {sub ? <p className="ob-note" style={{ margin: '0 0 14px' }}>{sub}</p> : null}
      {children}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button type="button" className="s-btn s-btn-primary" style={{ padding: '10px 18px' }} disabled={saving === id} onClick={() => save(id, patch())}>
          {saving === id ? 'Saving…' : 'Save'}
        </button>
        {saved === id ? <span className="ob-note" style={{ margin: 0 }}>Saved.</span> : null}
      </div>
    </section>
  );

  return (
    <main className="ob">
      <p className="s-eyebrow">Tailor your plan</p>
      <h1 className="ob-h">Only what you want to change.</h1>
      <p className="ob-sub">None of this is required. Your plan already works from the five things you told Herb at the start. <Link href="/dashboard" className="s-link">Back to your dashboard</Link></p>

      <Section id="name" title="What should Herb call you?" patch={() => ({ display_name: displayName.trim() || null })}>
        <input className="ob-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
      </Section>

      <Section id="mode" title="Your goal" sub="Changing this changes the rules your plan is built on. Your targets update the next time you confirm them on the dashboard." patch={() => ({ diet: mode })}>
        <div className="ob-cards">
          {MODES.map((m) => {
            const on = availableModes.includes(m.key);
            return (
              <button type="button" key={m.key} className={`ob-card ${mode === m.key ? 'sel' : ''}`} disabled={!on} onClick={() => on && setMode(m.key)}>
                <b>{m.label}{!on ? <span className="ob-soon">Coming soon</span> : null}</b><span>{m.short}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {profile.goal === 'lose weight' ? (
        <Section id="pace" title="How fast?" sub="Herb never plans below your resting burn, or below 1,200 kcal a day." patch={() => ({ pace })}>
          <div className="ob-cards">
            {PACE_OPTIONS.map((p) => (
              <button type="button" key={p.value} className={`ob-card ${pace === p.value ? 'sel' : ''}`} onClick={() => setPace(p.value)}>
                <b>{p.label}</b><span>{p.hint}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section id="units" title="Units" patch={() => ({ preferred_units: units })}>
        <div className="ob-pills" style={{ marginBottom: 0 }}>
          <button type="button" className={`ob-pill ${units === 'metric' ? 'sel' : ''}`} onClick={() => setUnits('metric')}>cm &amp; kg</button>
          <button type="button" className={`ob-pill ${units === 'imperial' ? 'sel' : ''}`} onClick={() => setUnits('imperial')}>ft &amp; stone</button>
        </div>
      </Section>

      <Section id="household" title="How many are you cooking for?" sub="Herb scales the shopping, not your portion." patch={() => ({ household_portions: household })}>
        <div className="ob-pills" style={{ marginBottom: 0 }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button type="button" key={n} className={`ob-pill ${household === n ? 'sel' : ''}`} onClick={() => setHousehold(n)}>{n}</button>
          ))}
        </div>
      </Section>

      <Section
        id="dislikes" title="Anything you’d rather not eat?"
        sub="Dislikes are avoided where Herb can. Allergies are different: they are never in your plan, and you set them on the dashboard."
        patch={() => ({ dislikes: Array.from(new Set([...dislikes, ...dislikesText.split(',').map((s) => s.trim()).filter(Boolean)])) })}
      >
        <div className="ob-pills" style={{ marginBottom: 12 }}>
          {DISLIKE_OPTIONS.map((d) => (
            <button type="button" key={d} className={`ob-pill ${dislikes.includes(d) ? 'sel' : ''}`} style={{ padding: '8px 14px', fontSize: 14 }} onClick={() => setDislikes((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}>{d}</button>
          ))}
        </div>
        <input className="ob-input" value={dislikesText} onChange={(e) => setDislikesText(e.target.value)} placeholder="Anything else, separated by commas" />
      </Section>

      {error ? <p role="alert" className="ob-error">{error}</p> : null}
    </main>
  );
}
