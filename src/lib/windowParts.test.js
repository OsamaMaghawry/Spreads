import { test } from "node:test";
import assert from "node:assert/strict";
import { windowParts } from "./windowParts.js";

// Alton's stored rows around the week of 7-11 September 2026, verbatim from
// production `account_equity_daily`. 7 September was Labor Day: no row.
const ROWS = [
  { day: "2026-09-03", equity: 140844.76, premium_cum: -757, shares_booked: -817, shares_open: 0, options_open: -23, performance: -1597 },
  { day: "2026-09-04", equity: 138870.97, premium_cum: -757, shares_booked: -817, shares_open: 0, options_open: -1831, performance: -3405 },
  { day: "2026-09-08", equity: 141530.46, premium_cum: -495, shares_booked: -817, shares_open: 632, options_open: -500, performance: -1180 },
  { day: "2026-09-09", equity: 141547.64, premium_cum: -1686, shares_booked: 441.91, shares_open: 31, options_open: 230, performance: -983.09 },
  { day: "2026-09-10", equity: 141247.97, premium_cum: -1473, shares_booked: 441.91, shares_open: -394, options_open: 317, performance: -1108.09 },
  { day: "2026-09-11", equity: 141577.61, premium_cum: -1230, shares_booked: 441.91, shares_open: -206, options_open: 45, performance: -949.09 },
  { day: "2026-09-14", equity: 141294.56, premium_cum: -809, shares_booked: 441.91, shares_open: -853, options_open: 134, performance: -1086.09 }
];

test("the owner's week: four parts, both ends of each mark, and they add to the headline", () => {
  const p = windowParts(ROWS, { from: "2026-09-07", to: "2026-09-11" });
  assert.ok(p);
  // Differenced between the Friday close before the week and the Friday
  // close inside it -- the holiday Monday has no row and changes nothing.
  assert.equal(p.from, "2026-09-04");
  assert.equal(p.to, "2026-09-11");
  assert.equal(p.premium, -473);
  assert.equal(p.sharesBooked, 1258.91);
  assert.deepEqual(p.sharesMark, { start: 0, end: -206, change: -206 });
  // The answer to "where did 2.4k come from": the option book was marked
  // $1,831 under water at the close before the week.
  assert.deepEqual(p.optionsMark, { start: -1831, end: 45, change: 1876 });
  assert.equal(p.total, 2455.91);
  assert.equal(
    Math.round((p.premium + p.sharesBooked + p.sharesMark.change + p.optionsMark.change) * 100) / 100,
    p.total
  );
});

test("no `from` means no window, and no parts", () => {
  assert.equal(windowParts(ROWS, {}), null);
  assert.equal(windowParts(ROWS, { to: "2026-09-11" }), null);
});

test("a window at the account's beginning has no close before it, so nothing is differenced", () => {
  assert.equal(windowParts(ROWS, { from: "2026-09-03" }), null);
});

test("an end missing a column cannot anchor the window", () => {
  const rows = ROWS.map((r) => (r.day === "2026-09-11" ? { ...r, options_open: null } : r));
  // The last COMPLETE close inside the window is then 09-10, not nothing.
  const p = windowParts(rows, { from: "2026-09-07", to: "2026-09-11" });
  assert.equal(p.to, "2026-09-10");
  assert.equal(p.total, -1108.09 - -3405);
});

test("parts that do not add to the headline are withheld, not printed", () => {
  const rows = ROWS.map((r) => (r.day === "2026-09-11" ? { ...r, performance: -900 } : r));
  assert.equal(windowParts(rows, { from: "2026-09-07", to: "2026-09-11" }), null);
});

test("no `to` runs the window to the last stored day", () => {
  const p = windowParts(ROWS, { from: "2026-09-07" });
  assert.equal(p.to, "2026-09-14");
  assert.equal(p.total, Math.round((-1086.09 - -3405) * 100) / 100);
});
