import test from "node:test";
import assert from "node:assert/strict";
import {
  pendingRows, ticketMarks, legNet, withPending, maxProfitOf, expiriesOf,
  rowPLAt, bookPLAt, curveAt, analysisDates, atClose, survivingRows
} from "./pendingPosition.js";
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

// ---------------------------------------------------------------------------
// rowPLAt — one engine for every date, proven against the one it replaces
//
// The owner, on being shown "no payoff chart, the legs expire on different
// days": *"I don't think it's correct to just add the text of no Payoff just
// because they are in different dates. This is laziness from our side. You can
// add what you want to the graph with dates... the period when both are there
// and after one expires."*
// ---------------------------------------------------------------------------

const AFTER_EVERYTHING = Date.parse("2030-01-01T20:00:00Z");
const dated = (setup) => ({ ...setup, expiry: "2026-10-16" });

test("past every expiry, the dated engine IS the at-expiry one", () => {
  // The guarantee that there are not two payoff engines in this product. If
  // this ever fails, a vertical is being priced two different ways.
  for (const setup of [dated(csp), dated(putSpread)]) {
    const [row] = pendingRows(setup, 2);
    for (const price of [0.01, 200, 300, 345, 350, 365, 400, 900]) {
      assert.equal(
        rowPLAt(row, price, AFTER_EVERYTHING),
        positionPLAt(row, price),
        `${setup.strategy} at ${price}`
      );
    }
  }
});

test("shares are worth the same on any date", () => {
  const row = { type: "shares", shareQty: 100, shareBasis: 200 };
  assert.equal(rowPLAt(row, 240, Date.now()), 4000);
  assert.equal(rowPLAt(row, 240, AFTER_EVERYTHING), 4000);
});

// The owner's own structure: buy the Feb-2027 270 put, sell the Dec-2027 320
// put. The short leg outlives the long one, so after February this is a bare
// short put — and THAT is what the near-expiry curve shows.
const diagonal = {
  ticker: "TSLA",
  strategy: "put_spread",
  structure: "diagonal",
  spot: 426,
  credit: 20,
  expiry: "2027-02-19",
  legs: [
    { role: "long_put", side: "buy", strike: 270, mid: 25, iv: 0.5, ratio: 1, expiry: "2027-02-19" },
    { role: "short_put", side: "sell", strike: 320, mid: 45, iv: 0.5, ratio: 1, expiry: "2027-12-17" }
  ]
};

test("a diagonal IS drawable — on the date its near leg expires", () => {
  const [row] = pendingRows(diagonal, 1);
  const asOf = atClose("2027-02-19");
  const at = (p) => rowPLAt(row, p, asOf);

  // Every point prices. This is the whole objection: the position has an
  // analysis, and refusing to draw one was a choice, not a limit.
  for (const p of [200, 270, 320, 426, 600]) {
    assert.ok(at(p) !== null && Number.isFinite(at(p)), `no value at ${p}`);
  }

  // High enough and both puts are worthless: the credit is what is left.
  assert.ok(Math.abs(at(1200) - 2000) < 50, `at 1200: ${at(1200)}`);

  // ON THE FEBRUARY DATE the loss IS bounded, near the width less the credit:
  // as the stock falls the long 270 put's intrinsic value rises alongside the
  // still-live short 320 put's. This is the curve a trader would actually see
  // in February, and it is worth drawing precisely because it looks calm.
  assert.ok(at(200) < -2500 && at(200) > -3500, `at 200: ${at(200)}`);
  assert.ok(at(50) > -3500, `at 50: ${at(50)} -- still bounded on this date`);
});

test("the near-expiry curve is NOT the same as the naive at-expiry one", () => {
  // The naive line treats the Dec-2027 short as if it settled in Feb-2027.
  // If these agreed, the fix would be cosmetic.
  const [row] = pendingRows(diagonal, 1);
  const naive = positionPLAt(row, 250);
  const real = rowPLAt(row, 250, atClose("2027-02-19"));
  assert.ok(Math.abs(naive - real) > 1000, `naive ${naive} vs dated ${real}`);
  assert.ok(real < naive, "the live short leg is worth more than its intrinsic");
});

test("a leg still alive with no volatility is refused, not guessed", () => {
  const noVol = {
    ...diagonal,
    legs: diagonal.legs.map((l) => ({ ...l, iv: null, mid: 0 }))
  };
  const [row] = pendingRows(noVol, 1);
  // Priced on the near expiry the far leg needs a volatility and has none.
  assert.equal(rowPLAt(row, 300, atClose("2027-02-19")), null);
  // Past every expiry it needs none, and prices.
  assert.ok(rowPLAt(row, 300, AFTER_EVERYTHING) !== null);
});

test("a book prices what it can and says nothing when it can none", () => {
  const rows = pendingRows(dated(csp), 1);
  assert.equal(bookPLAt(rows, 400, AFTER_EVERYTHING), 430);
  assert.equal(bookPLAt([], 400, AFTER_EVERYTHING), null);
  // An adjusted row is skipped; a book of only adjusted rows has no answer.
  assert.equal(bookPLAt([{ adjusted: true, legs: [] }], 400, AFTER_EVERYTHING), null);
});

test("the curve drops prices it cannot value rather than plotting them at zero", () => {
  const rows = pendingRows(dated(csp), 1);
  const curve = curveAt(rows, { from: 300, to: 400, steps: 10 }, AFTER_EVERYTHING);
  assert.equal(curve.length, 11);
  assert.ok(curve.every((p) => Number.isFinite(p.pl)));
  assert.equal(curveAt(rows, { from: 400, to: 300 }, AFTER_EVERYTHING).length, 0);
});

// ---------------------------------------------------------------------------
// analysisDates
// ---------------------------------------------------------------------------

test("the near expiry is the date the position stops being what it is", () => {
  const d = analysisDates(diagonal);
  assert.equal(d.near, "2027-02-19");
  assert.equal(d.far, "2027-12-17");
  assert.equal(d.multi, true);
});

test("a single-expiry position has one date and is not multi", () => {
  const d = analysisDates(dated(putSpread));
  assert.equal(d.near, "2026-10-16");
  assert.equal(d.far, null);
  assert.equal(d.multi, false);
});

// ---------------------------------------------------------------------------
// survivingRows — the half of the analysis a single curve cannot show
// ---------------------------------------------------------------------------

test("after the near expiry, only the longer leg is left", () => {
  const [row] = pendingRows(diagonal, 1);
  const left = survivingRows([row], "2027-02-19");
  assert.equal(left.length, 1);
  assert.equal(left[0].legs.length, 1);
  assert.equal(left[0].legs[0].strike, 320);
  assert.equal(left[0].legs[0].side, "short");
});

test("and THAT is the piece with no floor under it", () => {
  // The February curve looks bounded. The position it leaves behind is a bare
  // short 320 put running to December, and this is where the loss runs away —
  // which no single payoff line can show, because it depends on where the
  // stock was in February AND where it is in December.
  const [row] = pendingRows(diagonal, 1);
  const [left] = survivingRows([row], "2027-02-19");
  const at = (p) => rowPLAt(left, p, atClose("2027-12-17"));
  assert.equal(at(400), 4500);            // expires worthless: the 45 it took in
  assert.equal(at(320), 4500);
  assert.equal(at(220), -5500);           // 100 in the money
  assert.equal(at(20), -25500);           // and it keeps going
  assert.ok(at(1) < at(20), "no floor");
});

test("shares survive every expiry", () => {
  const shares = { type: "shares", shareQty: 100, shareBasis: 200 };
  assert.deepEqual(survivingRows([shares], "2030-01-01"), [shares]);
});

test("nothing survives its own expiry", () => {
  const [row] = pendingRows(dated(putSpread), 1);
  assert.deepEqual(survivingRows([row], "2026-10-16"), []);
});
