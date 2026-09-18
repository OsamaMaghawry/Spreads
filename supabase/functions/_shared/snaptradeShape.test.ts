import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, brokerRow, brokerMatrix, looksPaper, verdicts } from "./snaptradeShape.ts";

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

test("a secret is removed by the name of its key, whatever it holds", () => {
  const out = redact({
    userId: "u-1",
    userSecret: "3f8a-not-a-real-secret",
    accessToken: "abc",
    consumerKey: "k",
    nested: { refresh_token: "r", name: "Alpaca Paper" }
  }) as Record<string, any>;
  assert.equal(out.userId, "u-1");
  assert.equal(out.userSecret, "[redacted]");
  assert.equal(out.accessToken, "[redacted]");
  assert.equal(out.consumerKey, "[redacted]");
  assert.equal(out.nested.refresh_token, "[redacted]");
  // Everything that is not a secret survives, or the record is useless.
  assert.equal(out.nested.name, "Alpaca Paper");
});

test("long strings and long arrays are bounded rather than stored whole", () => {
  const long = "x".repeat(900);
  assert.match(String(redact(long)), /^x{400}… \(900 chars\)$/);
  const many = redact(Array.from({ length: 60 }, (_, i) => i)) as unknown[];
  assert.equal(many.length, 26);
  assert.equal(many[25], "… 35 more");
});

test("redaction never throws on the shapes an API actually returns", () => {
  assert.equal(redact(null), null);
  assert.equal(redact(undefined), null);
  assert.deepEqual(redact([]), []);
  assert.equal(redact(0), 0);
  assert.equal(redact(false), false);
});

// ---------------------------------------------------------------------------
// The brokerage matrix
// ---------------------------------------------------------------------------

// Two rows in the shape SnapTrade returns, plus a field this file has never
// seen — which is the case that matters, because their schema is theirs to
// change.
const BROKERS = [
  {
    id: "1", slug: "ALPACA", name: "Alpaca", display_name: "Alpaca",
    enabled: true, maintenance_mode: false,
    allows_trading: false, allows_trading_through_snaptrade_api: false,
    is_real_time_connection: true, allows_fractional_units: true,
    brokerage_type: { id: "t1", name: "Traditional Brokerage" },
    some_new_flag: true
  },
  {
    id: "2", slug: "ROBINHOOD", name: "Robinhood", display_name: "Robinhood",
    enabled: true, maintenance_mode: false,
    allows_trading: true, allows_trading_through_snaptrade_api: true,
    is_real_time_connection: true, allows_fractional_units: true,
    brokerage_type: { id: "t1", name: "Traditional Brokerage" }
  },
  {
    id: "3", slug: "OFFLINE", name: "Somebody", display_name: "Somebody",
    enabled: false, maintenance_mode: true,
    allows_trading: false, brokerage_type: "Crypto Exchange"
  }
];

test("a brokerage row is read into the fields that decide anything", () => {
  const r = brokerRow(BROKERS[1] as any);
  assert.equal(r.name, "Robinhood");
  assert.equal(r.slug, "ROBINHOOD");
  assert.equal(r.enabled, true);
  assert.equal(r.trading, true);
  assert.equal(r.tradingViaApi, true);
  assert.equal(r.type, "Traditional Brokerage");
  assert.deepEqual(r.unmapped, []);
});

test("a field this file has never seen is reported, not dropped", () => {
  // The whole reason the matrix is trustworthy: a vendor adding
  // `supports_multileg` next month shows up as a name to go and read, rather
  // than silently missing from an evaluation that still looks complete.
  assert.deepEqual(brokerRow(BROKERS[0] as any).unmapped, ["some_new_flag"]);
  assert.deepEqual(brokerMatrix(BROKERS).fieldsUnmapped, ["some_new_flag"]);
});

test("a missing boolean is null, never false", () => {
  // "They did not say" and "they said no" are different answers and only one
  // of them is evidence.
  const r = brokerRow(BROKERS[2] as any);
  assert.equal(r.tradingViaApi, null);
  assert.equal(r.trading, false);
  assert.equal(r.realTime, null);
});

test("the matrix counts reach and puts the tradable brokers first", () => {
  const m = brokerMatrix(BROKERS);
  assert.equal(m.total, 3);
  assert.equal(m.enabled, 2);
  assert.equal(m.tradable, 1);
  assert.equal(m.inMaintenance, 1);
  assert.equal(m.rows[0].name, "Robinhood");
  assert.ok(m.fieldsSeen.includes("allows_trading"));
});

test("an empty or malformed brokerage list is counted as nothing, not crashed on", () => {
  assert.equal(brokerMatrix(null).total, 0);
  assert.equal(brokerMatrix({ nope: true }).total, 0);
  assert.equal(brokerMatrix([]).tradable, 0);
});

// ---------------------------------------------------------------------------
// The paper gate
// ---------------------------------------------------------------------------

test("only a plainly simulated account counts as paper", () => {
  assert.equal(looksPaper("Alpaca Paper"), true);
  assert.equal(looksPaper("Practice Account"), true);
  assert.equal(looksPaper(null, "sandbox"), true);
  assert.equal(looksPaper("Simulated Trading"), true);
});

test("anything not plainly simulated is refused, including silence", () => {
  // Unknown is not paper. Being wrong in this direction costs an evaluation
  // nothing; being wrong the other way sends a real order to a real account.
  assert.equal(looksPaper("Alpaca"), false);
  assert.equal(looksPaper("Robinhood Individual"), false);
  assert.equal(looksPaper(null, undefined, ""), false);
  assert.equal(looksPaper(), false);
});

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

const probe = (over: Partial<any> = {}) => ({
  name: "x", need: "", method: "GET", path: "/", ok: true, status: 200, ms: 10,
  error: null, sample: null, count: 0, ...over
});

test("market data is a flat no, whatever else the probes found", () => {
  const v = verdicts([], null).find((x) => x.question.includes("market data"));
  assert.equal(v?.state, "no");
  assert.match(v!.answer, /option chains/);
});

test("an endpoint that answered with nothing in it is partial, not proof", () => {
  const v = verdicts([probe({ name: "option positions", count: 0 })], null)
    .find((x) => x.question.includes("option positions"));
  assert.equal(v?.state, "partial");
  assert.match(v!.answer, /holds no option positions/);
});

test("an endpoint that returned real rows is proof", () => {
  const v = verdicts([probe({ name: "option positions", count: 3 })], null)
    .find((x) => x.question.includes("option positions"));
  assert.equal(v?.state, "yes");
});

test("nothing tested reads as unknown and says what would settle it", () => {
  const v = verdicts([], null).find((x) => x.question.includes("multi-leg"));
  assert.equal(v?.state, "unknown");
  assert.match(v!.answer, /paper account/);
});

test("reach is read off the matrix and quoted with real counts", () => {
  const v = verdicts([], brokerMatrix(BROKERS)).find((x) => x.question.includes("How many brokers"));
  assert.match(v!.answer, /3 brokerages listed, 2 enabled, 1 able to trade/);
  assert.match(v!.answer, /1 in maintenance/);
});

test("no brokerage list means reach is unproven rather than zero", () => {
  const v = verdicts([], null).find((x) => x.question.includes("How many brokers"));
  assert.equal(v?.state, "unknown");
});
