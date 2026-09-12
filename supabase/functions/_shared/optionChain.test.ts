import { test } from "node:test";
import assert from "node:assert/strict";
import { midOf, chainRow, chainLadder, atTheMoneyIndex } from "./optionChain.ts";

const snap = (bid: number | null, ask: number | null, extra: any = {}) => ({
  latestQuote: bid === null && ask === null ? null : { bp: bid, ap: ask },
  greeks: { delta: -0.18, gamma: 0.01, theta: -0.05, vega: 0.12 },
  impliedVolatility: 0.42,
  latestTrade: { p: 4.2 },
  dailyBar: { v: 1200 },
  ...extra
});

// ---------------------------------------------------------------------------
// midOf — half a market is not a price
// ---------------------------------------------------------------------------

test("midOf averages a two-sided quote", () => {
  assert.equal(midOf(4.2, 4.4), 4.3);
});

test("midOf refuses a one-sided quote rather than halving it", () => {
  // A mid printed from a single side is the number a person anchors their
  // limit to. There is no midpoint of half a market.
  assert.equal(midOf(4.2, null), null);
  assert.equal(midOf(null, 4.4), null);
  assert.equal(midOf(0, 4.4), null);
  assert.equal(midOf(4.2, 0), null);
});

test("midOf refuses a crossed market", () => {
  assert.equal(midOf(5, 4), null);
});

test("midOf does not emit a fourteen-decimal price", () => {
  // (0.07 + 0.09) / 2 is 0.08000000000000002, and this value lands in the
  // limit field the user is about to submit.
  assert.equal(midOf(0.07, 0.09), 0.08);
});

// ---------------------------------------------------------------------------
// chainRow
// ---------------------------------------------------------------------------

test("chainRow reads strike, type and greeks off the symbol and snapshot", () => {
  const r = chainRow("TSLA261016P00370000", snap(4.2, 4.4), 365, 1400)!;
  assert.equal(r.strike, 370);
  assert.equal(r.type, "P");
  assert.equal(r.mid, 4.3);
  assert.equal(r.delta, -0.18);
  assert.equal(r.iv, 0.42);
  assert.equal(r.openInterest, 1400);
  assert.equal(r.volume, 1200);
});

test("chainRow marks moneyness from the correct side for each type", () => {
  // A put is in the money BELOW spot; a call above. Getting this backwards
  // paints the wrong half of the ladder.
  assert.equal(chainRow("TSLA261016P00370000", snap(4, 4.2), 365)!.itm, true);
  assert.equal(chainRow("TSLA261016P00360000", snap(4, 4.2), 365)!.itm, false);
  assert.equal(chainRow("TSLA261016C00360000", snap(4, 4.2), 365)!.itm, true);
  assert.equal(chainRow("TSLA261016C00370000", snap(4, 4.2), 365)!.itm, false);
});

test("chainRow keeps an UNQUOTED strike instead of dropping it", () => {
  // The scanner drops these, correctly, because it is choosing something
  // tradeable. On a chain a missing row reads as "that strike does not exist".
  const r = chainRow("TSLA261016P00250000", snap(null, null), 365)!;
  assert.notEqual(r, null);
  assert.equal(r.bid, null);
  assert.equal(r.mid, null);
});

test("chainRow keeps a genuine zero bid on a worthless option", () => {
  const r = chainRow("TSLA261016P00100000", snap(0, 0.01), 365)!;
  assert.equal(r.bid, 0);
  // Zero is a real bid; it is midOf that refuses to make a price from it.
  assert.equal(r.mid, null);
});

test("chainRow flags an adjusted contract", () => {
  const r = chainRow("TSLA1261016P00370000", snap(4, 4.2), 365)!;
  assert.equal(r.adjusted, true);
});

test("chainRow refuses a symbol that is not an option", () => {
  assert.equal(chainRow("TSLA", snap(4, 4.2), 365), null);
});

// ---------------------------------------------------------------------------
// chainLadder
// ---------------------------------------------------------------------------

test("chainLadder pairs the call and put at each strike, ascending", () => {
  const ladder = chainLadder(
    {
      TSLA261016P00370000: snap(4.2, 4.4),
      TSLA261016C00370000: snap(9.0, 9.4),
      TSLA261016P00360000: snap(2.1, 2.3)
    },
    365
  );
  assert.deepEqual(ladder.map((s) => s.strike), [360, 370]);
  assert.equal(ladder[1].call!.symbol, "TSLA261016C00370000");
  assert.equal(ladder[1].put!.symbol, "TSLA261016P00370000");
  // A strike with only one side still appears, with the other empty.
  assert.equal(ladder[0].call, null);
  assert.equal(ladder[0].put!.strike, 360);
});

test("chainLadder on an empty feed returns nothing rather than throwing", () => {
  assert.deepEqual(chainLadder({}, 365), []);
  assert.deepEqual(chainLadder(null as any, null), []);
});

test("atTheMoneyIndex centres the ladder on spot", () => {
  const ladder = chainLadder(
    {
      TSLA261016P00350000: snap(1, 1.2),
      TSLA261016P00365000: snap(4, 4.2),
      TSLA261016P00400000: snap(9, 9.2)
    },
    366
  );
  assert.equal(ladder[atTheMoneyIndex(ladder, 366)].strike, 365);
  assert.equal(atTheMoneyIndex([], 366), 0);
});

