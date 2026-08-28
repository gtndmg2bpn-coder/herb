// test/dates.test.js — run: TZ=Europe/London node test/dates.test.js
//
// Regression test for the BST date bug found on 28 August 2026, the first day a
// human looked at /plan and /dashboard side by side.
//
// Both pages carried their own addDays that parsed a date string as LOCAL
// midnight and formatted the result as UTC. Through BST that returned the day
// BEFORE the one asked for, so the dashboard calendar showed an empty Thursday
// 27th that was never planned and hid Thursday 3rd, which was. In GMT it is
// invisible, which is why it survived from March to August.
//
// These assertions are written to FAIL under Europe/London specifically, which
// is the only place the old code was wrong. Run this suite in a summer zone or
// it proves nothing — the runner sets TZ itself below if it was not given one.

if (!process.env.TZ) {
  // Re-exec under the zone the bug lives in, so `node test/dates.test.js` with
  // no ceremony still grades the thing it is supposed to grade.
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [__filename],
    { stdio: 'inherit', env: { ...process.env, TZ: 'Europe/London' } });
  process.exit(r.status ?? 1);
}

const assert = require('assert');
const { isoDate, addDays, daysBetween, dayLabel } = require('../lib/dates');
const engine = require('../lib/generatePlan');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}

console.log(`\n-- lib/dates under TZ=${process.env.TZ} ------------------------------`);

t('addDays(d, 0) is d — the exact bug, in BST', () => {
  assert.strictEqual(addDays('2026-08-28', 0), '2026-08-28');
});

t("the dashboard's week starts on the day it is asked for", () => {
  const week = Array.from({ length: 7 }, (_, i) => addDays('2026-08-28', i));
  assert.deepStrictEqual(week, [
    '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31',
    '2026-09-01', '2026-09-02', '2026-09-03',
  ]);
});

t('addDays is stable across a whole BST year, one day at a time', () => {
  let d = '2026-01-01';
  for (let i = 0; i < 400; i++) {
    const next = addDays(d, 1);
    assert.strictEqual(daysBetween(d, next), 1, `${d} -> ${next}`);
    d = next;
  }
  assert.strictEqual(d, '2027-02-05');
});

t('it survives both clock changes', () => {
  // BST began 29 Mar 2026 and ends 25 Oct 2026.
  assert.strictEqual(addDays('2026-03-28', 1), '2026-03-29');
  assert.strictEqual(addDays('2026-03-29', 1), '2026-03-30');
  assert.strictEqual(addDays('2026-10-24', 1), '2026-10-25');
  assert.strictEqual(addDays('2026-10-25', 1), '2026-10-26');
});

t('negative and multi-day moves work', () => {
  assert.strictEqual(addDays('2026-09-01', -1), '2026-08-31');
  assert.strictEqual(addDays('2026-08-28', 7), '2026-09-04');
  assert.strictEqual(addDays('2026-02-28', 1), '2026-03-01');   // no leap day in 2026
});

t('THE ONE THAT STOPS IT COMING BACK: dates and the engine agree', () => {
  // lib/generatePlan.js keeps its own addDays on purpose — it is a graded pure
  // function with no imports. Two implementations are only safe if something
  // asserts they are the same thing.
  let d = '2026-01-01';
  for (let i = 0; i < 400; i++) {
    assert.strictEqual(addDays(d, 1), engine.addDays(d, 1), `diverged at ${d}`);
    assert.strictEqual(daysBetween('2026-01-01', d), engine.daysBetween('2026-01-01', d), `daysBetween diverged at ${d}`);
    d = addDays(d, 1);
  }
});

t('isoDate reads the LOCAL day, not the UTC one', () => {
  // 00:30 on 28 Aug in London is still 27 Aug in UTC. The old isoDate returned
  // the 27th and the dashboard spent that hour showing yesterday.
  const justAfterMidnight = new Date('2026-08-28T00:30:00+01:00');
  assert.strictEqual(isoDate(justAfterMidnight), '2026-08-28');
  const lateEvening = new Date('2026-08-28T23:30:00+01:00');
  assert.strictEqual(isoDate(lateEvening), '2026-08-28');
});

t('isoDate defaults to now and round-trips through addDays', () => {
  const today = isoDate();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(addDays(addDays(today, 5), -5), today);
});

t('dayLabel names the day it was given', () => {
  assert.strictEqual(dayLabel('2026-08-28'), 'Fri 28 Aug');
  assert.strictEqual(dayLabel('2026-09-03'), 'Thu 3 Sept');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
