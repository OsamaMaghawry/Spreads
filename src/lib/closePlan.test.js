import test from "node:test";
import assert from "node:assert/strict";
import { closePlan, deriveUnit, closeAction, coverLeftBehind, MAX_MLEG_LEGS } from "./closePlan.js";

const opt = (symbol, side, qty, ticker = "TSLA") => ({ symbol, side, qty, ticker, assetClass: "us_option" });
const stk = (symbol, side, qty) => ({ symbol, side, qty, ticker: symbol, assetClass: "equity" });

test("closing a short is a buy-back; closing a long is a sale", () => {
  assert.equal(closeAction(opt("A", "short", 1)), "buy_to_close");
  assert.equal(closeAction(opt("A", "long", 1)), "sell_to_close");
  assert.equal(closeAction(stk("TSLA", "long", 210)), "sell_to_close");
  assert.equal(closeAction(stk("TSLA", "short", 210)), "buy_to_close");
});

test("the unit is the GCD, not the raw quantities", () => {
  // 1 long and 2 short is ONE unit of a 1:2.
  const a = deriveUnit([opt("A", "long", 1), opt("B", "short", 2)]);
  assert.equal(a.qty, 1);
  assert.deepEqual(a.legs.map((l) => l.ratio), [1, 2]);

  // 2 and 4 is TWO units of a 1:2 — not one unit of a 2:4, which the broker
  // rejects for having a common factor.
  const b = deriveUnit([opt("A", "long", 2), opt("B", "short", 4)]);
  assert.equal(b.qty, 2);
  assert.deepEqual(b.legs.map((l) => l.ratio), [1, 2]);

  // And the totals are preserved either way.
  assert.equal(b.qty * b.legs[0].ratio, 2);
  assert.equal(b.qty * b.legs[1].ratio, 4);
});

test("a zero or missing quantity has no unit", () => {
  assert.equal(deriveUnit([]), null);
  assert.equal(deriveUnit([opt("A", "long", 0)]), null);
});

test("two option legs go as one atomic order", () => {
  const plan = closePlan([opt("A", "short", 1), opt("B", "long", 1)]);
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.atomic, true);
  assert.deepEqual(plan.warnings, [], "nothing to warn about when there is no intermediate state");
});

test("BUY-BACKS FIRST, SALES LAST — the whole point", () => {
  // Deliberately handed in the dangerous order: the sale first.
  const plan = closePlan([
    opt("LONG_CALL", "long", 1),
    opt("SHORT_CALL_A", "short", 2),
    opt("SHORT_CALL_B", "short", 1),
    opt("LONG_PUT", "long", 1),
    opt("SHORT_PUT", "short", 1)
  ]);
  const actions = plan.orders.flatMap((o) => o.legs.map((l) => l.action));
  const lastBuy = actions.lastIndexOf("buy_to_close");
  const firstSell = actions.indexOf("sell_to_close");
  assert.ok(lastBuy < firstSell, "every buy-back must precede every sale");
});

test("five option legs cannot be one order, and the plan says so", () => {
  const legs = [1, 2, 3, 4, 5].map((i) => opt(`S${i}`, "short", 1));
  const plan = closePlan(legs);
  assert.equal(plan.atomic, false);
  assert.equal(plan.orders.length, 2);
  assert.ok(plan.orders.every((o) => o.legs.length <= MAX_MLEG_LEGS));
  assert.match(plan.warnings[0], /at most 4 option legs/);
});

test("shares never share an order with contracts, and go last", () => {
  const plan = closePlan([stk("TSLA", "long", 210), opt("C", "short", 2)]);
  assert.equal(plan.orders.length, 2);
  assert.equal(plan.orders[0].kind, "options", "the buy-back goes first");
  assert.equal(plan.orders[1].kind, "equity", "the share sale — which removes the cover — goes last");
  assert.equal(plan.orders[1].qty, 210);
});

test("the owner's TSLA book: six option legs and 210 shares", () => {
  // 2 long + 4 short contracts + the share lot, as the panel shows them.
  const plan = closePlan([
    stk("TSLA", "long", 210),
    opt("C352.50", "long", 1),
    opt("C362.50", "short", 2),
    opt("P365", "long", 1),
    opt("P352.50", "short", 1),
    opt("C375", "short", 1)
  ]);
  assert.equal(plan.atomic, false);
  // Three orders: the 3 short legs bought back, then the shares, then the 2
  // long legs sold.
  //
  // The share sale is no longer LAST, and that is deliberate. By the time it
  // runs, order 1 has retired every short — so nothing is uncovered by it. What
  // remains after it is a fully-paid long call and long put: defined risk, no
  // obligation, worth at most the premium already spent. Selling the longs
  // first would instead leave 210 shares — roughly $77,000 of directional
  // exposure — waiting on a fill. Within the sales tier the stock goes first
  // because the residual is smaller, not because shares matter less.
  assert.deepEqual(plan.orders.map((o) => o.kind), ["options", "equity", "options"]);
  assert.deepEqual(plan.orders[0].legs.map((l) => l.action), ["buy_to_close", "buy_to_close", "buy_to_close"]);
  assert.equal(plan.orders[1].legs[0].action, "sell_to_close");
  assert.deepEqual(plan.orders[2].legs.map((l) => l.action), ["sell_to_close", "sell_to_close"]);
  assert.equal(plan.warnings.length, 2);
});

test("a selection of only buy-backs warns about splitting but not about cover", () => {
  const legs = [1, 2, 3, 4, 5].map((i) => opt(`S${i}`, "short", 1));
  const plan = closePlan(legs);
  assert.equal(plan.warnings.length, 1, "nothing is being sold, so no cover can be removed");
});

test("empty and junk selections produce no orders", () => {
  assert.deepEqual(closePlan([]).orders, []);
  assert.deepEqual(closePlan(null).orders, []);
  assert.deepEqual(closePlan([{ symbol: null, qty: 1 }]).orders, []);
  assert.deepEqual(closePlan([opt("A", "short", 0)]).orders, []);
});

test("a four-leg condor stays atomic, mixed directions and all", () => {
  // The case the first version of this got wrong: it split by risk direction
  // unconditionally, turning an ordinary spread into two orders and giving up
  // the net price that is the reason to close a spread as a spread.
  const plan = closePlan([
    opt("PUT_SHORT", "short", 1),
    opt("PUT_LONG", "long", 1),
    opt("CALL_SHORT", "short", 1),
    opt("CALL_LONG", "long", 1)
  ]);
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.atomic, true);
  assert.equal(plan.orders[0].legs.length, 4);
  assert.deepEqual(plan.warnings, []);
});

// ---------------------------------------------------------------------------
// The bench's STOP findings, each as the case that produced it.
// ---------------------------------------------------------------------------

test("F1: an option SALE never precedes an equity buy-back", () => {
  // head-of-trading's reproduction. The long call is the only cap on the short
  // stock's upside; the first version sold it first because it ordered by asset
  // class (all options, then all equity) while printing a warning saying the
  // opposite. Between the fills the account was short 100 shares uncapped.
  const plan = closePlan([stk("TSLA", "short", 100), opt("TSLA260116C00460000", "long", 1)]);
  assert.equal(plan.orders.length, 2);
  assert.equal(plan.orders[0].legs[0].action, "buy_to_close", "the stock buy-back goes FIRST");
  assert.equal(plan.orders[0].kind, "equity");
  assert.equal(plan.orders[1].legs[0].action, "sell_to_close");
});

test("F1: long stock + long put sells neither before the other wrongly", () => {
  // Both are sales, so there is no safe interleaving to get right — but the put
  // must not be sold while the shares are still held under the old rule, i.e.
  // ordering must at least be stable and both must be tier 2.
  const plan = closePlan([stk("TSLA", "long", 100), opt("TSLA260116P00400000", "long", 1)]);
  assert.ok(plan.orders.every((o) => o.legs.every((l) => l.action === "sell_to_close")));
});

test("F4: legs on different underlyings are never one order", () => {
  const plan = closePlan([opt("SPY260116P00600000", "short", 1, "SPY"), opt("TSLA260116C00460000", "short", 1, "TSLA")]);
  assert.equal(plan.atomic, false);
  assert.equal(plan.orders.length, 2);
  assert.deepEqual(plan.orders.map((o) => o.ticker).sort(), ["SPY", "TSLA"]);
  assert.match(plan.warnings[0], /more than one underlying/);
});

test("F4/F6: above the cap, chunks never mix underlyings", () => {
  const legs = [
    opt("A1", "short", 3, "AAPL"), opt("S1", "short", 5, "SPY"),
    opt("T1", "short", 7, "TSLA"), opt("T2", "short", 2, "TSLA"),
    opt("N1", "short", 1, "NVDA")
  ];
  const plan = closePlan(legs);
  for (const o of plan.orders) {
    const tickers = new Set(o.legs.map((l) => l.ticker));
    assert.equal(tickers.size, 1, `order mixes ${[...tickers].join("+")}`);
  }
  // And no absurd ratio survives, because 3 and 5 are never in one unit now.
  assert.ok(plan.orders.every((o) => o.legs.every((l) => l.ratio <= 7)));
});

test("F7: an adjusted contract is closable, alone, and flagged", () => {
  const adj = { ...opt("TSLA1260116C00400000", "short", 1), adjusted: true };
  const plan = closePlan([adj, opt("TSLA260116C00460000", "short", 1)]);
  assert.equal(plan.orders.length, 2, "never netted with a normal contract");
  const solo = plan.orders.find((o) => o.adjusted);
  assert.ok(solo, "it is marked as adjusted");
  assert.equal(solo.legs.length, 1);
  assert.match(plan.warnings[0], /adjusted contract/);
});

test("a vertical is still atomic — direction sorts ACROSS orders, not within one", () => {
  const plan = closePlan([opt("A", "short", 1), opt("B", "long", 1)]);
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.atomic, true);
});

test("tiering: buy-backs, then self-contained, then sales", () => {
  const plan = closePlan([
    opt("SELL_ONLY", "long", 1, "AAA"),
    opt("MIXED_A", "short", 1, "BBB"), opt("MIXED_B", "long", 1, "BBB"),
    opt("BUY_ONLY", "short", 1, "CCC")
  ]);
  const tiers = plan.orders.map((o) => new Set(o.legs.map((l) => l.action)).size > 1 ? 1 : o.legs[0].action === "buy_to_close" ? 0 : 2);
  assert.deepEqual(tiers, [0, 1, 2]);
});

// ---------------------------------------------------------------------------
// Re-audit findings. Two of these were created BY the first round of fixes.
// ---------------------------------------------------------------------------

const row = (symbol, qty, o = {}) => ({ symbol, qty, ticker: o.ticker ?? "TSLA", assetClass: o.assetClass ?? "us_option", optionType: o.optionType ?? "C" });
const shareRow = (ticker, qty) => ({ symbol: ticker, ticker, qty, assetClass: "equity" });

test("coverLeftBehind names shorts a sale would strip", () => {
  const rows = [shareRow("TSLA", 210), row("TSLA_C375", -1), row("TSLA_C362", -2), shareRow("AAPL", 100)];
  const warn = coverLeftBehind([stk("TSLA", "long", 210)], rows);
  assert.equal(warn.length, 1);
  assert.match(warn[0].text, /3 short TSLA contracts/);

  // Selecting the shorts too leaves nothing behind.
  const all = [
    stk("TSLA", "long", 210),
    { symbol: "TSLA_C375", side: "short", qty: 1, ticker: "TSLA", assetClass: "us_option", optionType: "C" },
    { symbol: "TSLA_C362", side: "short", qty: 2, ticker: "TSLA", assetClass: "us_option", optionType: "C" }
  ];
  assert.deepEqual(coverLeftBehind(all, rows), []);
  // Buying a short back never strips cover.
  assert.deepEqual(coverLeftBehind([all[1]], rows), []);
});

test("RE-1: a PARTLY FREE short still counts as left behind", () => {
  // The bench's repro, and the interaction between two of my own fixes: asLeg
  // caps at qtyAvailable, coverLeftBehind compared symbol MEMBERSHIP, so a
  // ticked-but-partly-free short read as fully handled. 1 of 3 bought back,
  // 210 shares sold, TWO NAKED CALLS, and nothing said so.
  const rows = [shareRow("TSLA", 210), row("TSLA_C420", -3)];
  const selected = [
    stk("TSLA", "long", 210),
    { symbol: "TSLA_C420", side: "short", qty: 1, ticker: "TSLA", assetClass: "us_option", optionType: "C" }
  ];
  const warn = coverLeftBehind(selected, rows);
  assert.equal(warn.length, 1, "two of the three calls are still open");
  assert.match(warn[0].text, /2 short TSLA contracts/);
  assert.match(warn[0].text, /partly closable/);
});

test("RE-6: cover is matched by RIGHT, so a long call ignores an open short put", () => {
  const rows = [row("TSLA_P300", -5, { optionType: "P" })];
  const sellCall = { symbol: "TSLA_C400", side: "long", qty: 1, ticker: "TSLA", assetClass: "us_option", optionType: "C" };
  assert.deepEqual(coverLeftBehind([sellCall], rows), [], "a long call does not cover a short put");
  const sellPut = { symbol: "TSLA_P350", side: "long", qty: 1, ticker: "TSLA", assetClass: "us_option", optionType: "P" };
  assert.equal(coverLeftBehind([sellPut], rows).length, 1, "a long put does cover a short put");
});

test("RE-7: an adjusted short is seen despite its TSLA1 ticker", () => {
  const rows = [row("TSLA1_C400", -2, { ticker: "TSLA1" })];
  const warn = coverLeftBehind([stk("TSLA", "long", 100)], rows);
  assert.equal(warn.length, 1, "TSLA1 is the same underlying for cover, different only for an order");
});

test("RE-2: the protective put is NOT sold before the stock it protects", () => {
  // Both are sales, so both are tier 2 — and the first version kept the
  // per-book order (options then equity), selling the put first and leaving
  // 100 shares unhedged while the second order worked.
  const plan = closePlan([
    stk("TSLA", "long", 100),
    { symbol: "TSLA_P380", side: "long", qty: 1, ticker: "TSLA", assetClass: "us_option", optionType: "P" }
  ]);
  assert.equal(plan.orders[0].kind, "equity", "the shares go first; the residual is a fully-paid long put");
  assert.equal(plan.orders[1].kind, "options");
});

test("RE-2: the buy-backs-first sentence is not printed over a plan with none", () => {
  const allSales = closePlan([
    stk("TSLA", "long", 100),
    { symbol: "TSLA_P380", side: "long", qty: 1, ticker: "TSLA", assetClass: "us_option", optionType: "P" }
  ]);
  assert.ok(
    !allSales.warnings.some((w) => /cover is never removed/.test(w)),
    "vacuously true, and reads as a guarantee this plan cannot make"
  );
  assert.ok(allSales.warnings.some((w) => /These orders all sell/.test(w)));

  // With a real buy-back present, the sentence is earned and appears.
  const mixed = closePlan([
    stk("TSLA", "long", 100),
    { symbol: "TSLA_C400", side: "short", qty: 1, ticker: "TSLA", assetClass: "us_option", optionType: "C" }
  ]);
  assert.ok(mixed.warnings.some((w) => /cover is never removed/.test(w)));
});

test("RE-2: selling a protective put warns that the shares lose their hedge", () => {
  const rows = [shareRow("TSLA", 210)];
  const sellPut = { symbol: "TSLA_P380", side: "long", qty: 2, ticker: "TSLA", assetClass: "us_option", optionType: "P" };
  const warn = coverLeftBehind([sellPut], rows);
  assert.equal(warn.length, 1);
  assert.match(warn[0].text, /without the downside protection/);
});
