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

// 27 Oct: a $600 account on screen, Shift+0 selling 0.5% of the portfolio:
// $3, less than one NUWE share at $4.85, and so nothing for the others either.
test("a percent-of-portfolio hotkey: each account takes the percent of its own", () => {
  const small = { id: "S", name: "Small", equity: 600, buyingPower: 600, held: 10 };
  const live = { id: "L2", name: "Alton Live", equity: 127540, buyingPower: 300000, held: 109 };
  const rs = { id: "R", name: "Alton RS", equity: 112142, buyingPower: 259762, held: 0 };
  const opts = { symbol: "NUWE", price: 4.85, pct: 0.5 };
  // Selling what the one on screen holds: 0.5% of each, never more than it holds.
  const [l, r] = allocate({ side: "sell", qty: null }, small, [live, rs], opts);
  assert.deepEqual([l.qty, l.all], [109, true]); // $637 is 131 shares; it holds 109
  assert.match(r.skip!, /holds no NUWE/);
  // Buying: 0.5% of each own portfolio, whatever the one on screen came to.
  const [bl, br] = allocate({ side: "buy", qty: null }, { ...small, held: 0 }, [{ ...live, held: 0 }, rs], opts);
  assert.deepEqual([bl.qty, br.qty], [131, 115]);
  // With its own multiple: three times its 0.5%.
  const [x3] = allocate({ side: "buy", qty: null }, small, [{ ...rs, rule: { mode: "times", value: 3 } }], opts);
  assert.equal(x3.qty, 346);
  // Its own size still wins over the hotkey's percent.
  const [own] = allocate({ side: "buy", qty: null }, small, [{ ...rs, rule: { mode: "shares", value: 20 } }], opts);
  assert.equal(own.qty, 20);
  // A sale never takes an account past what it holds, its own size or not.
  const [cap] = allocate({ side: "sell", qty: 5 }, { ...small, held: 0 }, [{ ...rs, held: 30, rule: { mode: "shares", value: 500 } }], opts);
  assert.deepEqual([cap.qty, cap.all], [30, true]);
});

// 27 Oct, 16:21: the small account set to 10% of its portfolio, selling with a
// 0.5% key: its own 10% ($60, 12 shares at $4.85), capped at the 10 it holds.
test("selling with a percent key, an account's own size still counts", () => {
  const lead = { id: "L", name: "Alton Live", equity: 127540, buyingPower: 300000, held: 109 };
  const small = { id: "S", name: "Small", equity: 600, buyingPower: 600, held: 10, rule: { mode: "percent" as const, value: 10 } };
  const [s1] = allocate({ side: "sell", qty: 109 }, lead, [small], { symbol: "NUWE", price: 4.85, pct: 0.5 });
  assert.deepEqual([s1.qty, s1.all, s1.skip], [10, true, null]);
  const [s2] = allocate({ side: "sell", qty: 109 }, lead, [{ ...small, rule: { mode: "shares" as const, value: 4 } }], { symbol: "NUWE", price: 4.85, pct: 0.5 });
  assert.deepEqual([s2.qty, s2.all], [4, false]);
  // Its 0.5% ($3) is under one share at $4.85: a sale of shares it holds sells one (28 Oct).
  const [s3] = allocate({ side: "sell", qty: 109 }, lead, [{ ...small, rule: null }], { symbol: "NUWE", price: 4.85, pct: 0.5 });
  assert.deepEqual([s3.qty, s3.all, s3.skip], [1, false, null]);
});

// 28 Oct, 04:57, ELPW: a sale whose size is under one share on an account
// holding shares sells one of them; one holding nothing, or a buy, is still skipped.
test("selling shares held never comes to less than one share", () => {
  const lead = { id: "L", name: "Alton RS", equity: 110000, buyingPower: 110000, held: 85 };
  const one = { id: "P", name: "Paper", equity: 1411.53, buyingPower: 1408.25, held: 1 };
  const none = { ...one, id: "N", held: 0 };
  const opts = { symbol: "ELPW", price: 3.57, pct: 0.25 };
  const [p, n] = allocate({ side: "sell", qty: 78 }, lead, [one, none], opts);
  assert.deepEqual([p.qty, p.all, p.skip], [1, true, null]);
  assert.match(n.skip!, /holds no ELPW/);
  const [q] = allocate({ side: "sell", qty: 1 }, { ...lead, held: 0 }, [one], opts);
  assert.deepEqual([q.qty, q.skip], [1, null]);
  const [b] = allocate({ side: "buy", qty: 78 }, { ...lead, held: 0 }, [one], opts);
  assert.match(b.skip!, /less than one share/);
});
