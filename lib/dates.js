// lib/dates.js
// THE ONE PLACE date arithmetic happens in the UI.
//
// WHY THIS FILE EXISTS — 28 August 2026.
//
// `/dashboard` and `/plan` each carried their own copy of isoDate and addDays,
// and both copies were wrong in the same way:
//
//     function isoDate(date) { return date.toISOString().slice(0, 10); }
//     function addDays(iso, days) {
//       const d = new Date(`${iso}T00:00:00`);   // parsed as LOCAL midnight
//       d.setDate(d.getDate() + days);
//       return isoDate(d);                       // formatted as UTC
//     }
//
// Local in, UTC out. Through BST that is a one-hour offset in the wrong
// direction, so every result came back a day EARLY:
//
//     addDays('2026-08-28', 0)  ->  '2026-08-27'
//
// The dashboard's week is `Array.from({length: 7}, (_, i) => addDays(today, i))`,
// so the whole calendar shifted back a day: it showed an empty Thursday 27th
// that was never planned and hid Thursday 3rd, which was. The fridge expiry
// warning (`addDays(today, 2)`) fired a day early for the same reason. In GMT
// it is invisible; from late March to late October it is wrong every day.
//
// `lib/generatePlan.js` never had the bug — its addDays is pure UTC and always
// was, with a comment saying so. The engine was right and the two pages that
// re-implemented it were wrong, which is the argument for this file: the fix is
// not "correct three copies", it is "have one".
//
// generatePlan keeps its own copy deliberately — it is a graded pure function
// with no imports and it stays that way. test/dates.test.js asserts the two
// implementations agree, so they cannot drift apart again silently.
//
// THE RULE, stated once so it survives: use LOCAL fields to ask what day it is
// HERE, and pure UTC arithmetic to move a date string. Never mix the two.

'use strict';

// What calendar date is it where the user is? Local fields, deliberately not
// toISOString() — in BST the UTC date is still yesterday's for the first hour
// of every day.
function isoDate(date) {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Move a YYYY-MM-DD string by N days. Pure UTC in and out, so no zone can touch
// it. Identical to lib/generatePlan.js addDays, and asserted so.
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whole days from a to b. UTC both ends for the same reason.
function daysBetween(a, b) {
  return Math.round(
    (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000
  );
}

// Display only. Parsed as local midnight ON PURPOSE — this is the one place the
// user's own zone is the right frame, because it is naming a day to a person.
function dayLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

module.exports = { isoDate, addDays, daysBetween, dayLabel };
