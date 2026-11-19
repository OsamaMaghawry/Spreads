import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, percentSplit } from "./proRata.ts";

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

// 3 Nov, the owner's approved design: each account at its own size or the
// key's, on a sale of what it holds too, never more than it holds.
test("selling what is held: each account's own size, never more than it holds; pro rata where it has none", () => {
  const holder = { ...lead, held: 100 };
  const [o] = allocate({ side: "sell", qty: 50 }, holder, [{ ...half, held: 30, rule: { mode: "shares", value: 500 } }], { price: 10 });
  assert.deepEqual([o.qty, o.all, o.basis], [30, true, "holding"]);
  const [d] = allocate({ side: "sell", qty: 50 }, holder, [{ ...half, held: 30, rule: { mode: "dollars", value: 100 } }], { price: 10 });
  assert.deepEqual([d.qty, d.all], [10, false]);
  const [p] = allocate({ side: "sell", qty: 50 }, holder, [{ ...half, held: 30 }], { price: 10 });
  assert.deepEqual([p.qty, p.basis], [15, "holding"]);
  // No price for a dollar size: said, not guessed.
  assert.match(allocate({ side: "sell", qty: 50 }, holder, [{ ...half, held: 30, rule: { mode: "dollars", value: 100 } }])[0].skip!, /no price/);
});

// 3 Nov: the account on screen not ticked; whether the order sells what is
// held is read from the accounts it goes to.
test("the account on screen not sent to: a sale where any ticked account holds sells only what each holds", () => {
  const screen = { ...lead, held: 0 };
  const holds = { ...half, held: 40, rule: { mode: "dollars" as const, value: 100 } };
  const flat = { ...big, held: 0, rule: { mode: "dollars" as const, value: 100 } };
  const [h, f] = allocate({ side: "sell", qty: null }, screen, [holds, flat], { price: 4.39, closing: "group" });
  assert.deepEqual([h.qty, h.skip], [22, null]);
  assert.match(f.skip!, /holds no it to sell/);
  // None holding: a short at each one's size.
  const [s1, s2] = allocate({ side: "sell", qty: null }, screen, [{ ...holds, held: 0 }, flat], { price: 4.39, closing: "group" });
  assert.deepEqual([s1.qty, s2.qty], [22, 22]);
  // A buy: each at its own size, whatever the screen holds.
  const [b] = allocate({ side: "buy", qty: null }, { ...lead, held: 500 }, [{ ...holds, held: 0, rule: { mode: "shares" as const, value: 7 } }], { price: 4.39, closing: "group" });
  assert.equal(b.qty, 7);
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
  // 131.48 and 115.61 shares: to the nearest share since 18 Nov.
  assert.deepEqual([bl.qty, br.qty], [131, 116]);
  // With its own multiple: three times its 0.5% (346.85 shares).
  const [x3] = allocate({ side: "buy", qty: null }, small, [{ ...rs, rule: { mode: "times", value: 3 } }], opts);
  assert.equal(x3.qty, 347);
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
  // A buy of 0.25% ($3.53, 0.99 of a share): one share since 18 Nov (the nearest).
  const [b] = allocate({ side: "buy", qty: 78 }, { ...lead, held: 0 }, [one], opts);
  assert.deepEqual([b.qty, b.skip], [1, null]);
  // 0.1% ($1.41, 0.4 of a share) is still too small to buy.
  const [t] = allocate({ side: "buy", qty: 78 }, { ...lead, held: 0 }, [one], { ...opts, pct: 0.1 });
  assert.match(t.skip!, /less than one share/);
});

// 3 Nov, the owner: "It refuses to buy QQQ below 1 share!" A buy under one
// whole share of a stock Alpaca trades in part shares takes the part share;
// a share or more stays whole shares, unless part shares are asked for.
test("a buy under one share of a fractionable stock: the part share, never under $1", () => {
  const screen = { ...lead, held: 0 };
  const opts = { symbol: "QQQ", price: 610, fractionable: true, parts: false };
  const [ten, many, tooSmall] = allocate({ side: "buy", qty: 0.163934426 }, screen, [
    { ...half, rule: { mode: "dollars" as const, value: 10 } },
    { ...big, rule: { mode: "dollars" as const, value: 1000 } },
    { ...tiny, rule: { mode: "dollars" as const, value: 0.5 } }
  ], opts);
  assert.deepEqual([ten.qty, ten.skip], [0.016393442, null]);
  assert.equal(many.qty, 1); // $1,000 is a whole share and some: one share
  assert.match(tooSmall.skip!, /under Alpaca's \$1 smallest part share/);
  // Part shares asked for: exact.
  assert.equal(allocate({ side: "buy", qty: 1.6 }, screen, [{ ...big, rule: { mode: "dollars" as const, value: 1000 } }], { ...opts, parts: true })[0].qty, 1.639344262);
  // A percent key on a small account: its part share.
  const [p] = allocate({ side: "buy", qty: null }, screen, [{ ...tiny, equity: 5000 }], { ...opts, pct: 1 });
  assert.equal(p.qty, 0.081967213);
  // Not fractionable, or a sale opening a short: whole shares only.
  assert.match(allocate({ side: "buy", qty: 1 }, screen, [{ ...half, rule: { mode: "dollars" as const, value: 10 } }], { ...opts, fractionable: false })[0].skip!, /less than one share/);
  assert.match(allocate({ side: "sell", qty: 1 }, screen, [{ ...half, rule: { mode: "dollars" as const, value: 10 } }], opts)[0].skip!, /less than one share/);
});

// ---------------------------------------------------------------------------
// The ticket's total shared by portfolio value (18 Nov: "pro rata not 25 per
// each"; "The sizing based on equity").
// ---------------------------------------------------------------------------
import { splitTotal, wholeHoldings } from "./proRata.ts";

const live = { id: "L", name: "Alpaca Live", equity: 160240, buyingPower: 160240, held: 0 };
const paper = { id: "P", name: "Paper 2", equity: 98110, buyingPower: 196220, held: 0 };
const sumOf = (rows: any[]) => rows.reduce((s, r) => s + (r.qty ?? r.notional ?? 0), 0);

test("split: 50 shares by portfolio value, adding up to exactly 50", () => {
  const rows = splitTotal({ side: "buy", qty: 50 }, [live, paper], { symbol: "AAPL" });
  // 50 x 160240 / 258350 = 31.01; 50 x 98110 / 258350 = 18.99: the leftover share to the larger remainder.
  assert.deepEqual(rows.map((r) => [r.id, r.qty, r.skip]), [["L", 31, null], ["P", 19, null]]);
  assert.equal(sumOf(rows), 50);
  // Three accounts, awkward sizes: always the exact total.
  for (const total of [1, 2, 3, 7, 10, 99, 100, 1001]) {
    const three = splitTotal({ side: "buy", qty: total }, [live, paper, { ...paper, id: "Q", equity: 12345 }]);
    assert.equal(sumOf(three), total, `total ${total}`);
  }
  // One share between two: the bigger account takes it, the other says why.
  const one = splitTotal({ side: "buy", qty: 1 }, [live, paper]);
  assert.deepEqual(one.map((r) => r.qty), [1, null]);
  assert.match(one[1].skip!, /less than one share/);
});

test("split: equal accounts share evenly; a sale opening a short is shared by value too", () => {
  const twin = { ...live, id: "T", name: "Twin" };
  assert.deepEqual(splitTotal({ side: "buy", qty: 50 }, [live, twin]).map((r) => r.qty), [25, 25]);
  // Nobody holds it: a short across both, by portfolio value.
  assert.deepEqual(splitTotal({ side: "sell", qty: 50 }, [live, paper]).map((r) => r.qty), [31, 19]);
});

test("split: selling what is held, by portfolio value, never more than an account holds", () => {
  const rows = splitTotal({ side: "sell", qty: 50 }, [{ ...live, held: 100 }, { ...paper, held: 10 }], { symbol: "AAPL" });
  // Paper's part is 19 but it holds 10: it sells its 10, exactly; the 9 over are not moved to Live.
  assert.deepEqual(rows.map((r) => [r.qty, r.all]), [[31, false], [10, true]]);
  // An account holding none sits a sale out (no short opened there); the holders share it by value.
  const mixed = splitTotal({ side: "sell", qty: 30 }, [{ ...live, held: 40 }, paper], { symbol: "AAPL" });
  assert.deepEqual([mixed[0].qty, mixed[1].qty], [30, null]);
  assert.match(mixed[1].skip!, /holds no AAPL to sell/);
  // Buying back a short: the same, on the short side.
  const cover = splitTotal({ side: "buy", qty: 20 }, [{ ...live, held: -5 }, { ...paper, held: -40 }]);
  assert.deepEqual(cover.map((r) => [r.qty, r.all]), [[5, true], [8, false]]);
});

test("split: part shares, coins and dollars", () => {
  const p = splitTotal({ side: "buy", qty: 2.5 }, [live, paper]);
  assert.ok(Math.abs(sumOf(p) - 2.5) < 1e-9);
  assert.ok(!Number.isInteger(p[0].qty!));
  const asked = splitTotal({ side: "buy", qty: 10 }, [live, paper], { parts: true });
  assert.ok(Math.abs(sumOf(asked) - 10) < 1e-9);
  assert.ok(Math.abs(asked[0].qty! - 10 * 160240 / 258350) < 1e-8);
  const coin = splitTotal({ side: "buy", qty: 0.3 }, [live, paper], { crypto: true });
  assert.ok(Math.abs(sumOf(coin) - 0.3) < 1e-9);
  const usd = splitTotal({ side: "buy", notional: 1000 }, [live, paper]);
  assert.deepEqual(usd.map((r) => [r.notional, r.qty]), [[620.24, null], [379.76, null]]); // 620.244 and 379.756: the cent left over to the larger remainder
  assert.equal(Math.round(sumOf(usd) * 100), 100000);
  const small = splitTotal({ side: "buy", notional: 2 }, [live, { ...paper, equity: 500 }]);
  assert.match(small[1].skip!, /less than \$1/);
});

test("split: nothing to share, or no portfolio value read", () => {
  assert.match(splitTotal({ side: "buy", qty: 0 }, [live])[0].skip!, /no quantity/);
  const rows = splitTotal({ side: "buy", qty: 10 }, [live, { ...paper, equity: null }]);
  assert.deepEqual(rows.map((r) => r.qty), [10, null]);
  assert.match(rows[1].skip!, /no portfolio value/);
});

test("explicit sizes go out as asked: no billionth lost, no cent lost (18 Nov review)", () => {
  // 16 shares with part shares on was 15.999999999; $1.14 was $1.13.
  for (const v of [16, 3, 7, 115, 199]) {
    const [r] = allocate({ side: "buy", qty: 1 }, lead, [{ ...half, rule: { mode: "shares", value: v } }], { parts: true });
    assert.equal(r.qty, v, `shares ${v}`);
  }
  const [d] = allocate({ side: "buy", notional: 10 }, lead, [{ ...half, rule: { mode: "dollars", value: 1.14 } }]);
  assert.equal(d.notional, 1.14);
  // A fractional holding sold whole stays whole (exact, not a billionth short).
  const [all] = allocate({ side: "sell", qty: 1 }, { ...lead, held: 5 }, [{ ...half, held: 0.111111111, rule: { mode: "shares", value: 0.111111111 } }], { parts: true });
  assert.deepEqual([all.qty, all.all], [0.111111111, true]);
});

test("whole holdings: Close, Stop and Max close each account's own holding (18 Nov review)", () => {
  const rows = wholeHoldings("sell", [{ ...live, held: 100 }, { ...paper, held: 60 }, { ...paper, id: "Q", held: 0 }], { symbol: "AAPL" });
  assert.deepEqual(rows.map((r) => [r.qty, r.all]), [[100, true], [60, true], [null, false]]);
  assert.match(rows[2].skip!, /holds no AAPL to sell/);
  const cover = wholeHoldings("buy", [{ ...live, held: -40 }, { ...paper, held: 10 }]);
  assert.deepEqual(cover.map((r) => r.qty), [40, null]);
});

test("split: a sale of what is held is never sized in dollars", () => {
  const rows = splitTotal({ side: "sell", notional: 1000 }, [{ ...live, held: 100 }, { ...paper, held: 10 }]);
  assert.ok(rows.every((r) => r.notional === null && /in shares/.test(r.skip!)));
});

test("a percent key on the other accounts: to the nearest whole share (18 Nov, TQQQ 60 and 2)", () => {
  // 2.5% of each account's own value at 52.14: 60.79 and 2.88, now 61 and 3.
  const alton = { id: "A", name: "Alton Live", equity: 126780.6, buyingPower: 470431.5, held: 0 };
  const small = { id: "S", name: "Alpaca Live", equity: 5998.9, buyingPower: 23682.01, held: 0 };
  const [a, s] = allocate({ side: "buy", qty: 61 }, small, [alton, small], { pct: 2.5, price: 52.14, symbol: "TQQQ" });
  assert.deepEqual([a.qty, s.qty], [61, 3]);
  // Past its buying power: rounded down instead.
  const [poor] = allocate({ side: "buy", qty: 3 }, small, [{ ...small, buyingPower: 150 }], { pct: 2.5, price: 52.14 });
  assert.equal(poor.qty, 2);
  // A sale of what is held: the nearest share, never more than held.
  const [held] = allocate({ side: "sell", qty: 3 }, { ...small, held: 3 }, [{ ...small, held: 2 }], { pct: 2.5, price: 52.14 });
  assert.deepEqual([held.qty, held.all], [2, true]);
  // An account's own percent rule rounds the same way; its own dollars stay a ceiling.
  const [own] = allocate({ side: "buy", qty: 1 }, small, [{ ...small, rule: { mode: "percent", value: 2.5 } }], { price: 52.14 });
  assert.equal(own.qty, 3);
  const [usd] = allocate({ side: "buy", qty: 1 }, small, [{ ...small, rule: { mode: "dollars", value: 149.97 } }], { price: 52.14 });
  assert.equal(usd.qty, 2);
  // Under half a share: too small, as before.
  const [tiny] = allocate({ side: "buy", qty: 1 }, small, [{ ...small, equity: 1000 }], { pct: 2.5, price: 52.14 });
  assert.match(tiny.skip!, /less than one share/);
});

test("a percent buy under one share of a part-share stock on the other accounts: the part share (18 Nov review)", () => {
  const small = { id: "S", name: "Alpaca Live", equity: 5998.9, buyingPower: 23682.01, held: 0 };
  const lead = { id: "L", name: "Alton Live", equity: 126780.6, buyingPower: 470431.5, held: 0 };
  for (const pct of [4, 5.01, 7.5]) {
    const [s] = allocate({ side: "buy", qty: 10 }, lead, [small], { pct, price: 600, fractionable: true, symbol: "QQQ" });
    assert.ok(s.qty! < 1 && Math.abs(s.qty! * 600 - 5998.9 * pct / 100) < 0.01, `${pct}%: ${s.qty}`);
  }
  // Its own percent rule likewise; a whole share or more still to the nearest.
  const [own] = allocate({ side: "buy", qty: 10 }, lead, [{ ...small, rule: { mode: "percent", value: 7.5 } }], { price: 600, fractionable: true });
  assert.ok(own.qty! < 1);
  const [one] = allocate({ side: "buy", qty: 10 }, lead, [small], { pct: 15, price: 600, fractionable: true });
  assert.equal(one.qty, 1);
  // Not a part-share stock: the nearest whole share.
  const [whole] = allocate({ side: "buy", qty: 10 }, lead, [small], { pct: 7.5, price: 600 });
  assert.equal(whole.qty, 1);
});

test("Part shares switched on: the other accounts take their exact part share; a short one whole shares (18 Nov)", () => {
  const lead = { id: "L", name: "Alton Live", equity: 126780.6, buyingPower: 470431.5, held: 0 };
  const small = { id: "S", name: "Alpaca Live", equity: 5998.9, buyingPower: 23682.01, held: 0 };
  const [s] = allocate({ side: "buy", qty: 60.788 }, lead, [small], { pct: 2.5, price: 52.14, fractionable: true, parts: true });
  assert.ok(Math.abs(s.qty! - 5998.9 * 0.025 / 52.14) < 1e-8, String(s.qty));
  // Short the stock: part shares cannot be held short, so whole shares, never past the short.
  const [short] = allocate({ side: "buy", qty: 60.788 }, lead, [{ ...small, held: -2 }], { pct: 2.5, price: 52.14, fractionable: true, parts: true });
  assert.deepEqual([short.qty, short.all], [2, true]);
  const [usd] = allocate({ side: "buy", qty: 60.788 }, lead, [{ ...small, held: -10, rule: { mode: "dollars", value: 150 } }], { price: 52.14, fractionable: true, parts: true });
  assert.equal(usd.qty, 2);
});

test("part shares: never under $1 on another account; a short account's part shown whole (18 Nov review)", () => {
  const lead = { id: "L", name: "Lead", equity: 126780.6, buyingPower: 470431.5, held: 0 };
  // 0.05% of $1,411.53 at 52.14 is $0.71: skipped, as the screen's own account refuses it.
  const [tiny] = allocate({ side: "buy", qty: 1.2 }, lead, [{ id: "P", name: "Paper", equity: 1411.53, buyingPower: 1408.25, held: 0 }], { pct: 0.05, price: 52.14, fractionable: true, parts: true });
  assert.equal(tiny.qty, null);
  assert.ok(tiny.skip);
  // The ticket's split in part shares: a short account's buy back is whole shares in the review itself.
  const rows = splitTotal({ side: "buy", qty: 3.1 }, [{ ...lead, held: -10 }, { id: "S", name: "Short", equity: 98110, buyingPower: 1, held: -40 }]);
  assert.ok(rows.every((r) => r.qty === null || Number.isInteger(r.qty)), JSON.stringify(rows.map((r) => r.qty)));
  // A short sale in part shares likewise; a long holder's sale stays exact.
  const sale = splitTotal({ side: "sell", qty: 3.1 }, [{ ...lead, held: 0 }, { id: "S", name: "Flat", equity: 98110, buyingPower: 1, held: 0 }]);
  assert.ok(sale.every((r) => r.qty === null || Number.isInteger(r.qty)));
  const longSale = splitTotal({ side: "sell", qty: 3.1 }, [{ ...lead, held: 50 }]);
  assert.equal(longSale[0].qty, 3.1);
});

test("split with Part shares on: each account's exact part share by value, never under $1 (19 Nov)", () => {
  const alton = { id: "A", name: "Alton Live", equity: 126780.6, buyingPower: 470431.5, held: 0 };
  const small = { id: "S", name: "Alpaca Live", equity: 5998.9, buyingPower: 23682.01, held: 0 };
  const rows = splitTotal({ side: "buy", qty: 50 }, [alton, small], { parts: true, price: 52.14 });
  assert.ok(Math.abs(rows[0].qty! - 50 * 126780.6 / 132779.5) < 1e-8, String(rows[0].qty));
  assert.ok(Math.abs(rows[1].qty! - 50 * 5998.9 / 132779.5) < 1e-8, String(rows[1].qty));
  assert.ok(Math.abs(rows[0].qty! + rows[1].qty! - 50) < 1e-9);
  // Switched off: whole shares, as before (47.74 and 2.26: 48 and 2).
  assert.deepEqual(splitTotal({ side: "buy", qty: 50 }, [alton, small], { price: 52.14 }).map((r) => r.qty), [48, 2]);
  // A part under $1: skipped with the reason.
  const tiny = splitTotal({ side: "buy", qty: 1 }, [alton, { ...small, equity: 50 }], { parts: true, price: 52.14 });
  assert.match(tiny[1].skip!, /under Alpaca's \$1 smallest part share/);
  // A short sale with Part shares on: whole shares on each account.
  const shortSale = splitTotal({ side: "sell", qty: 50 }, [alton, small], { parts: true, price: 52.14 });
  assert.ok(shortSale.every((r) => r.qty === null || Number.isInteger(r.qty)));
  // A long holder's sale in part shares stays exact; its whole holding is sent as all of it.
  const sale = splitTotal({ side: "sell", qty: 10 }, [{ ...alton, held: 100 }, { ...small, held: 0.4 }], { parts: true, price: 52.14 });
  assert.ok(!Number.isInteger(sale[0].qty!));
  assert.deepEqual([sale[1].qty, sale[1].all], [0.4, true]);
});

test("split with Part shares on: a short sale or buy back still meets the total in whole shares (19 Nov review)", () => {
  const alton = { id: "A", name: "Alton Live", equity: 126780.6, buyingPower: 470431.5, held: 0 };
  const small = { id: "S", name: "Alpaca Live", equity: 5998.9, buyingPower: 23682.01, held: 0 };
  const sale = splitTotal({ side: "sell", qty: 50 }, [alton, small], { parts: true, price: 52.14 });
  assert.deepEqual(sale.map((r) => r.qty), [48, 2]);
  const cover = splitTotal({ side: "buy", qty: 50 }, [{ ...alton, held: -100 }, { ...small, held: -10 }], { parts: true, price: 52.14 });
  assert.deepEqual(cover.map((r) => r.qty), [48, 2]);
  // A total typed in part shares: its whole shares, never more.
  const typed = splitTotal({ side: "sell", qty: 49.5 }, [alton, small], { price: 52.14 });
  assert.equal(typed.reduce((s, r) => s + (r.qty || 0), 0), 49);
});

// 19 Nov, the owner: "add in the ticker percentage of the equity account in
// addition to the number of shares and Dollar, and when writing a percentage,
// it should go pro rata". The ticket's % (functions/terminal allocation,
// split "percent"): every account it goes to, the one on screen among them,
// its own percent of its own equity, as a % hotkey sizes it.
test("the ticket's percent of equity: each account its own, nearest share; sales capped; part shares on buys", () => {
  const alton = { id: "A", name: "Alton", equity: 126780.6, buyingPower: 470431.5, held: 0 };
  const small = { id: "B", name: "Alpaca", equity: 5998.9, buyingPower: 23682.01, held: 0 };
  const opts = { pct: 5, price: 117.4, symbol: "XYZ" };
  const qtys = (rows: any[]) => rows.map((r) => r.qty);
  // 5% at 117.40: 53.995 and 2.555, to the nearest share.
  assert.deepEqual(qtys(percentSplit("buy", [alton, small], opts)), [54, 3]);
  // Never past buying power on a buy: down instead.
  assert.deepEqual(qtys(percentSplit("buy", [alton, { ...small, buyingPower: 300 }], opts)), [54, 2]);
  // Part shares asked for: the exact part shares on a buy...
  assert.deepEqual(qtys(percentSplit("buy", [alton, small], { ...opts, fractionable: true, parts: true })), [53.995144804, 2.554897785]);
  // ...but whole shares on a sale, held or not (review S1, S3).
  assert.deepEqual(qtys(percentSplit("sell", [{ ...alton, held: 100 }, { ...small, held: 10 }], { ...opts, fractionable: true, parts: true })), [54, 3]);
  assert.deepEqual(qtys(percentSplit("sell", [alton, small], { ...opts, fractionable: true, parts: true })), [54, 3]);
  // A sale when one account holds: at most its holding; the other, holding none, sends nothing.
  const sale = percentSplit("sell", [{ ...alton, held: 30 }, small], opts);
  assert.deepEqual(sale.map((r) => [r.qty, r.all]), [[30, true], [null, false]]);
  assert.match(sale[1].skip!, /holds no XYZ/);
  // Nobody holds: each sells (short) its own percent.
  assert.deepEqual(qtys(percentSplit("sell", [alton, small], opts)), [54, 3]);
  // A buy with one account short (review W2): it covers at most its short; the other buys its percent.
  const cover = percentSplit("buy", [alton, { ...small, held: -10 }], opts);
  assert.deepEqual(cover.map((r) => [r.qty, r.all]), [[54, false], [3, false]]);
  assert.deepEqual(qtys(percentSplit("buy", [alton, { ...small, held: -2 }], opts)), [54, 2]);
  // Coins are never sold short (review W4).
  const coins = percentSplit("sell", [{ ...alton, held: 0.5 }, small], { pct: 1, price: 90000, crypto: true, symbol: "BTC/USD" });
  assert.equal(coins[0].qty, 0.014086733);
  assert.match(coins[1].skip!, /holds no BTC\/USD|cannot be sold short/);
  const none = percentSplit("sell", [alton, small], { pct: 1, price: 90000, crypto: true, symbol: "BTC/USD" });
  assert.deepEqual(none.map((r) => r.skip), ["coins cannot be sold short", "coins cannot be sold short"]);
});
