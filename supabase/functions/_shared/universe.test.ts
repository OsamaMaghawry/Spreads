import test from "node:test";
import assert from "node:assert/strict";
import { readSnapshot, judge, screenUniverse, tradableEquities } from "./universe.ts";

const snap = (o: any = {}) => ({
  latestTrade: o.trade !== undefined ? { p: o.trade } : undefined,
  latestQuote: o.bid !== undefined || o.ask !== undefined ? { bp: o.bid, ap: o.ask } : undefined,
  dailyBar: o.close !== undefined || o.vol !== undefined ? { c: o.close, v: o.vol } : undefined
});

test("spot prefers the trade, then the mid, then the close", () => {
  assert.equal(readSnapshot(snap({ trade: 50, bid: 49, ask: 51, close: 48 })).spot, 50);
  assert.equal(readSnapshot(snap({ bid: 49, ask: 51, close: 48 })).spot, 50);
  assert.equal(readSnapshot(snap({ close: 48 })).spot, 48);
  assert.equal(readSnapshot(snap({})).spot, null);
});

test("a one-sided quote has no width, and no width is not zero width", () => {
  // The trap this whole codebase was bitten by today: a missing side read as a
  // real price. Here it must read as UNKNOWN, or a dead name passes the
  // tightest spread filter on the screen.
  assert.equal(readSnapshot(snap({ trade: 50, bid: 49, ask: 0 })).spreadPct, null);
  assert.equal(readSnapshot(snap({ trade: 50 })).spreadPct, null);
  const ok = readSnapshot(snap({ trade: 50, bid: 49.5, ask: 50.5 }));
  assert.ok(Math.abs(ok.spreadPct - 0.02) < 1e-9);
});

test("the price cap the owner asked for", () => {
  const f = { maxSpot: 100 };
  assert.equal(judge("A", snap({ trade: 45, vol: 1e6 }), f).keep, true);
  const over = judge("B", snap({ trade: 250, vol: 1e6 }), f);
  assert.equal(over.keep, false);
  assert.equal(over.reason, "over $100");
});

test("sub-dollar names are excluded from the bottom", () => {
  assert.equal(judge("A", snap({ trade: 0.40, vol: 9e6 }), { minSpot: 5 }).reason, "under $5");
});

test("a name with no price is dropped, not defaulted", () => {
  assert.equal(judge("A", snap({}), {}).keep, false);
  assert.equal(judge("A", snap({}), {}).reason, "no price");
  assert.equal(judge("A", snap({ trade: 0 }), {}).keep, false);
});

test("the liquidity floor, and unknown volume fails it", () => {
  const f = { minVolume: 500000 };
  assert.equal(judge("A", snap({ trade: 30, vol: 2e6 }), f).keep, true);
  assert.equal(judge("B", snap({ trade: 30, vol: 1000 }), f).reason, "thin volume");
  // Unknown must FAIL a floor. Passing it would let every name with no data
  // through the one filter that exists to exclude them.
  assert.equal(judge("C", snap({ trade: 30 }), f).reason, "no volume data");
});

test("a widely quoted underlying is dropped, and no quote counts as wide", () => {
  const f = { maxSpreadPct: 0.01 };
  assert.equal(judge("A", snap({ trade: 100, bid: 99.9, ask: 100.1 }), f).keep, true);
  assert.equal(judge("B", snap({ trade: 100, bid: 95, ask: 105 }), f).reason, "quoted too wide");
  assert.equal(judge("C", snap({ trade: 100 }), f).reason, "no quote");
});

test("capital per contract against account equity — the small-account filter", () => {
  // A $200 stock commits $20,000 for one cash-secured put. On a $25,000
  // account that is 80% of everything, whatever the premium looks like.
  const f = { maxCapitalPct: 0.1, equity: 25000 };
  assert.equal(judge("BIG", snap({ trade: 200, vol: 9e6 }), f).reason, "too much capital per contract");
  // $20 x 100 = $2,000, which is 8% of the account.
  assert.equal(judge("SMALL", snap({ trade: 20, vol: 9e6 }), f).keep, true);
  // Exactly at the limit passes: $25 x 100 = $2,500 = 10%.
  assert.equal(judge("EDGE", snap({ trade: 25, vol: 9e6 }), f).keep, true);
});

test("the capital filter is inert without equity, rather than dropping everything", () => {
  assert.equal(judge("A", snap({ trade: 200, vol: 9e6 }), { maxCapitalPct: 0.1 }).keep, true);
  assert.equal(judge("A", snap({ trade: 200, vol: 9e6 }), { maxCapitalPct: 0.1, equity: 0 }).keep, true);
});

test("no filters keeps everything that has a price", () => {
  assert.equal(judge("A", snap({ trade: 3.5 }), {}).keep, true);
});

test("the screen reports where the universe went", () => {
  const snaps = {
    KEEP1: snap({ trade: 40, vol: 5e6 }),
    KEEP2: snap({ trade: 90, vol: 2e6 }),
    RICH: snap({ trade: 900, vol: 5e6 }),
    THIN: snap({ trade: 40, vol: 100 }),
    DEAD: snap({})
  };
  const r = screenUniverse(snaps, { maxSpot: 100, minVolume: 1e6 });
  assert.equal(r.considered, 5);
  assert.deepEqual(r.kept.map((k) => k.symbol), ["KEEP1", "KEEP2"]);
  assert.deepEqual(r.dropped, { "over $100": 1, "thin volume": 1, "no price": 1 });
});

test("the asset list keeps ordinary listed equities and nothing else", () => {
  const a = (symbol, o = {}) => ({
    symbol, status: "active", tradable: true, class: "us_equity", exchange: "NASDAQ", ...o
  });
  const keep = tradableEquities([
    a("AAPL"),
    a("F", { exchange: "NYSE" }),
    a("INACTIVE", { status: "inactive" }),
    a("UNTRADABLE", { tradable: false }),
    a("CRYPTO", { class: "crypto" }),
    // OTC has no listed options at all — spending requests on it is a certain
    // miss, not a long shot.
    a("PINKY", { exchange: "OTC" }),
    // Warrants, units and rights: equity class, never optionable, identifiable
    // only by the symbol itself.
    a("ABC.WS"),
    a("XYZ-U"),
    a("BRK/B")
  ]);
  assert.deepEqual(keep, ["AAPL", "F"]);
});

test("the asset list survives junk", () => {
  assert.deepEqual(tradableEquities([]), []);
  assert.deepEqual(tradableEquities(null), []);
  assert.deepEqual(tradableEquities([null, undefined, {}]), []);
});
