// Fixtures are the real positions that exposed the defects, not invented ones.
// The 26 Aug expiry is the useful case because its correct answer is known
// independently from the broker's own activity list.
//
//   node --experimental-strip-types --test supabase/functions/_shared/tradeReconstruction.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { reconstruct, buildStockLedger, mergeShareMoves, stockFillMoves } from "./tradeReconstruction.ts";

const ACCOUNT = "acct-1";

let seq = 0;
const fill = (date, side, symbol, qty, price, orderId = null) => ({
  id: `f${seq++}`,
  activity_type: "FILL",
  transaction_time: `${date}T14:31:0${seq % 10}Z`,
  side,
  symbol,
  qty: String(qty),
  price: String(price),
  order_id: orderId
});
const expire = (date, symbol, qty) => ({
  id: `e${seq++}`,
  activity_type: "OPEXP",
  date,
  symbol,
  qty: String(qty),
  price: "0"
});
const assign = (date, symbol, qty) => ({
  id: `a${seq++}`,
  activity_type: "OPASN",
  date,
  symbol,
  qty: String(qty),
  price: "0"
});
const exercise = (date, symbol, qty) => ({
  id: `x${seq++}`,
  activity_type: "OPEXC",
  date,
  symbol,
  qty: String(qty),
  price: "0"
});

const run = (activities, orderStrategy = {}) => reconstruct(activities, orderStrategy, ACCOUNT);
const find = (records, short, long = "") =>
  records.find((r) => r.short_symbol === short && r.long_symbol === long);
const money = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// The defect that produced no record at all
// ---------------------------------------------------------------------------

test("an assigned call spread produces a record, and its shares net the width", () => {
  const activities = [
    fill("2026-08-19", "sell", "AMD260826C00470000", 1, 1.2),
    fill("2026-08-19", "buy", "AMD260826C00472500", 1, 0.7),
    assign("2026-08-26", "AMD260826C00470000", 1),
    exercise("2026-08-26", "AMD260826C00472500", 1)
  ];

  const { records, stockLots } = run(activities);

  const spread = find(records, "AMD260826C00470000", "AMD260826C00472500");
  assert.ok(spread, "the assigned spread must exist — previously there was no record at all");
  assert.equal(spread.close_reason, "assigned");
  assert.equal(spread.unpaired, false);
  // Premium is kept in full — assignment costs nothing on the option itself —
  // and the shares it delivered are what the position actually lost.
  assert.equal(money(spread.premium_pl), 50);
  assert.equal(money(spread.early_close_pl), 0);
  assert.equal(money(spread.stock_pl), -250);
  // $2.50 width less $0.50 credit: the most this spread could ever lose. The
  // old single figure said +50 — a full win — while the loss sat in a table
  // nobody was adding up.
  assert.equal(money(spread.realized_pl), -200);

  // Called away at 470 against shares bought at 472.50 on exercise: exactly the
  // $2.50 width, which is what the position risked.
  const amd = stockLots.filter((l) => l.ticker === "AMD");
  assert.equal(amd.length, 1);
  assert.equal(amd[0].qty, 100);
  assert.equal(money(amd[0].realized_pl), -250);
  assert.equal(amd[0].acquired_source, "exercise");
  assert.equal(amd[0].disposed_source, "assignment");

  // Option and shares are linked, and the link is the same on both sides.
  assert.equal(spread.chain_id, "AMD260826C00470000@2026-08-26");
  assert.equal(amd[0].chain_id, spread.chain_id);
});

// ---------------------------------------------------------------------------
// The defect that invented spreads and orphaned real ones
// ---------------------------------------------------------------------------

test("shorts pair to the nearest protective long, not the first one found", () => {
  const activities = [
    fill("2026-08-19", "sell", "TSLA260826C00362500", 1, 1.4),
    fill("2026-08-19", "buy", "TSLA260826C00365000", 1, 1.15),
    fill("2026-08-19", "sell", "TSLA260826C00367500", 1, 0.95),
    fill("2026-08-19", "buy", "TSLA260826C00370000", 1, 0.8),
    expire("2026-08-26", "TSLA260826C00362500", 1),
    expire("2026-08-26", "TSLA260826C00365000", -1),
    expire("2026-08-26", "TSLA260826C00367500", 1),
    expire("2026-08-26", "TSLA260826C00370000", -1)
  ];

  const { records } = run(activities);

  // Two 2.50-wide spreads. Taking the first match gave the 362.50 short the
  // 370 long — a 7.50-wide spread that was never traded.
  const near = find(records, "TSLA260826C00362500", "TSLA260826C00365000");
  const far = find(records, "TSLA260826C00367500", "TSLA260826C00370000");
  assert.ok(near && far);
  assert.equal(money(near.realized_pl), 25);
  assert.equal(money(far.realized_pl), 15);

  // The 367.50 short was previously orphaned and booked as a naked "wheel"
  // call, and the 365 long's cost vanished.
  assert.equal(records.filter((r) => r.strategy === "wheel").length, 0);
  assert.equal(records.filter((r) => r.unpaired).length, 0);
  assert.equal(records.length, 2);
});

// ---------------------------------------------------------------------------
// Wheel versus a broken pair
// ---------------------------------------------------------------------------

test("an orphaned short call with no shares behind it is flagged, not called a wheel", () => {
  const activities = [
    fill("2026-08-14", "sell", "KO260821C00090000", 1, 0.55),
    fill("2026-08-14", "sell", "KO260821C00090000", 1, 0.5),
    fill("2026-08-14", "buy", "KO260821C00092000", 1, 0.2),
    fill("2026-08-21", "buy", "KO260821C00090000", 2, 0.75),
    fill("2026-08-21", "sell", "KO260821C00092000", 1, 0.05)
  ];

  const { records } = run(activities);

  const orphan = find(records, "KO260821C00090000", "");
  assert.ok(orphan, "the unpaired short must be written down, not dropped");
  assert.equal(orphan.strategy, "spreads");
  assert.equal(orphan.unpaired, true, "a naked call here was the reconstruction being wrong");
  assert.equal(records.filter((r) => r.strategy === "wheel").length, 0);

  const paired = find(records, "KO260821C00090000", "KO260821C00092000");
  assert.ok(paired);
  assert.equal(paired.unpaired, false);
});

test("an orphaned short call is a covered call when the shares are actually held", () => {
  const activities = [
    fill("2026-08-03", "buy", "KO", 100, 88.0),
    fill("2026-08-14", "sell", "KO260821C00090000", 1, 0.55),
    expire("2026-08-21", "KO260821C00090000", 1)
  ];

  const { records } = run(activities);
  const call = find(records, "KO260821C00090000", "");
  assert.equal(call.strategy, "covered_call");
  assert.equal(call.unpaired, false);
  assert.equal(money(call.realized_pl), 55);
});

test("an orphaned short put is a cash-secured put — the fallback was right for those", () => {
  const activities = [
    fill("2026-08-11", "sell", "NVDA260821P00150000", 1, 2.0),
    expire("2026-08-21", "NVDA260821P00150000", 1)
  ];

  const { records } = run(activities);
  assert.equal(records.length, 1);
  assert.equal(records[0].strategy, "cash_secured_put");
  assert.equal(records[0].unpaired, false);
  assert.equal(money(records[0].realized_pl), 200);
});

// ---------------------------------------------------------------------------
// The defect that dropped a long leg's cost
// ---------------------------------------------------------------------------

test("a long with no short to protect is surfaced with its cost intact", () => {
  const activities = [
    fill("2026-08-19", "buy", "GOOGL260826C00360000", 1, 0.9),
    fill("2026-08-26", "sell", "GOOGL260826C00360000", 1, 0.1)
  ];

  const { records } = run(activities);
  assert.equal(records.length, 1);
  assert.equal(records[0].unpaired, true);
  assert.equal(records[0].short_symbol, "");
  assert.equal(records[0].long_symbol, "GOOGL260826C00360000");
  // Bought at 0.90, sold at 0.10 — an $80 cost that previously disappeared.
  assert.equal(money(records[0].realized_pl), -80);
});

// ---------------------------------------------------------------------------
// Assignment into shares, and what happens to them afterwards
// ---------------------------------------------------------------------------

test("a put assigned into shares sold later books premium and stock separately", () => {
  const activities = [
    fill("2026-08-14", "sell", "KO260821P00090000", 1, 1.0),
    assign("2026-08-21", "KO260821P00090000", 1),
    fill("2026-08-24", "sell", "KO", 100, 91.2)
  ];

  const { records, stockLots } = run(activities);

  const put = find(records, "KO260821P00090000", "");
  assert.equal(put.strategy, "cash_secured_put");
  assert.equal(put.close_reason, "assigned");
  assert.equal(money(put.premium_pl), 100, "the premium is kept in full");
  // Assigned at 90, sold on the market at 91.20. No call sold them, so they
  // belong to the put that took delivery.
  assert.equal(money(put.stock_pl), 120);
  assert.equal(money(put.realized_pl), 220);

  const lot = stockLots.find((l) => l.ticker === "KO");
  assert.equal(lot.acquired_price, 90);
  assert.equal(lot.acquired_source, "assignment");
  assert.equal(lot.disposed_date, "2026-08-24");
  assert.equal(money(lot.realized_pl), 120);

  // Linked, so the whole cycle reads as one campaign rather than two unrelated
  // rows, but the two figures stay separately visible.
  assert.equal(lot.chain_id, put.chain_id);
});

test("shares still held are not booked as realized profit", () => {
  const activities = [
    fill("2026-08-14", "sell", "KO260821P00090000", 1, 1.0),
    assign("2026-08-21", "KO260821P00090000", 1)
  ];

  const { stockLots } = run(activities);
  assert.equal(stockLots.length, 1);
  assert.equal(stockLots[0].qty, 100);
  assert.equal(stockLots[0].disposed_date, null);
  assert.equal(stockLots[0].realized_pl, null, "an open position is not a result");
});

test("a partial disposal splits the lot so each sale carries its own basis", () => {
  const activities = [
    fill("2026-08-03", "buy", "KO", 100, 88.0),
    fill("2026-08-10", "sell", "KO", 40, 90.0),
    fill("2026-08-12", "sell", "KO", 25, 89.0)
  ];

  const { stockLots } = run(activities);
  const closed = stockLots.filter((l) => l.disposed_date);
  assert.equal(closed.length, 2);
  assert.equal(money(closed[0].realized_pl), 80);
  assert.equal(money(closed[1].realized_pl), 25);

  const open = stockLots.filter((l) => !l.disposed_date);
  assert.equal(open.length, 1);
  assert.equal(open[0].qty, 35);
  assert.equal(open[0].realized_pl, null);
});

test("a sale with no visible purchase records an unknown basis rather than inventing one", () => {
  const { lots } = buildStockLedger(
    mergeShareMoves([], stockFillMoves([fill("2026-08-24", "sell", "KO", 100, 91.2)]))
  );
  assert.equal(lots.length, 1);
  assert.equal(lots[0].acquired_date, null);
  assert.equal(lots[0].realized_pl, null);
});

// ---------------------------------------------------------------------------
// What was already right must stay right
// ---------------------------------------------------------------------------

test("an ordinary spread expiring worthless is unchanged", () => {
  const activities = [
    fill("2026-08-19", "sell", "AMD260826P00437500", 1, 0.62),
    fill("2026-08-19", "buy", "AMD260826P00435000", 1, 0.19),
    expire("2026-08-26", "AMD260826P00437500", 1),
    expire("2026-08-26", "AMD260826P00435000", -1)
  ];

  const { records, stockLots } = run(activities);
  assert.equal(records.length, 1);
  assert.equal(records[0].close_reason, "expired");
  assert.equal(records[0].strategy, "spreads");
  assert.equal(records[0].unpaired, false);
  assert.equal(money(records[0].realized_pl), 43);
  assert.equal(stockLots.length, 0, "an expiry moves no shares");
});

test("the seven correctly-recorded 26 Aug spreads still total $229", () => {
  const legs = [
    ["AMD260826P00437500", "AMD260826P00435000", 0.62, 0.19],
    ["AMD260826P00457500", "AMD260826P00455000", 0.55, 0.23],
    ["AMZN260826P00255000", "AMZN260826P00252500", 0.48, 0.18],
    ["AMZN260826C00267500", "AMZN260826C00270000", 0.5, 0.19],
    ["GOOGL260826P00340000", "GOOGL260826P00337500", 0.46, 0.17],
    ["GOOGL260826C00355000", "GOOGL260826C00357500", 0.5, 0.19],
    ["TSLA260826P00345000", "TSLA260826P00342500", 0.58, 0.25]
  ];
  const activities = legs.flatMap(([s, l, sp, lp]) => [
    fill("2026-08-19", "sell", s, 1, sp),
    fill("2026-08-19", "buy", l, 1, lp),
    expire("2026-08-26", s, 1),
    expire("2026-08-26", l, -1)
  ]);

  const { records } = run(activities);
  assert.equal(records.length, 7);
  assert.equal(records.every((r) => r.strategy === "spreads" && !r.unpaired), true);
  assert.equal(money(records.reduce((n, r) => n + r.realized_pl, 0)), 229);
});

// ---------------------------------------------------------------------------
// Details that would quietly corrupt the ledger
// ---------------------------------------------------------------------------

test("a broker-reported stock fill for a delivery is not counted twice", () => {
  const activities = [
    fill("2026-08-14", "sell", "KO260821P00090000", 1, 1.0),
    assign("2026-08-21", "KO260821P00090000", 1),
    // The same delivery, echoed on the stock side at the strike.
    fill("2026-08-21", "buy", "KO", 100, 90.0)
  ];

  const { stockLots } = run(activities);
  assert.equal(stockLots.length, 1);
  assert.equal(stockLots[0].qty, 100, "200 shares here would mean the delivery was counted twice");
  assert.equal(stockLots[0].acquired_source, "assignment", "the option-derived move keeps the chain link");
});

test("a partial assignment closes only the contracts assigned", () => {
  const activities = [
    fill("2026-08-14", "sell", "KO260821P00090000", 3, 1.0),
    assign("2026-08-21", "KO260821P00090000", 1),
    expire("2026-08-21", "KO260821P00090000", 2)
  ];

  const { records, stockLots } = run(activities);
  const assigned = records.find((r) => r.close_reason === "assigned");
  const expired = records.find((r) => r.close_reason === "expired");
  assert.equal(assigned.qty, 1);
  assert.equal(expired.qty, 2);
  assert.equal(stockLots[0].qty, 100, "only the assigned contract delivers shares");
});

test("an explicit strategy prefix wins over shape", () => {
  const activities = [
    fill("2026-08-11", "sell", "NVDA260821P00150000", 1, 2.0, "order-1"),
    expire("2026-08-21", "NVDA260821P00150000", 1)
  ];

  const { records } = run(activities, { "order-1": "spreads" });
  assert.equal(records[0].strategy, "spreads");
  assert.equal(records[0].unpaired, true, "a spread order with one leg is a broken pair, not a wheel");
});

// ---------------------------------------------------------------------------
// The three parts a result is made of, and who owns the shares
// ---------------------------------------------------------------------------

test("a spread closed early splits into premium and the cost of closing it", () => {
  const activities = [
    fill("2026-08-25", "sell", "JPM260826P00355000", 1, 1.05),
    fill("2026-08-25", "buy", "JPM260826P00352500", 1, 0.32),
    fill("2026-08-26", "buy", "JPM260826P00355000", 1, 0.44),
    fill("2026-08-26", "sell", "JPM260826P00352500", 1, 0.14)
  ];

  const { records } = run(activities);
  const spread = find(records, "JPM260826P00355000", "JPM260826P00352500");

  // Sold for 0.73, bought back for 0.30.
  assert.equal(money(spread.premium_pl), 73);
  assert.equal(money(spread.early_close_pl), -30);
  assert.equal(money(spread.stock_pl), 0);
  assert.equal(money(spread.realized_pl), 43);
  // The whole point: the parts add up to the total, on every row.
  assert.equal(
    money(spread.premium_pl + spread.early_close_pl + spread.stock_pl),
    money(spread.realized_pl)
  );
});

test("a full wheel cycle credits the shares to the call that sold them", () => {
  const activities = [
    // Put sold, assigned: 100 shares arrive at 90.
    fill("2026-08-07", "sell", "KO260814P00090000", 1, 1.1),
    assign("2026-08-14", "KO260814P00090000", 1),
    // Call sold against them, assigned: the shares leave at 92.
    fill("2026-08-17", "sell", "KO260821C00092000", 1, 0.6),
    assign("2026-08-21", "KO260821C00092000", 1)
  ];

  const { records, stockLots, unattributedStockPL } = run(activities);

  const put = find(records, "KO260814P00090000", "");
  const call = find(records, "KO260821C00092000", "");
  assert.equal(put.strategy, "cash_secured_put");
  assert.equal(call.strategy, "covered_call");

  // Each half keeps its own premium.
  assert.equal(money(put.premium_pl), 110);
  assert.equal(money(call.premium_pl), 60);

  // The shares moved 90 -> 92. That $200 belongs to the call that sold them,
  // and to nothing else: crediting the put instead would rewrite a position
  // that closed a week earlier.
  assert.equal(money(call.stock_pl), 200);
  assert.equal(money(put.stock_pl), 0);
  assert.equal(money(call.realized_pl), 260);
  assert.equal(money(put.realized_pl), 110);
  assert.equal(unattributedStockPL, 0);

  // The ledger says which option was on each side of the lot.
  const lot = stockLots.find((l) => l.ticker === "KO");
  assert.equal(lot.acquired_chain_id, put.chain_id);
  assert.equal(lot.disposed_chain_id, call.chain_id);

  // And the cycle totals what the account actually made: $170 of premium plus
  // $200 on the stock.
  const total = records.reduce((n, r) => n + r.realized_pl, 0) + unattributedStockPL;
  assert.equal(money(total), 370);
});

test("a covered call over shares bought on the market still owns their result", () => {
  const activities = [
    fill("2026-08-03", "buy", "KO", 100, 88.0),
    fill("2026-08-14", "sell", "KO260821C00090000", 1, 0.55),
    assign("2026-08-21", "KO260821C00090000", 1)
  ];

  const { records, unattributedStockPL } = run(activities);
  const call = find(records, "KO260821C00090000", "");

  assert.equal(call.strategy, "covered_call");
  assert.equal(money(call.premium_pl), 55);
  // Bought at 88, called away at 90.
  assert.equal(money(call.stock_pl), 200);
  assert.equal(money(call.realized_pl), 255);
  assert.equal(unattributedStockPL, 0, "the call disposed of them, so nothing is left over");
});

test("shares traded with no option involved belong to no category", () => {
  const activities = [
    fill("2026-08-03", "buy", "KO", 100, 88.0),
    fill("2026-08-10", "sell", "KO", 100, 91.0)
  ];

  const { records, unattributedStockPL } = run(activities);
  assert.equal(records.length, 0, "there is no option here to attribute anything to");
  // $300, counted in the account total and pushed into nobody's strategy.
  assert.equal(money(unattributedStockPL), 300);
});

test("shares still held contribute nothing to any category", () => {
  const activities = [
    fill("2026-08-07", "sell", "KO260814P00090000", 1, 1.1),
    assign("2026-08-14", "KO260814P00090000", 1)
  ];

  const { records, unattributedStockPL } = run(activities);
  const put = find(records, "KO260814P00090000", "");
  assert.equal(money(put.stock_pl), 0, "an open position is not a result");
  assert.equal(money(put.realized_pl), 110);
  assert.equal(unattributedStockPL, 0);
});
