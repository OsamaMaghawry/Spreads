import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate } from "./proRata.ts";

const lead = { id: "L", name: "Lead", equity: 100000, buyingPower: 200000, held: 0 };
const half = { id: "A", name: "Half", equity: 50000, buyingPower: 50000, held: 0 };
const big = { id: "B", name: "Big", equity: 250000, buyingPower: 500000, held: 0 };
const tiny = { id: "T", name: "Tiny", equity: 900, buyingPower: 900, held: 0 };

test("buying: each account in proportion to its portfolio value", () => {
  const [a, b, t] = allocate({ side: "buy", qty: 115 }, lead, [half, big, tiny], { symbol: "AIOK" });
  assert.deepEqual([a.qty, a.basis, a.skip], [57, "equity", null]); // 57.5, rounded down
  assert.equal(b.qty, 287); // 287.5
  assert.equal(t.qty, 1); // 1.035
  // Too small for one share: skipped, and said why.
  const [none] = allocate({ side: "buy", qty: 50 }, lead, [tiny]);
  assert.equal(none.qty, null);
  assert.match(none.skip!, /less than one share/);
});

test("sized from buying power: in proportion to buying power", () => {
  const [a, b] = allocate({ side: "buy", qty: 100 }, lead, [half, big], { basis: "buyingPower" });
  assert.deepEqual([a.qty, a.basis, b.qty], [25, "buyingPower", 250]);
});

test("dollar orders and part shares scale too", () => {
  const [a, t] = allocate({ side: "buy", notional: 1000 }, lead, [half, tiny]);
  assert.deepEqual([a.notional, a.qty], [500, null]);
  assert.equal(t.notional, 9); // $1000 * 0.009
  const [t2] = allocate({ side: "buy", notional: 100 }, lead, [tiny]);
  assert.match(t2.skip!, /less than \$1/);
  const [p] = allocate({ side: "buy", qty: 2.5 }, lead, [half]);
  assert.equal(p.qty, 1.25);
  const [coin] = allocate({ side: "buy", qty: 0.3 }, lead, [half], { crypto: true });
  assert.equal(coin.qty, 0.15);
});

test("selling what the lead holds: in proportion to each account's holding", () => {
  const holder = { ...lead, held: 114 };
  const other = { ...half, held: 40 };
  const short = { ...big, held: -10 };
  const flat = { ...tiny, held: 0 };
  const [o, s, f] = allocate({ side: "sell", qty: 28 }, holder, [other, short, flat], { symbol: "AIOK" });
  assert.deepEqual([o.qty, o.basis, o.all], [9, "holding", false]); // 40 * 28/114 = 9.8
  assert.match(s.skip!, /holds no AIOK to sell/);
  assert.match(f.skip!, /holds no AIOK/);
  // All of the lead's: all of each, exactly.
  const [allOf] = allocate({ side: "sell", qty: 114 }, holder, [{ ...other, held: 40.5 }]);
  assert.deepEqual([allOf.qty, allOf.all], [40.5, true]);
  // More than the lead holds still sells no more than each account holds.
  const [over] = allocate({ side: "sell", qty: 200 }, holder, [other]);
  assert.deepEqual([over.qty, over.all], [40, true]);
  // Buying back a short: in proportion to each short.
  const [cover] = allocate({ side: "buy", qty: 5 }, { ...lead, held: -10 }, [{ ...half, held: -4 }]);
  assert.deepEqual([cover.qty, cover.basis], [2, "holding"]);
});

test("a sale with nothing held on the lead opens a short: sized by portfolio value", () => {
  const [a] = allocate({ side: "sell", qty: 10 }, lead, [half]);
  assert.deepEqual([a.qty, a.basis], [5, "equity"]);
});

test("no size on the lead: nothing guessed", () => {
  const [a] = allocate({ side: "buy", qty: 10 }, { ...lead, equity: null }, [half]);
  assert.match(a.skip!, /account on screen/);
});

// 27 Oct: "I need to set the quantities by account ... if account is small
// and I set 1%, it doesn't work with it."
test("each account's own size: a multiple, a percent of its portfolio, shares, dollars", () => {
  const order = { side: "buy" as const, qty: 115 }; // the lead: 1% of $127,540 at $11.10
  const lead127 = { ...lead, equity: 127540 };
  const small = { ...tiny, equity: 5000 };
  const opts = { symbol: "AIOK", price: 11.1 };
  // Pro rata, a $5,000 account gets 4 shares (4.5); three times that, 13.
  assert.equal(allocate(order, lead127, [small], opts)[0].qty, 4);
  const [x3] = allocate(order, lead127, [{ ...small, rule: { mode: "times", value: 3 } }], opts);
  assert.deepEqual([x3.qty, x3.basis], [13, "times"]);
  // 10% of its own $5,000 at $11.10: 45 shares.
  const [pct] = allocate(order, lead127, [{ ...small, rule: { mode: "percent", value: 10 } }], opts);
  assert.deepEqual([pct.qty, pct.basis, pct.skip], [45, "percent", null]);
  // Shares, and dollars at the order's price.
  assert.equal(allocate(order, lead127, [{ ...small, rule: { mode: "shares", value: 20 } }], opts)[0].qty, 20);
  assert.equal(allocate(order, lead127, [{ ...small, rule: { mode: "dollars", value: 500 } }], opts)[0].qty, 45);
  // A dollar order stays in dollars.
  const [usd] = allocate({ side: "buy", notional: 1000 }, lead127, [{ ...small, rule: { mode: "percent", value: 2 } }], opts);
  assert.deepEqual([usd.notional, usd.qty], [100, null]);
  // No price for a percent or dollars: said, not guessed. No size set: said.
  assert.match(allocate(order, lead127, [{ ...small, rule: { mode: "dollars", value: 500 } }], { symbol: "AIOK" })[0].skip!, /no price/);
  assert.match(allocate(order, lead127, [{ ...small, rule: { mode: "shares", value: 0 } }], opts)[0].skip!, /no size set/);
  // Pro rata named as such is pro rata.
  assert.equal(allocate(order, lead127, [{ ...small, rule: { mode: "prorata" } }], opts)[0].qty, 4);
});

test("selling what is held stays in proportion to the holding, whatever the account's own size", () => {
  const holder = { ...lead, held: 100 };
  const [o] = allocate({ side: "sell", qty: 50 }, holder, [{ ...half, held: 30, rule: { mode: "shares", value: 500 } }], { price: 10 });
  assert.deepEqual([o.qty, o.basis], [15, "holding"]);
});
