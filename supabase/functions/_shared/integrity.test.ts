import test from "node:test";
import assert from "node:assert/strict";
import {
  auditAccount,
  emptyOptionBookFindings,
  divergenceFinding,
  applyLotFindings,
  withheldLotSummary,
  impossibleResultFindings,
  massDeleteFinding,
  orphanedStockFinding,
  applyFindings,
  withheldKeys,
  writesHeld,
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
    orphanedStockPL: -40
  });
  assert.equal(findings.length, 3);
  assert.ok(findings.every((f) => typeof f.message === "string" && f.message.length > 0));
});

test("no finding may carry an action that stops a sync", () => {
  const findings = auditAccount({
    breaches: [XLY],
    deletions: [{ kind: "trade records", removing: 12, stored: 12 }]
  });
  const allowed = new Set(["withhold_row", "hold_writes", "note"]);
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
  assert.deepEqual(auditAccount({ breaches: [], orphanedStockPL: 0, deletions: [] }), []);
  assert.deepEqual(auditAccount({}), []);
});

// ---------------------------------------------------------------------------
// The deletions
// ---------------------------------------------------------------------------

test("a mass deletion freezes that kind's writes, and says so", () => {
  // Wees's account on production: the broker returned nothing, so the sync
  // wanted to remove all twelve stored trades.
  const f = massDeleteFinding("trade records", 12, 12);
  assert.ok(f);
  assert.equal(f.action, "hold_writes");
  assert.equal(f.detail.would_remove, 12);
  assert.match(f.message, /left exactly as they were/);
  // The whole write, not just the delete. Holding only the deletions is what
  // stored the same closed trade twice.
  assert.match(f.message, /nothing from this refresh was written over them/);
});

test("the boundary cases the old guard covered and the new suite lost", () => {
  // Just past the floor AND past the share, both binding at once: the smallest
  // account the rule can still fire on.
  assert.ok(massDeleteFinding("trade records", 6, 7));
  // A partial majority -- the shape B1 lived in, where some rows are removed
  // and replacements are written under new keys.
  assert.ok(massDeleteFinding("trade records", 50, 99));
  // Under the share on a large account: ordinary correction, no finding.
  assert.equal(massDeleteFinding("trade records", 24, 99), null);
});

test("ordinary reconciliation is not a finding", () => {
  // Under the floor: removing five rows is routine however small the account.
  assert.equal(massDeleteFinding("trade records", 5, 6), null);
  // Over the floor but under the share: a big account correcting a few rows.
  assert.equal(massDeleteFinding("trade records", 10, 200), null);
  // Nothing stored yet — the first sync of an account deletes nothing.
  assert.equal(massDeleteFinding("trade records", 0, 0), null);
});

test("the freeze is scoped to the kind that tripped it", () => {
  const findings = auditAccount({
    deletions: [
      { kind: "trade records", removing: 12, stored: 12 },
      { kind: "share lots", removing: 1, stored: 40 }
    ]
  });
  assert.equal(writesHeld(findings, "trade records"), true);
  // Share lots were fine, so they still write. A guard that froze everything
  // because one thing tripped is the behaviour being replaced.
  assert.equal(writesHeld(findings, "share lots"), false);
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
    orphanedStockPL: -40
  });
  // The frozen kind and the orphan note are not row withholdings, and must
  // not quietly remove anything from a total.
  assert.deepEqual([...withheldKeys(findings)], [XLY.trade_key]);
});

// ---------------------------------------------------------------------------
// The orphan note
// ---------------------------------------------------------------------------

test("orphaned share results are recorded but withhold nothing", () => {
  // The SUM, which is what `reconstruct()` actually returns. Taking an array
  // here made the check unreachable in production while the commit claimed it
  // as coverage — a check that cannot fire reads on the page as an assurance.
  const f = orphanedStockFinding(-25);
  assert.ok(f);
  assert.equal(f.action, "note");
  assert.equal(f.severity, "info");
  assert.equal(f.detail.realized_pl, -25);
  assert.match(f.message, /-\$25\.00/);
});

test("no orphans, no note", () => {
  assert.equal(orphanedStockFinding(0), null);
  assert.equal(orphanedStockFinding(null), null);
  assert.equal(orphanedStockFinding(undefined), null);
  // A sub-cent residue of float arithmetic is not a finding.
  assert.equal(orphanedStockFinding(0.001), null);
});

// ---------------------------------------------------------------------------
// The share half
// ---------------------------------------------------------------------------

// The lot behind the XLY spread: assigned in, exercised out. `lotOwners` is the
// reconstruction's own record of which trade row received each lot's money --
// the audit layer must not re-derive it, and these tests are why.
const owners = new Map<string, Set<string>>([
  ["XLY|a", new Set([XLY.trade_key])],
  ["XLY|b", new Set(["clean-trade"])],
  ["split", new Set([XLY.trade_key, "clean-trade"])]
]);
const flaggedRecords = [
  { trade_key: XLY.trade_key, integrity_code: "impossible_loss" },
  { trade_key: "clean-trade", integrity_code: null }
];

test("a lot is withheld when the trade it was PAID TO is withheld", () => {
  const lots = [
    { lot_key: "XLY|a", disposed_date: "2026-08-14", realized_pl: -189 },
    { lot_key: "XLY|b", disposed_date: "2026-08-20", realized_pl: 40 }
  ];
  const out = applyLotFindings(lots, flaggedRecords, owners);
  assert.equal(out[0].integrity_code, "impossible_loss");
  assert.equal(out[1].integrity_code, null);
});

test("ownership, not chain id, decides it", () => {
  // The defect this replaced: matching on chain flagged a lot ACQUIRED on a
  // questioned chain and disposed on a clean one, while the trade actually
  // publishing its result stayed unflagged. Ownership has no such gap — this
  // lot's money went to the clean trade, so the lot publishes with it.
  const lots = [{
    lot_key: "XLY|b",
    disposed_date: "2026-08-20",
    chain_id: "chain-xly-0814",          // acquired on the questioned chain
    disposed_chain_id: "chain-clean",
    realized_pl: 40
  }];
  assert.equal(applyLotFindings(lots, flaggedRecords, owners)[0].integrity_code, null);
});

test("a lot split across a withheld and a clean row is withheld", () => {
  // Its attribution is the split we have said we cannot stand behind, so
  // publishing the clean share of it publishes part of the same doubt.
  const lots = [{ lot_key: "split", disposed_date: "2026-08-14", realized_pl: -80 }];
  const out = applyLotFindings(lots, flaggedRecords, owners);
  assert.equal(out[0].integrity_code, "impossible_loss");
  assert.deepEqual(out[0].integrity_detail.owners.sort(), [XLY.trade_key, "clean-trade"].sort());
});

test("a lot still HELD is never withheld, whatever it is attributed to", () => {
  // Its quantity is the broker's and its mark is a real closing price. Only the
  // attribution of a CLOSED lot is ours, and only that can be wrong.
  const lots = [{ lot_key: "XLY|a", disposed_date: null, qty: 100 }];
  assert.equal(applyLotFindings(lots, flaggedRecords, owners)[0].integrity_code, null);
});

test("no withheld trades, no withheld lots", () => {
  const lots = [{ lot_key: "XLY|a", disposed_date: "2026-08-14", realized_pl: -189 }];
  const clean = [{ trade_key: XLY.trade_key, integrity_code: null }];
  assert.equal(applyLotFindings(lots, clean, owners)[0].integrity_code, null);
});

test("a lot that stops being withheld is cleared on the next pass", () => {
  const lots = [{ lot_key: "XLY|a", disposed_date: "2026-08-14", integrity_code: "impossible_loss" }];
  const clean = [{ trade_key: XLY.trade_key, integrity_code: null }];
  assert.equal(applyLotFindings(lots, clean, owners)[0].integrity_code, null);
});

test("a lot nothing claims is not withheld", () => {
  // An orphan: attributed to no trade row at all, so no withheld row can be
  // publishing its money. It is counted by the orphan note instead.
  const lots = [{ lot_key: "unknown", disposed_date: "2026-08-14", realized_pl: -12 }];
  assert.equal(applyLotFindings(lots, flaggedRecords, owners)[0].integrity_code, null);
  // And a missing map must not throw — `lotOwners` is optional on the call.
  assert.equal(applyLotFindings(lots, flaggedRecords, null)[0].integrity_code, null);
});

test("the summary sizes the share half for the audit trail", () => {
  const out = applyLotFindings(
    [
      { lot_key: "XLY|a", disposed_date: "2026-08-14", realized_pl: -189 },
      { lot_key: "split", disposed_date: "2026-08-14", realized_pl: -11 },
      { lot_key: "XLY|b", disposed_date: "2026-08-20", realized_pl: 40 }
    ],
    flaggedRecords,
    owners
  );
  assert.deepEqual(withheldLotSummary(out), { lots: 2, realized: -200 });
});

// ---------------------------------------------------------------------------
// The stored series against the broker's own column
//
// Both fixtures are Alton Live, week of 7-11 September 2026, as the rows
// actually stood when the owner asked why his rebound was missing.
// ---------------------------------------------------------------------------

// The 4 September row as it was stored: fully priced, no option positions,
// on a day two short TSLA puts were being carried into expiry.
const ALTON_BEFORE = [
  { day: "2026-09-03", equity: 140844.76, options_open: 0, performance: -1574, unpriced: [] },
  { day: "2026-09-04", equity: 138870.97, options_open: 0, performance: -1574, unpriced: [] },
  { day: "2026-09-08", equity: 141530.46, options_open: 90, performance: -1123.09, unpriced: [] },
  { day: "2026-09-11", equity: 141577.61, options_open: 45, performance: -949.09, unpriced: [] }
];
const ALTON_LEGS = [
  { symbol: "TSLA260904P00362500", from: "2026-09-03", to: "2026-09-07", expiry: "2026-09-04" },
  { symbol: "TSLA260904P00367500", from: "2026-09-03", to: "2026-09-07", expiry: "2026-09-04" }
];

test("an empty option book on a day a contract was carried is a critical finding", () => {
  const found = emptyOptionBookFindings(ALTON_BEFORE, ALTON_LEGS);
  // 3 and 4 September both held the two puts and both claimed an empty book.
  assert.deepEqual(found.map((f) => f.subject), ["2026-09-03", "2026-09-04"]);
  assert.equal(found[0].severity, "critical");
  assert.equal(found[0].action, "note");         // never withhold: this is a chart
  assert.equal(found[1].detail.legs, 2);
  assert.match(found[1].message, /no option positions on 2026-09-04/);
});

test("the fixed series produces no finding", () => {
  const after = ALTON_BEFORE.map((r) =>
    r.day === "2026-09-03" ? { ...r, options_open: -23 }
    : r.day === "2026-09-04" ? { ...r, options_open: -1831 } : r
  );
  assert.deepEqual(emptyOptionBookFindings(after, ALTON_LEGS), []);
});

test("a day that already says it could not be valued is not accused as well", () => {
  // `unpriced` non-empty means the row is already telling the truth about
  // itself, and a second finding on the same day is noise.
  const rows = [{ day: "2026-09-04", equity: 1, options_open: 0, performance: null, unpriced: ["TSLA260904P00362500"] }];
  assert.deepEqual(emptyOptionBookFindings(rows, ALTON_LEGS), []);
});

test("a genuinely empty day is left alone, on both boundaries", () => {
  // Before the legs opened, after they settled, and after their expiry even
  // though the record stays open until settlement.
  const rows = [
    { day: "2026-09-02", equity: 1, options_open: 0, performance: 0, unpriced: [] },
    { day: "2026-09-05", equity: 1, options_open: 0, performance: 0, unpriced: [] },
    { day: "2026-09-08", equity: 1, options_open: 0, performance: 0, unpriced: [] }
  ];
  assert.deepEqual(emptyOptionBookFindings(rows, ALTON_LEGS), []);
});

test("the week the owner questioned raises a warning before he has to ask", () => {
  // Broker +$2,706.64, product +$624.91, no transfers. 1.47% of equity.
  const f = divergenceFinding(
    [ALTON_BEFORE[1], ALTON_BEFORE[3]], 0, "the week of 7 September"
  );
  assert.ok(f);
  assert.equal(f.code, "equity_divergence");
  assert.equal(f.severity, "warning");
  assert.equal(f.action, "note");
  assert.equal(f.detail.residual, 2081.73);
  assert.match(f.message, /\$2,?081\.73|\$2081\.73/);
});

test("a deposit is not a divergence", () => {
  // The whole reason `flows` is required. A $2,700 deposit and a flat week
  // look identical to a check that does not subtract it.
  const rows = [
    { day: "2026-09-04", equity: 138870.97, options_open: 0, performance: -1574, unpriced: [] },
    { day: "2026-09-11", equity: 141577.61, options_open: 0, performance: -1574, unpriced: [] }
  ];
  assert.equal(divergenceFinding(rows, 2706.64), null);
});

test("transfers we could not read produce no finding at all", () => {
  // "We could not look" is not evidence. Publishing a divergence over an
  // unknown denominator is the defect this product already fixed once.
  assert.equal(divergenceFinding([ALTON_BEFORE[1], ALTON_BEFORE[3]], null), null);
});

test("an ordinary week stays quiet", () => {
  const rows = [
    { day: "2026-09-04", equity: 100000, options_open: 0, performance: 1000, unpriced: [] },
    { day: "2026-09-11", equity: 100400, options_open: 0, performance: 1350, unpriced: [] }
  ];
  // $50 out of $100k: under both the dollar floor and the share.
  assert.equal(divergenceFinding(rows, 0), null);
});

test("divergence needs two days it can actually read", () => {
  assert.equal(divergenceFinding([ALTON_BEFORE[1]], 0), null);
  assert.equal(divergenceFinding([{ day: "2026-09-04", equity: null, performance: 1 }, ALTON_BEFORE[3]], 0), null);
  assert.equal(divergenceFinding([], 0), null);
});
