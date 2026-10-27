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
