import test from "node:test";
import assert from "node:assert/strict";
import { fillsBySymbol, openDatesFor } from "./legOpenDates.ts";

// The owner's case, exactly. A spread submitted on 14 September: sell the
// TSLA 320 put (Dec 2027), buy the TSLA 370 put (Feb 2027). Alpaca returns it
// as ONE parent order whose `symbol` is not either contract, with the two
// contracts nested under `legs`. The old fetch filtered by the contract symbol
// and so never saw this order; the 370 put had no open date; and every day of
// the account's history was stored as unpriced because of it.
const SPREAD = {
  id: "a99e44bb",
  symbol: null,
  order_class: "mleg",
  side: "sell",
  filled_at: "2026-09-14T14:09:11Z",
  filled_qty: "1",
  legs: [
    { id: "l1", symbol: "TSLA271217P00320000", side: "sell", filled_qty: "1", filled_at: "2026-09-14T14:09:11Z" },
    { id: "l2", symbol: "TSLA270219P00370000", side: "buy", filled_qty: "1", filled_at: "2026-09-14T14:09:11Z" }
  ]
};

test("a leg filled inside a multi-leg order gets its open date from the nested leg", () => {
  const fills = fillsBySymbol([SPREAD], ["TSLA270219P00370000"]);
  assert.deepEqual(fills, { TSLA270219P00370000: [{ day: "2026-09-14", qty: 1 }] });
  const dates = openDatesFor([{ symbol: "TSLA270219P00370000", qty: 1 }], fills);
  assert.equal(dates.TSLA270219P00370000, "2026-09-14");
});

test("the parent's own symbol does not have to be the contract for the leg to count", () => {
  // Some feeds name the underlying on the parent rather than null.
  const withRoot = { ...SPREAD, symbol: "TSLA" };
  const fills = fillsBySymbol([withRoot], ["TSLA271217P00320000"]);
  assert.equal(fills.TSLA271217P00320000[0].qty, -1, "a sold leg is a negative fill");
});

test("a leg row without its own filled_at borrows the parent's", () => {
  const legsNoTime = {
    ...SPREAD,
    legs: SPREAD.legs.map(({ filled_at: _drop, ...l }) => l)
  };
  const fills = fillsBySymbol([legsNoTime], ["TSLA270219P00370000"]);
  assert.equal(fills.TSLA270219P00370000[0].day, "2026-09-14");
});

test("a single-leg order still works exactly as before", () => {
  const single = { id: "s1", symbol: "NVDA260918P00220000", side: "sell", filled_at: "2026-09-08T15:00:00Z", filled_qty: "2" };
  const fills = fillsBySymbol([single], ["NVDA260918P00220000"]);
  const dates = openDatesFor([{ symbol: "NVDA260918P00220000", qty: -2 }], fills);
  assert.equal(dates.NVDA260918P00220000, "2026-09-08");
});

test("the open date is the fill that reaches today's quantity, walking from the newest", () => {
  // Bought 1 in August, bought 1 more on 10 September, holding 2 now: the
  // position as held today began in August.
  const fills = {
    X: [{ day: "2026-08-20", qty: 1 }, { day: "2026-09-10", qty: 1 }]
  };
  assert.equal(openDatesFor([{ symbol: "X", qty: 2 }], fills).X, "2026-08-20");
  // Holding only 1 now: the newest fill alone reaches it.
  assert.equal(openDatesFor([{ symbol: "X", qty: 1 }], fills).X, "2026-09-10");
});

test("a buy and a sell on the same contract cancel the way the position does", () => {
  const fills = {
    X: [{ day: "2026-08-01", qty: 1 }, { day: "2026-08-15", qty: -1 }, { day: "2026-09-01", qty: 1 }]
  };
  // Held 1 now: the September buy is the position; the August round trip is not.
  assert.equal(openDatesFor([{ symbol: "X", qty: 1 }], fills).X, "2026-09-01");
});

test("fills that never reach what is held produce no date, so the walk can say so", () => {
  const fills = { X: [{ day: "2026-09-01", qty: 1 }] };
  assert.deepEqual(openDatesFor([{ symbol: "X", qty: 3 }], fills), {});
  assert.deepEqual(openDatesFor([{ symbol: "Y", qty: 1 }], fills), {});
});

test("unwanted symbols, unfilled rows and malformed dates are ignored", () => {
  const orders = [
    { symbol: "SPY", side: "buy", filled_at: "2026-09-01T10:00:00Z", filled_qty: "5" },
    { symbol: "X", side: "buy", filled_at: "", filled_qty: "1" },
    { symbol: "X", side: "buy", filled_at: "2026-09-02T10:00:00Z", filled_qty: "0" },
    { symbol: "X", side: "buy", filled_at: "not-a-date", filled_qty: "1" }
  ];
  assert.deepEqual(fillsBySymbol(orders, ["X"]), {});
});
