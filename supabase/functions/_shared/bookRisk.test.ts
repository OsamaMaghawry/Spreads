import test from "node:test";
import assert from "node:assert/strict";
import { pairSpreads } from "./spreadPairing.ts";
import { bookRisk, bookRiskByTicker, bookRiskTotal } from "./bookRisk.ts";
import { legsOfAll } from "./positionLegs.ts";
import { payoffAt } from "./legMath.ts";

// Every case starts from raw broker positions and goes through pairSpreads,
// because the claim being tested is about the ROWS the dashboard actually
// builds -- a book assembled by hand would prove nothing about the split the
// pairing performs.

const opt = (sym: string, qty: number, entry: number) => ({
  symbol: sym,
  asset_class: "us_option",
  qty: String(qty),
  avg_entry_price: String(entry),
  current_price: String(entry)
});
const stock = (sym: string, qty: number, entry: number) => ({
  symbol: sym,
  asset_class: "us_equity",
  qty: String(qty),
  avg_entry_price: String(entry),
  current_price: String(entry),
  market_value: String(qty * entry)
});

test("a covered call is right as a book and wrong as either row", () => {
  // 100 shares at $400 with the 420 call written for $6. The pairing splits
  // this across two rows on purpose: the cover lives on the share row.
  const rows = pairSpreads([stock("TSLA", 100, 400), opt("TSLA260918C00420000", -1, 6)], []);
  assert.ok(rows.length >= 2, "the old model splits it");

  const book = bookRisk("TSLA", rows);
  assert.equal(book.reason, null, "one name, one expiry -- it prices");
  assert.equal(book.unbounded, null, "the shares cover the call; nothing runs away");
  assert.equal(book.holdsStock, true);
  // Stock to zero, less the premium taken in: 100 x 400 - 600.
  assert.equal(book.maxLoss, 39400);
  assert.equal(book.maxLossAt, 0);
  assert.deepEqual(book.breakEvens, [394]);
});

test("the call alone reads as unbounded; the book does not", () => {
  const rows = pairSpreads([stock("TSLA", 100, 400), opt("TSLA260918C00420000", -1, 6)], []);
  const callRow = rows.find((r: any) => r.type !== "shares" && !r.shares);
  assert.ok(callRow, "there is a separate call row");
  // The exact failure the ticker-level rule exists to prevent: hand the engine
  // one row of a pair and a fully covered call is a naked one.
  const alone = bookRisk("TSLA", [callRow]);
  assert.equal(alone.unbounded, "up");
  assert.equal(alone.maxLoss, null);
});

test("two spreads on one name offset inside the name and sum across names", () => {
  const rows = pairSpreads(
    [
      opt("AMD260918P00465000", -1, 3),
      opt("AMD260918P00460000", 1, 1.5),
      opt("NVDA260918P00180000", -1, 2),
      opt("NVDA260918P00175000", 1, 1)
    ],
    []
  );
  const books = bookRiskByTicker(rows);
  assert.deepEqual(books.map((b) => b.ticker), ["AMD", "NVDA"]);
  assert.equal(books[0].maxLoss, 350);
  assert.equal(books[1].maxLoss, 400);

  const total = bookRiskTotal(books);
  assert.equal(total.risk, 750);
  assert.equal(total.complete, true);
});

test("an iron condor's two sides net inside the name, they do not add", () => {
  // Both sides are 5 wide for 1.00 each. Only one side can finish in the
  // money, so the book loses 500 - 200 = 300, not 800.
  const rows = pairSpreads(
    [
      opt("AMD260918P00465000", -1, 1),
      opt("AMD260918P00460000", 1, 0),
      opt("AMD260918C00475000", -1, 1),
      opt("AMD260918C00480000", 1, 0)
    ],
    []
  );
  const book = bookRisk("AMD", rows);
  assert.equal(book.maxLoss, 300);
  assert.equal(book.unbounded, null);
});

test("a naked short call makes the whole ticker unbounded, and says so", () => {
  const rows = pairSpreads([opt("AMD260918C00475000", -1, 2)], []);
  const book = bookRisk("AMD", rows);
  assert.equal(book.unbounded, "up");
  assert.equal(book.maxLoss, null);

  const total = bookRiskTotal([book]);
  assert.equal(total.complete, false, "a total that cannot be sized must not read as one");
  assert.deepEqual(total.unbounded, ["AMD"]);
  assert.equal(total.risk, 0, "the unsizeable ticker contributes nothing rather than a zero pretending to be a figure");
});

test("two expiries on one name are refused with a reason, not flattened", () => {
  const rows = pairSpreads(
    [opt("AMD260918C00475000", -1, 2), opt("AMD261016C00475000", 1, 4)],
    []
  );
  const book = bookRisk("AMD", rows);
  assert.match(String(book.reason), /expiry/);
  assert.equal(book.maxLoss, null);
  assert.deepEqual(book.breakEvens, [], "no invented roots on a book that cannot be priced");

  const total = bookRiskTotal([book]);
  assert.equal(total.complete, false);
  assert.equal(total.unpriceable.length, 1);
  assert.equal(total.unpriceable[0].ticker, "AMD");
});

test("a 1x2 repair prices as one book whatever the pairing calls it", () => {
  // The 8 Sep position: long one 400 call, short two 420s, one expiry.
  const rows = pairSpreads(
    [opt("TSLA260918C00400000", 1, 20), opt("TSLA260918C00420000", -2, 12)],
    []
  );
  const book = bookRisk("TSLA", rows);
  // Short two calls against one long: above the 420s the book loses a share
  // for every dollar. There is no bound, and no name had to be recognised to
  // discover that.
  assert.equal(book.unbounded, "up");

  // The pairing splits this into a debit vertical AND a lone short 420, so the
  // book carries three leg records for two contracts. That split is exactly
  // what the ticker level exists to undo: the net at the 420 strike is -2 and
  // the payoff recombines to the hand figure.
  const legs = legsOfAll(rows);
  assert.equal(legs.length, 3, "three records, because the row split is real");
  const at420 = legs.filter((l) => l.strike === 420).reduce((s, l) => s + l.qty, 0);
  assert.equal(at420, -2, "and the two shorts are still two shorts");
  // Long 400C paid $20, two 420Cs written for $12 each. At 420 the long is
  // worth its cost and both shorts expire: 0 + 2 x 1200.
  assert.equal(payoffAt(legs, 420), 2400);
});

test("a book with no rows is empty, not free", () => {
  const book = bookRisk("AMD", []);
  assert.equal(book.maxLoss, null);
  assert.equal(book.reason, "no legs");
});
