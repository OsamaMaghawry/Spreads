import test from "node:test";
import assert from "node:assert/strict";
import { positionPLAt, tickerBook, curveRange, payoffCurve, crossings } from "./tickerBook.js";

// The owner's live TSLA book: 210 shares at 364.31, one long 352.50 call at
// 13.57, two short 362.50s at 8.69. Three positions on two cards, and no
// screen that could say what the name as a whole was doing.
const sharesRow = {
  ticker: "TSLA", type: "shares", shares: true, qty: 210, shareQty: 210,
  shareBasis: 364.31, longEntryPrice: 364.31, stockPrice: 366.11,
  unrealizedPL: 378, expirationPL: 378, collateral: 76883, legs: []
};
const ratioRow = {
  ticker: "TSLA", type: "call_ratio_spread", qty: 1, longRatio: 1, shortRatio: 2,
  shortStrike: 362.5, longStrike: 352.5, stockPrice: 366.11,
  unrealizedPL: -180, expirationPL: 1020, collateral: 0,
  legs: [
    { symbol: "S", side: "short", kind: "call", strike: 362.5, ratio: 2, entryPrice: 8.69 },
    { symbol: "L", side: "long", kind: "call", strike: 352.5, ratio: 1, entryPrice: 13.57 }
  ]
};

test("shares are priced off the basis they were bought at", () => {
  assert.equal(positionPLAt(sharesRow, 364.31), 0);
  assert.equal(Math.round(positionPLAt(sharesRow, 374.31)), 2100);
  assert.equal(Math.round(positionPLAt(sharesRow, 354.31)), -2100);
});

test("a ratio keeps its credit below the long strike", () => {
  // 2 x $8.69 taken in less $13.57 paid = $3.81, and nothing expires with
  // value under 352.50.
  assert.equal(Math.round(positionPLAt(ratioRow, 340)), 381);
  assert.equal(Math.round(positionPLAt(ratioRow, 352.5)), 381);
});

test("a ratio peaks at the short strike and gives it back above", () => {
  const atShort = positionPLAt(ratioRow, 362.5);
  assert.equal(Math.round(atShort), 1381, "the long is $10 in the money, both shorts worthless");
  assert.ok(positionPLAt(ratioRow, 380) < atShort);
  assert.ok(positionPLAt(ratioRow, 400) < positionPLAt(ratioRow, 380), "the extra short outruns the long");
});

test("the options' own break-even is where the ratio alone returns to zero", () => {
  // 2 x 362.50 - 352.50 + 3.81 = 376.31
  const curve = payoffCurve({ rows: [ratioRow] }, { from: 330, to: 420, steps: 900 });
  const [up] = crossings(curve).filter((c) => !c.rising);
  assert.ok(Math.abs(up.price - 376.31) < 0.2, `expected ~376.31, got ${up.price}`);
});

test("a condor prices from its four legs without knowing it is a condor", () => {
  const condor = {
    ticker: "X", type: "iron_condor", qty: 1, stockPrice: 100,
    legs: [
      { side: "short", kind: "put", strike: 95, ratio: 1, entryPrice: 1.2 },
      { side: "long", kind: "put", strike: 90, ratio: 1, entryPrice: 0.5 },
      { side: "short", kind: "call", strike: 105, ratio: 1, entryPrice: 1.1 },
      { side: "long", kind: "call", strike: 110, ratio: 1, entryPrice: 0.4 }
    ]
  };
  assert.equal(Math.round(positionPLAt(condor, 100)), 140, "all four expire worthless: the net credit");
  assert.equal(Math.round(positionPLAt(condor, 80)), -360, "5 wide less the $1.40 credit");
  assert.equal(Math.round(positionPLAt(condor, 130)), -360, "and the same on the other side");
});

test("an adjusted contract is not priced, and is named instead of dropped", () => {
  const adjusted = { ...ratioRow, adjusted: true };
  assert.equal(positionPLAt(adjusted, 366), null);
  const book = tickerBook([sharesRow, adjusted], "TSLA");
  assert.equal(book.unpriceable.length, 1);
});

test("the book counts what is held, in the units each thing is held in", () => {
  const book = tickerBook([sharesRow, ratioRow], "TSLA");
  assert.equal(book.shares, 210);
  assert.equal(book.shortContracts, 2);
  assert.equal(book.longContracts, 1);
  assert.equal(book.spot, 366.11);
  assert.equal(book.unrealizedPL, 198, "the rows' own mark-to-market, added");
  assert.equal(book.expirationPL, 1398);
});

test("an unreadable expiration figure makes the total say so, not guess", () => {
  const book = tickerBook([sharesRow, { ...ratioRow, expirationPL: null }], "TSLA");
  assert.equal(book.expirationPL, null);
});

test("the whole book's break-even is not any single row's", () => {
  // The ratio alone turns over at 376.31 and the shares alone at 364.31.
  // Together the position is flat at 359.27 -- between the strikes, where
  // 310 shares' worth of delta (210 held plus the long call, less nothing yet
  // from the shorts) closes the gap. Neither card shows it, and it is the
  // number that decides whether to act.
  const book = tickerBook([sharesRow, ratioRow], "TSLA");
  const range = curveRange(book);
  const curve = payoffCurve(book, { ...range, steps: 1200 });
  const zeros = crossings(curve);
  assert.equal(zeros.length, 1, "above the crossing the stock outruns the extra short forever");
  assert.ok(Math.abs(zeros[0].price - 359.27) < 0.2, `expected ~359.27, got ${zeros[0].price}`);
  assert.equal(zeros[0].rising, true);
});

test("the range holds every strike, the basis and the spot", () => {
  const { from, to } = curveRange(tickerBook([sharesRow, ratioRow], "TSLA"));
  assert.ok(from < 352.5 && to > 376.31);
  assert.ok(from < 366.11 && to > 366.11);
});

test("a ticker with nothing on it is nothing, not an empty book", () => {
  assert.equal(tickerBook([sharesRow], "NVDA"), null);
});
