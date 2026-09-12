import test from "node:test";
import assert from "node:assert/strict";
import {
  auditAccount,
  impossibleResultFindings,
  massDeleteFinding,
  orphanedStockFinding,
  applyFindings,
  withheldKeys,
  deletionsHeld,
  withheld
} from "./integrity.ts";

// The real breach, from production. The owner's paper account PA3V7ZNHT66T
// computed a $189 loss on an XLY 119/118 put spread whose strikes cannot lose
// more than $125 — and, under the guard this framework replaces, that one row
// left the whole account with zero stored trades.
const XLY = {
  trade_key: "XLY260814P00119000|XLY260814P00118000|2026-08-14",
  short_symbol: "XLY260814P00119000",
  long_symbol: "XLY260814P00118000",
  close_date: "2026-08-14",
  realized_pl: -189,
  max_loss: -125
};

// ---------------------------------------------------------------------------
// Nothing throws
// ---------------------------------------------------------------------------

test("the audit pass returns findings rather than throwing", () => {
  // The whole point of the framework. If this ever starts throwing, one bad
  // row is blocking an account again.
  const findings = auditAccount({
    breaches: [XLY],
    deletions: [{ kind: "trade records", removing: 12, stored: 12 }],
    orphaned: [{ realized_pl: -40 }]
  });
  assert.equal(findings.length, 3);
  assert.ok(findings.every((f) => typeof f.message === "string" && f.message.length > 0));
});

test("no finding may carry an action that stops a sync", () => {
  const findings = auditAccount({
    breaches: [XLY],
    deletions: [{ kind: "trade records", removing: 12, stored: 12 }]
  });
  const allowed = new Set(["withhold_row", "keep_deleted", "note"]);
  for (const f of findings) assert.ok(allowed.has(f.action), `unexpected action ${f.action}`);
});

// ---------------------------------------------------------------------------
// The impossible result
// ---------------------------------------------------------------------------

test("an impossible loss withholds its own row and names the excess", () => {
  const [f] = impossibleResultFindings([XLY]);
  assert.equal(f.code, "impossible_loss");
  assert.equal(f.severity, "critical");
  assert.equal(f.action, "withhold_row");
  assert.equal(f.subject, XLY.trade_key);
  assert.equal(f.detail.excess, -64);
  // The sentence a person reads carries both numbers and no code identifiers.
  assert.match(f.message, /-\$189\.00/);
  assert.match(f.message, /-\$125\.00/);
  assert.doesNotMatch(f.message, /realized_pl|trade_key|integrity_code/);
});

test("a clean set produces no findings at all", () => {
  assert.deepEqual(auditAccount({ breaches: [], orphaned: [], deletions: [] }), []);
  assert.deepEqual(auditAccount({}), []);
});

// ---------------------------------------------------------------------------
// The deletions
// ---------------------------------------------------------------------------

test("a mass deletion is held, not refused", () => {
  // Wees's account on production: the broker returned nothing, so the sync
  // wanted to remove all twelve stored trades.
  const f = massDeleteFinding("trade records", 12, 12);
  assert.ok(f);
  assert.equal(f.action, "keep_deleted");
  assert.equal(f.detail.would_remove, 12);
  assert.match(f.message, /kept rather than deleted/);
});

test("ordinary reconciliation is not a finding", () => {
  // Under the floor: removing five rows is routine however small the account.
  assert.equal(massDeleteFinding("trade records", 5, 6), null);
  // Over the floor but under the share: a big account correcting a few rows.
  assert.equal(massDeleteFinding("trade records", 10, 200), null);
  // Nothing stored yet — the first sync of an account deletes nothing.
  assert.equal(massDeleteFinding("trade records", 0, 0), null);
});

test("holding the deletion is scoped to the kind that tripped it", () => {
  const findings = auditAccount({
    deletions: [
      { kind: "trade records", removing: 12, stored: 12 },
      { kind: "share lots", removing: 1, stored: 40 }
    ]
  });
  assert.equal(deletionsHeld(findings, "trade records"), true);
  // Share lots were fine, so they are still deleted. A guard that held
  // everything because one thing tripped is the behaviour being replaced.
  assert.equal(deletionsHeld(findings, "share lots"), false);
});

// ---------------------------------------------------------------------------
// Stamping the rows
// ---------------------------------------------------------------------------

test("only the breaching row is withheld; the rest are explicitly cleared", () => {
  const records = [
    { trade_key: XLY.trade_key, realized_pl: -189 },
    { trade_key: "AAPL260901C00230000|...|2026-09-01", realized_pl: 74 },
    { trade_key: "MSFT260901P00500000|...|2026-09-01", realized_pl: -12 }
  ];
  const findings = auditAccount({ breaches: [XLY] });
  const out = applyFindings(records, findings);

  assert.equal(out.length, 3);
  assert.equal(out[0].integrity_code, "impossible_loss");
  assert.equal(out[0].integrity_detail.excess, -64);
  // Cleared, not left undefined: a row that stops breaching must stop being
  // withheld, and that only happens if every pass writes the column.
  assert.equal(out[1].integrity_code, null);
  assert.equal(out[2].integrity_code, null);
  // The trade itself is untouched. It happened; only our arithmetic is in doubt.
  assert.equal(out[0].realized_pl, -189);
});

test("a row that stops breaching is cleared on the next pass", () => {
  const records = [{ trade_key: XLY.trade_key, integrity_code: "impossible_loss" }];
  const out = applyFindings(records, auditAccount({ breaches: [] }));
  assert.equal(out[0].integrity_code, null);
  assert.equal(withheld(out[0]), false);
});

test("withheld is the one predicate, and it reads the column", () => {
  assert.equal(withheld({ integrity_code: "impossible_loss" }), true);
  assert.equal(withheld({ integrity_code: null }), false);
  assert.equal(withheld({}), false);
  assert.equal(withheld(null), false);
});

test("withheldKeys names exactly the rows to keep out of the arithmetic", () => {
  const findings = auditAccount({
    breaches: [XLY],
    deletions: [{ kind: "trade records", removing: 12, stored: 12 }],
    orphaned: [{ realized_pl: -40 }]
  });
  // The held deletion and the orphan note are not row withholdings, and must
  // not quietly remove anything from a total.
  assert.deepEqual([...withheldKeys(findings)], [XLY.trade_key]);
});

// ---------------------------------------------------------------------------
// The orphan note
// ---------------------------------------------------------------------------

test("orphaned share lots are recorded but withhold nothing", () => {
  const f = orphanedStockFinding([{ realized_pl: -40 }, { realized_pl: 15 }]);
  assert.ok(f);
  assert.equal(f.action, "note");
  assert.equal(f.severity, "info");
  assert.equal(f.detail.lots, 2);
  assert.equal(f.detail.realized_pl, -25);
});

test("no orphans, no note", () => {
  assert.equal(orphanedStockFinding([]), null);
  assert.equal(orphanedStockFinding(null), null);
});
