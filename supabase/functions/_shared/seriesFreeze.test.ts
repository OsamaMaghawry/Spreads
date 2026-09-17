import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freezeSeries, digestDrift, historyFinding, digestDriftFinding, driftEmail, FREEZE_AFTER_SESSIONS
} from "./seriesFreeze.ts";

// Alton's stored rows, 2-14 September 2026, verbatim from production. Eight
// session days; with a five-session window the 2nd, 3rd and 4th are frozen.
const STORED = [
  { day: "2026-09-02", equity: 141140.1, premium_cum: -761, shares_booked: -883, shares_open: -59, options_open: 0, performance: -1703 },
  { day: "2026-09-03", equity: 140844.76, premium_cum: -757, shares_booked: -817, shares_open: 0, options_open: -23, performance: -1597 },
  { day: "2026-09-04", equity: 138870.97, premium_cum: -757, shares_booked: -817, shares_open: 0, options_open: -1831, performance: -3405 },
  { day: "2026-09-08", equity: 141530.46, premium_cum: -495, shares_booked: -817, shares_open: 632, options_open: -500, performance: -1180 },
  { day: "2026-09-09", equity: 141547.64, premium_cum: -1686, shares_booked: 441.91, shares_open: 31, options_open: 230, performance: -983.09 },
  { day: "2026-09-10", equity: 141247.97, premium_cum: -1473, shares_booked: 441.91, shares_open: -394, options_open: 317, performance: -1108.09 },
  { day: "2026-09-11", equity: 141577.61, premium_cum: -1230, shares_booked: 441.91, shares_open: -206, options_open: 45, performance: -949.09 },
  { day: "2026-09-14", equity: 141294.56, premium_cum: -809, shares_booked: 441.91, shares_open: -853, options_open: 134, performance: -1086.09 }
];
const clone = (rows: any[]) => rows.map((r) => ({ ...r }));

test("an unchanged rebuild writes every row and holds nothing", () => {
  const f = freezeSeries(STORED, clone(STORED));
  assert.equal(f.frozenBefore, "2026-09-08");
  assert.equal(f.rows.length, STORED.length);
  assert.deepEqual(f.drift, []);
  assert.deepEqual(f.held, []);
  assert.equal(f.rewritten, false);
});

test("16 September: a rebuild that blanks a frozen day is held, and the blank is named", () => {
  const computed = clone(STORED).map((r) => (r.day <= "2026-09-04" ? { ...r, performance: null, options_open: null } : r));
  const f = freezeSeries(STORED, computed);
  // The three frozen days are kept as stored; the recent five are written.
  assert.deepEqual(f.held, ["2026-09-02", "2026-09-03", "2026-09-04"]);
  assert.deepEqual(f.rows.map((r) => r.day), ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14"]);
  const sep4 = f.drift.filter((d) => d.day === "2026-09-04");
  assert.deepEqual(sep4, [
    { day: "2026-09-04", column: "performance", stored: -3405, computed: null, kind: "blanked" },
    { day: "2026-09-04", column: "options_open", stored: -1831, computed: null, kind: "blanked" }
  ]);
});

test("a frozen day that moves by more than a cent is held; a cent of rounding is not", () => {
  const computed = clone(STORED).map((r) =>
    r.day === "2026-09-03" ? { ...r, performance: -1597.01 }
      : r.day === "2026-09-04" ? { ...r, performance: -3400 }
        : r);
  const f = freezeSeries(STORED, computed);
  assert.deepEqual(f.held, ["2026-09-04"]);
  assert.deepEqual(f.drift, [{ day: "2026-09-04", column: "performance", stored: -3405, computed: -3400, kind: "changed" }]);
});

test("filling a stored blank is a repair, not a change", () => {
  const stored = clone(STORED).map((r) => (r.day === "2026-09-03" ? { ...r, performance: null } : r));
  const f = freezeSeries(stored, clone(STORED));
  assert.deepEqual(f.held, []);
  assert.deepEqual(f.drift, []);
  assert.equal(f.rows.length, STORED.length);
});

test("the recent window may move freely; today always may", () => {
  const computed = clone(STORED).map((r) => (r.day >= "2026-09-08" ? { ...r, performance: r.performance + 500 } : r));
  const f = freezeSeries(STORED, computed);
  assert.deepEqual(f.held, []);
  assert.equal(f.rows.length, STORED.length);
});

test("a new day is written whether it is before, inside or after what is stored", () => {
  const computed = [{ day: "2026-08-31", performance: -1000 }, ...clone(STORED), { day: "2026-09-15", performance: -900 }];
  const f = freezeSeries(STORED, computed);
  assert.equal(f.rows.length, STORED.length + 2);
  assert.deepEqual(f.held, []);
});

test("a series shorter than the window freezes nothing", () => {
  const short = STORED.slice(0, FREEZE_AFTER_SESSIONS);
  const computed = clone(short).map((r) => ({ ...r, performance: null }));
  const f = freezeSeries(short, computed);
  assert.equal(f.frozenBefore, null);
  assert.deepEqual(f.held, []);
});

test("rewriteHistory writes the past and says so", () => {
  const computed = clone(STORED).map((r) => (r.day === "2026-09-04" ? { ...r, performance: -3400 } : r));
  const f = freezeSeries(STORED, computed, { rewriteHistory: true });
  assert.deepEqual(f.held, []);
  assert.equal(f.rows.length, STORED.length);
  assert.equal(f.drift.length, 1);
  assert.equal(f.rewritten, true);
  const finding = historyFinding(f);
  assert.equal(finding?.code, "history_rewritten");
});

test("a broker equity restated on a frozen day is a change; a broker blank is not", () => {
  const computed = clone(STORED).map((r) =>
    r.day === "2026-09-02" ? { ...r, equity: null } : r.day === "2026-09-03" ? { ...r, equity: 140900 } : r);
  const f = freezeSeries(STORED, computed);
  assert.deepEqual(f.held, ["2026-09-03"]);
  assert.equal(f.drift[0].column, "equity");
});

test("the frozen finding is one per account with a signature over the days", () => {
  const computed = clone(STORED).map((r) => (r.day <= "2026-09-03" ? { ...r, performance: null } : r));
  const finding = historyFinding(freezeSeries(STORED, computed));
  assert.equal(finding?.code, "history_frozen");
  assert.equal(finding?.action, "hold_writes");
  assert.equal(finding?.subject, "day-by-day series");
  assert.equal(finding?.detail.signature, "2026-09-02,2026-09-03");
  assert.equal(finding?.detail.blanked, 2);
  assert.match(finding!.message, /2 stored past days/);
  assert.equal(historyFinding(freezeSeries(STORED, clone(STORED))), null);
});

// ---------------------------------------------------------------------------
// A sent digest against the series now
// ---------------------------------------------------------------------------

const SENT = {
  measuredFrom: "2026-09-04", measuredTo: "2026-09-11",
  performance: 2455.91, premiumLine: -473, sharesBooked: 1258.91, sharesMark: -206, optionsMark: 1876,
  equityChange: 2706.64, equityEnd: 141577.61
};

test("a digest whose figures the series still gives has no drift", () => {
  assert.deepEqual(digestDrift(SENT, { ...SENT, performance: 2455.914 }), []);
});

test("a blanked series is drift on every figure the email printed", () => {
  const now = { ...SENT, performance: null, premiumLine: null, sharesBooked: null, sharesMark: null, optionsMark: null };
  const d = digestDrift(SENT, now);
  assert.deepEqual(d.map((x) => x.field), ["performance", "premiumLine", "sharesBooked", "sharesMark", "optionsMark"]);
  assert.deepEqual(d[0], { field: "performance", sent: 2455.91, now: null });
});

test("a moved close is drift even when the money agrees", () => {
  const d = digestDrift(SENT, { ...SENT, measuredTo: "2026-09-10" });
  assert.deepEqual(d, [{ field: "measuredTo", sent: "2026-09-11", now: "2026-09-10" }]);
});

test("the digest finding names the week, the first figure and both values", () => {
  const d = digestDrift(SENT, { ...SENT, performance: 785.91, equityChange: 47.15 });
  const f = digestDriftFinding({ week_start: "2026-09-07", mode: "owner", sent_at: "2026-09-12T12:00:00Z" }, d);
  assert.equal(f?.code, "digest_drift");
  assert.equal(f?.subject, "2026-09-07/owner");
  assert.match(f!.message, /performance was \$2455\.91; the stored series now gives \$785\.91, and 1 more figure moved/);
  assert.equal(f?.detail.signature, "performance:2455.91>785.91;equityChange:2706.64>47.15");
  assert.equal(digestDriftFinding({ week_start: "2026-09-07", mode: "owner" }, []), null);
});

test("the mail lists every held figure with both values and changes nothing", () => {
  const computed = clone(STORED).map((r) => (r.day === "2026-09-04" ? { ...r, performance: null } : r));
  const held = historyFinding(freezeSeries(STORED, computed))!;
  const digest = digestDriftFinding(
    { week_start: "2026-09-07", mode: "owner" },
    digestDrift(SENT, { ...SENT, performance: null })
  )!;
  const mail = driftEmail("Alton Live", [held, digest]);
  assert.equal(mail.subject, "DeltaMint: stored history held for Alton Live");
  assert.match(mail.text, /2026-09-04  performance  stored -\$3405\.00  computed —  \(blanked\)/);
  assert.match(mail.text, /performance  sent \$2455\.91  now —/);
  assert.match(mail.text, /Nothing was changed by this message/);
  assert.match(mail.html, /<pre/);
});
