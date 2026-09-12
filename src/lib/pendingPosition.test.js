import test from "node:test";
import assert from "node:assert/strict";
import { pendingRows, ticketMarks, legNet, withPending, maxProfitOf, expiriesOf } from "./pendingPosition.js";
import { positionPLAt, payoffCurve, crossings } from "./tickerBook.js";

const csp = {
  ticker: "TSLA",
  strategy: "cash_secured_put",
  spot: 365,
  credit: 4.3,
  legs: [{ role: "short_put", side: "sell", strike: 350, mid: 4.3, ratio: 1 }]
};

const putSpread = {
  ticker: "TSLA",
  strategy: "put_spread",
  spot: 365,
  credit: 1.0,
  legs: [
    { role: "short_put", side: "sell", strike: 350, mid: 4.0, ratio: 1 },
    { role: "long_put", side: "buy", strike: 345, mid: 3.0, ratio: 1 }
  ]
};

// ---------------------------------------------------------------------------
// legNet — the sign convention, from the legs
// ---------------------------------------------------------------------------

test("a net credit is positive and a net debit negative", () => {
  assert.equal(legNet(putSpread.legs), 1);
  assert.equal(
    legNet([
      { side: "buy", mid: 4.0, ratio: 1 },
      { side: "sell", mid: 3.0, ratio: 1 }
    ]),
    -1
  );
});

// ---------------------------------------------------------------------------
// pendingRows — the order priced by the engine that prices open positions
// ---------------------------------------------------------------------------

test("a cash-secured put keeps its credit above the strike and loses below", () => {
  const [row] = pendingRows(csp, 1);
  // Above the strike the put expires worthless and the credit is the profit.
  assert.equal(positionPLAt(row, 400), 430);
  // At the break-even, nothing.
  assert.ok(Math.abs(positionPLAt(row, 350 - 4.3)) < 1e-6);
  // Near zero: the strike less the credit, which is the max loss the ticket
  // prints -- "(stock to 0)" on the preview is this number.
  assert.ok(Math.abs(positionPLAt(row, 0.0001) - -(350 - 4.3) * 100) < 0.05);
});

test("a put spread's payoff is bounded by the width both ways", () => {
  const [row] = pendingRows(putSpread, 1);
  assert.equal(positionPLAt(row, 400), 100);      // both expire worthless: the credit
  assert.equal(positionPLAt(row, 300), -400);     // width 5 less the credit 1
});

test("quantity multiplies the whole payoff", () => {
  const [row] = pendingRows(putSpread, 3);
  assert.equal(positionPLAt(row, 400), 300);
  assert.equal(positionPLAt(row, 300), -1200);
});

test("the limit actually being worked shifts the curve, not the shape", () => {
  // Built at a $1.00 mid, sent at $1.20. Every point is 20c × 100 better and
  // the width still bounds it.
  const [mid] = pendingRows(putSpread, 1);
  const [better] = pendingRows(putSpread, 1, 1.2);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
  near(positionPLAt(better, 400) - positionPLAt(mid, 400), 20);
  near(positionPLAt(better, 300) - positionPLAt(mid, 300), 20);
  near(positionPLAt(better, 400), 120);
  near(positionPLAt(better, 300), -380);
});

test("a covered call brings the shares it is written against", () => {
  // Without the shares this draws a naked call: an unbounded loss above the
  // strike on a position that has a ceiling and a floor.
  const cc = {
    ticker: "AAPL",
    strategy: "covered_call",
    spot: 230,
    credit: 3,
    basis: 200,
    sharesHeld: 100,
    legs: [{ role: "short_call", side: "sell", strike: 240, mid: 3, ratio: 1 }]
  };
  const rows = pendingRows(cc, 1);
  assert.equal(rows.length, 2);
  const at = (p) => rows.reduce((a, r) => a + positionPLAt(r, p), 0);
  // Called away at 240: (240 - 200 + 3) × 100.
  assert.equal(at(240), 4300);
  // And it stays there however high the stock goes -- the call gives back
  // exactly what the shares gain.
  assert.equal(at(400), 4300);
  // Down at the basis, the credit is all that is left.
  assert.equal(at(200), 300);
});

test("a bought put is a debit that cannot lose more than it cost", () => {
  const longPut = {
    ticker: "TSLA",
    strategy: "long_put",
    spot: 365,
    credit: -4.3,
    legs: [{ role: "long_put", side: "buy", strike: 370, mid: 4.3, ratio: 1 }]
  };
  const [row] = pendingRows(longPut, 2);
  assert.equal(positionPLAt(row, 400), -860);
  assert.ok(Math.abs(positionPLAt(row, 370 - 4.3)) < 1e-6);
  assert.ok(Math.abs(positionPLAt(row, 300) - (70 - 4.3) * 200) < 1e-6);
});

test("a setup with no legs makes no rows rather than an empty position", () => {
  assert.deepEqual(pendingRows({ ticker: "TSLA", legs: [] }, 1), []);
  assert.deepEqual(pendingRows(null, 1), []);
});

test("a shift large enough to invert a leg's price makes no rows at all", () => {
  // `positionPLAt` reads the absolute entry price, so a negative one would
  // silently price the opposite trade. Refusing is the only safe answer.
  assert.deepEqual(pendingRows(putSpread, 1, -50), []);
});

// ---------------------------------------------------------------------------
// withPending — the book as it would be, beside the book as it is
// ---------------------------------------------------------------------------

test("the pending order joins the open book and moves where it breaks even", () => {
  // An open short 350 put taken for 4.30, and a second one about to be sold
  // at 340 for 2.00. Two short puts break even lower than one.
  const openBook = {
    ticker: "TSLA",
    spot: 365,
    rows: [{
      ticker: "TSLA",
      qty: 1,
      legs: [{ kind: "put", side: "short", strike: 350, entryPrice: 4.3, ratio: 1 }]
    }]
  };
  const after = withPending(openBook, pendingRows({
    ticker: "TSLA",
    strategy: "cash_secured_put",
    spot: 365,
    credit: 2,
    legs: [{ role: "short_put", side: "sell", strike: 340, mid: 2, ratio: 1 }]
  }, 1));

  assert.equal(after.rows.length, 2);
  const before = crossings(payoffCurve(openBook, { from: 300, to: 380, steps: 800 }));
  const later = crossings(payoffCurve(after, { from: 300, to: 380, steps: 800 }));
  assert.equal(before.length, 1);
  assert.equal(later.length, 1);
  assert.ok(Math.abs(before[0].price - 345.7) < 0.2);
  // The second credit pays for part of the first put's loss, so the pair
  // turns over LOWER than the single position did: 6.30 taken in against the
  // 350 put alone is 343.70, and the 340 put is still worthless there.
  assert.ok(later[0].price < before[0].price);
  assert.ok(Math.abs(later[0].price - 343.7) < 0.2, `crossing ${later[0].price}`);
});

test("with nothing open, the book is just the order", () => {
  const rows = pendingRows(csp, 1);
  const book = withPending(null, rows);
  assert.equal(book.rows.length, 1);
  assert.equal(book.spot, 365);
  assert.equal(withPending(null, []), null);
});

// ---------------------------------------------------------------------------
// ticketMarks
// ---------------------------------------------------------------------------

test("every strike is marked once, short and long told apart", () => {
  assert.deepEqual(ticketMarks(putSpread), [
    { label: "S 350P", value: 350 },
    { label: "L 345P", value: 345 }
  ]);
});

test("a covered call marks the basis as well as the strike", () => {
  const marks = ticketMarks({
    strategy: "covered_call",
    basis: 200,
    legs: [{ role: "short_call", side: "sell", strike: 240 }]
  });
  assert.deepEqual(marks.map((m) => m.label), ["S 240C", "Basis"]);
});

// ---------------------------------------------------------------------------
// maxProfitOf — the other end of the picture
// ---------------------------------------------------------------------------

test("a credit structure's best case is keeping the credit", () => {
  assert.equal(maxProfitOf(csp), 430);
  assert.equal(maxProfitOf(putSpread), 100);
  assert.equal(maxProfitOf({ strategy: "iron_condor", credit: 2.4, legs: [] }), 240);
});

test("a bought call has no ceiling and a bought put has one", () => {
  assert.equal(maxProfitOf({ strategy: "long_call", credit: -4.3, legs: [{ strike: 370 }] }), null);
  // Stock to zero on a 370 put bought for 4.30.
  assert.equal(maxProfitOf({ strategy: "long_put", credit: -4.3, legs: [{ strike: 370 }] }), 36570);
});

test("a covered call's best case is being called away", () => {
  assert.equal(maxProfitOf({ strategy: "covered_call", credit: 3, ifCalled: 4300, legs: [] }), 4300);
});

test("a builder's own refusal to bound the profit is not overridden", () => {
  // `spreadSetup` sets maxProfit null on a diagonal on purpose. Treating that
  // as "unknown, so assume the credit" would put a ceiling on a position the
  // builder deliberately declined to give one.
  assert.equal(maxProfitOf({ strategy: "put_spread", credit: 1.2, maxProfit: null, legs: [] }), null);
  assert.equal(maxProfitOf({ strategy: "put_spread", credit: 1.2, maxProfit: 380, legs: [] }), 380);
});

// ---------------------------------------------------------------------------
// expiriesOf — the gate on drawing a payoff at all
// ---------------------------------------------------------------------------

test("a vertical has one expiry and a diagonal has two", () => {
  assert.deepEqual(expiriesOf({ expiry: "2026-10-16", legs: [{ strike: 350 }, { strike: 345 }] }), ["2026-10-16"]);
  assert.deepEqual(
    expiriesOf({
      expiry: "2027-02-19",
      legs: [
        { strike: 270, expiry: "2027-02-19" },
        { strike: 320, expiry: "2027-12-17" }
      ]
    }),
    ["2027-02-19", "2027-12-17"]
  );
});

test("a setup with no legs still reports its own expiry", () => {
  assert.deepEqual(expiriesOf({ expiry: "2026-10-16", legs: [] }), ["2026-10-16"]);
  assert.deepEqual(expiriesOf({}), []);
});

// ---------------------------------------------------------------------------
// withPending — a covered call's shares are added once, never twice
// ---------------------------------------------------------------------------

const coveredCall = {
  ticker: "AAPL",
  strategy: "covered_call",
  spot: 230,
  credit: 3,
  basis: 200,
  sharesHeld: 100,
  legs: [{ role: "short_call", side: "sell", strike: 240, mid: 3, ratio: 1 }]
};

test("with nothing open, the covered call's own shares are drawn", () => {
  const book = withPending(null, pendingRows(coveredCall, 1));
  assert.equal(book.rows.length, 2);
});

test("beside a book that already holds the shares, they are NOT drawn again", () => {
  // The shares in the open book ARE the cover. Adding the synthetic lot on top
  // draws 200 shares against a 100-share call, and writing a call then looks
  // like it adds upside instead of capping it.
  const open = {
    ticker: "AAPL",
    spot: 230,
    rows: [{ ticker: "AAPL", type: "shares", shareQty: 100, shareBasis: 200, stockPrice: 230 }]
  };
  const after = withPending(open, pendingRows(coveredCall, 1));
  assert.equal(after.rows.length, 2);
  assert.equal(after.rows.filter((r) => r.type === "shares").length, 1);

  const at = (p) => after.rows.reduce((a, r) => a + positionPLAt(r, p), 0);
  // Called away at 240: shares made 40, the call kept 3. Not 80 and 3.
  assert.equal(at(240), 4300);
  assert.equal(at(400), 4300);
});

test("an uncovered short call's profit is the credit, not 'no ceiling'", () => {
  // ifCalled is null without a basis. Falling through to null printed
  // "Max profit: No ceiling" on a naked call -- the most dangerous sentence
  // this screen could carry.
  assert.equal(maxProfitOf({ strategy: "covered_call", credit: 6, ifCalled: null, legs: [] }), 600);
  assert.equal(maxProfitOf({ strategy: "covered_call", credit: 6, ifCalled: 4300, legs: [] }), 4300);
});
