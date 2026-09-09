import test from "node:test";
import assert from "node:assert/strict";
import { pairSpreads } from "./spreadPairing.ts";
import { legsOf, legsOfAll, bookByTicker } from "./positionLegs.ts";
import { maxLoss, breakEvens, netPremium } from "./legMath.ts";
import { structureName } from "./structureName.ts";

// The adapter is only worth having if it round-trips REAL pairing output, so
// every case here starts from raw broker positions and goes through
// pairSpreads — the same path the dashboard takes.

const opt = (sym: string, qty: number, entry: number) =>
  ({ symbol: sym, asset_class: "us_option", qty: String(qty), avg_entry_price: String(entry), current_price: String(entry) });
const stock = (sym: string, qty: number, entry: number) =>
  ({ symbol: sym, asset_class: "us_equity", qty: String(qty), avg_entry_price: String(entry), current_price: String(entry), market_value: String(qty * entry) });

test("a put credit spread survives the trip and prices the same either way", () => {
  const rows = pairSpreads([opt("AMD260918P00465000", -1, 3), opt("AMD260918P00460000", 1, 1.5)], []);
  assert.equal(rows.length, 1);
  const legs = legsOf(rows[0]);
  assert.equal(legs.length, 2);
  assert.deepEqual(legs.map((l) => l.qty).sort(), [-1, 1]);
  assert.equal(maxLoss(legs).loss, 350, "the same width-less-credit the old formula gives");
  assert.deepEqual(breakEvens(legs), [463.5]);
});

test("quantity travels: three spreads are three times the risk", () => {
  const rows = pairSpreads([opt("AMD260918P00465000", -3, 3), opt("AMD260918P00460000", 3, 1.5)], []);
  const legs = legsOf(rows[0]);
  assert.deepEqual(legs.map((l) => l.qty).sort(), [-3, 3]);
  assert.equal(maxLoss(legs).loss, 1050);
});

test("an iron condor's four legs come through with their ratios", () => {
  const order = {
    filled_at: "2026-09-01T14:00:00Z",
    legs: [
      { symbol: "AMD260918P00465000", side: "sell", filled_qty: "1" },
      { symbol: "AMD260918P00460000", side: "buy", filled_qty: "1" },
      { symbol: "AMD260918C00470000", side: "sell", filled_qty: "1" },
      { symbol: "AMD260918C00475000", side: "buy", filled_qty: "1" }
    ]
  };
  const rows = pairSpreads(
    [opt("AMD260918P00465000", -1, 3), opt("AMD260918P00460000", 1, 1.5),
     opt("AMD260918C00470000", -1, 2), opt("AMD260918C00475000", 1, 0.5)],
    [], [order]
  );
  assert.equal(rows[0].type, "iron_condor");
  const legs = legsOf(rows[0]);
  assert.equal(legs.length, 4);
  // $1.50 credit per side, $3.00 in total, 5 wide: one side loses $200 and
  // the other expires worthless. The old per-type formula gives $200 too —
  // (width - netCredit) x 100 — which is the point: same answer, no condor.
  assert.equal(maxLoss(legs).loss, 200, "one side, not both — arrived at without knowing it is a condor");
  assert.equal(structureName(legs).kind, "iron_condor");
});

test("the live repair: rows in, one honest book out", () => {
  const rows = pairSpreads(
    [
      stock("TSLA", 210, 364.31),
      opt("TSLA260918C00352500", 1, 13.57),
      opt("TSLA260918C00362500", -2, 8.69)
    ],
    [], [], { cash: 0 }
  );
  // Two rows today: the ratio and the shares.
  const book = legsOfAll(rows);
  assert.equal(book.length, 3, "three legs, whatever the rows are");
  assert.equal(maxLoss(book).loss, 76124.1);
  assert.deepEqual(breakEvens(book), [359.27]);
  assert.equal(structureName(book).label, "Stock repair");

  // And the options row on its own is the unbounded half.
  const ratio = rows.find((r: any) => r.type === "call_ratio_spread");
  assert.equal(maxLoss(legsOf(ratio)).unbounded, "up");
  assert.equal(netPremium(legsOf(ratio)), 381);
});

test("a share row carries its adjusted basis, not the broker's, because the P/L on screen does", () => {
  const basis = { AMD: { basis: 92, brokerBasis: 95, collected: 300, shares: 100, source: "adjusted" } };
  const rows = pairSpreads([stock("AMD", 100, 95)], [], [], { basisByTicker: basis });
  const legs = legsOf(rows[0]);
  assert.equal(legs[0].entryPrice, 92);
  assert.equal(legs[0].qty, 100);
  assert.equal(maxLoss(legs).loss, 9200);
});

test("a short share lot is a position, not an absence", () => {
  const rows = pairSpreads([stock("AMD", -100, 95)], []);
  const legs = legsOf(rows[0]);
  assert.equal(legs[0].qty, -100);
  assert.equal(structureName(legs).label, "Short shares");
});

test("an adjusted leg poisons its whole structure, on purpose", () => {
  const rows = pairSpreads([opt("AAPL1260918C00250000", -1, 3.1)], [], [], { cash: 0 });
  const legs = legsOf(rows[0]);
  assert.equal(legs[0].adjusted, true);
  assert.equal(maxLoss(legs).loss, null);
});

test("an empty or unknown row yields no legs rather than invented ones", () => {
  assert.deepEqual(legsOf(null), []);
  assert.deepEqual(legsOf({ type: "shares", shareQty: 0 }), []);
  assert.deepEqual(legsOf({ type: "whatever", qty: 1, legs: [] }), []);
});

// --- The two the bench found before layer 1 could reach them ---------------

test("a stock leg INSIDE a structure is stock, not a zero-strike put", () => {
  // No row puts stock in `legs` today. "One order, one position" will: a
  // covered call filled by one ticket is a share leg and a call leg in one
  // row. Before this branch existed the share leg fell to the call/else,
  // came out as a PUT struck at Number(null) = 0, passed the gate, and priced
  // as 100 long zero-strike puts with a -$2,998,800 net premium under the
  // confident name "Risk reversal 0/400".
  const row = {
    type: "covered_call", ticker: "X", qty: 1, expiryFormatted: "260918",
    legs: [
      { symbol: "X", assetClass: "equity", side: "long", qty: 100, entryPrice: 300, kind: "shares" },
      { symbol: "X260918C00400000", side: "short", kind: "call", strike: 400, ratio: 1, entryPrice: 12 }
    ]
  };
  const legs = legsOf(row);
  assert.equal(legs[0].type, "S");
  assert.equal(legs[0].qty, 100);
  assert.equal(legs[0].strike, null);
  assert.equal(legs[1].type, "C");
  assert.equal(netPremium(legs), 1200, "the call's credit, and nothing from the stock");
  assert.equal(maxLoss(legs).loss, 28800, "300 x 100 less the $1,200 taken in");
});

test("every option leg carries its expiry and its underlying, so the gate can do its job", () => {
  const rows = pairSpreads([opt("AMD260918P00465000", -1, 3), opt("AMD260918P00460000", 1, 1.5)], []);
  const legs = legsOf(rows[0]);
  for (const l of legs) {
    assert.ok(l.expiry, "an option leg with no expiry is refused, so it must have one");
    assert.equal(l.underlying, "AMD");
  }
});

test("a book is the unit that prices correctly; a row of a pair is not", () => {
  // The precondition, asserted rather than written in a comment. The old model
  // puts the cover on the SHARE row, so the covered call alone reads unbounded
  // and the share row alone loses the premium written against it. Together
  // they are right, which is why risk is computed per ticker book.
  const rows = pairSpreads(
    [stock("AMD", 100, 300), opt("AMD260918C00400000", -1, 12)],
    [], [], { cash: 0 }
  );
  const cc = rows.find((r: any) => r.type === "covered_call");
  assert.equal(maxLoss(legsOf(cc)).unbounded, "up", "the call alone has no cover in it");
  assert.equal(maxLoss(legsOfAll(rows)).loss, 28800, "the book has");
});

test("bookByTicker groups the rows risk must be computed over", () => {
  const rows = [{ ticker: "A" }, { ticker: "B" }, { ticker: "A" }, {}];
  const book = bookByTicker(rows);
  assert.equal(book.A.length, 2);
  assert.equal(book.B.length, 1);
  assert.equal(Object.keys(book).length, 2, "a row with no ticker is not a ticker");
});
