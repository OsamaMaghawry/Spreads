import { test } from "node:test";
import assert from "node:assert/strict";
import { groupChoices, cleanGroup, groupNews, groupPayload, cleanSizes, sameOrders, exitsOf, resolveSize, sendPlan, cleanTicks } from "./accountGroup.js";

const accounts = [
  { id: "p1", name: "Paper one", type: "Paper" },
  { id: "l1", name: "Alton Live", type: "Live" },
  { id: "p2", name: "Paper two", type: "Paper" },
  { id: "s1", name: "Robinhood", type: "Live", readOnly: true }
];

test("the accounts that can join: paper always, live only where live trading is on, never the lead or a read-only one", () => {
  assert.deepEqual(groupChoices(accounts, "p1", false).map((a) => a.id), ["p2"]);
  assert.deepEqual(groupChoices(accounts, "p1", true).map((a) => a.id), ["l1", "p2"]);
  // The lead is never in its own group; a stale or foreign id drops out.
  assert.deepEqual(cleanGroup(["p1", "p2", "gone", "s1"], accounts, "p1", true), ["p2"]);
  assert.deepEqual(cleanGroup(["l1"], accounts, "p1", false), []);
});

test("what the group said, in one pop-up", () => {
  const news = groupNews([
    { name: "Paper two", ok: true, qty: 57, status: "accepted" },
    { name: "Alton Live", live: true, ok: false, error: "Live orders ... limited to $5,000" },
    { name: "Paper three", skip: "holds no AIOK to sell" }
  ], "sent", "shares");
  assert.equal(news.tone, "bad");
  assert.equal(news.title, "Also on 3 accounts: 1 done, 1 refused, 1 skipped");
  assert.match(news.detail, /Paper two: 57 shares sent/);
  assert.match(news.detail, /Alton Live \(live\): refused, Live orders/);
  assert.match(news.detail, /Paper three: skipped, holds no AIOK to sell/);
  assert.equal(groupNews([{ name: "A", ok: true, notional: 500 }], "sent").detail, "A: $500.00 sent");
  assert.equal(groupNews([{ name: "A", ok: true, cancelled: 2 }], "cancelled").detail, "A: 2 cancelled");
  assert.equal(groupNews([], "sent"), null);
});

test("each account's own size goes with it; the key's own size where none is set", () => {
  assert.deepEqual(groupPayload(["a", "b", "c"], { b: { mode: "percent", value: "5" }, c: { mode: "prorata", value: "9" } }), [
    { id: "a", mode: "key" }, { id: "b", mode: "percent", value: 5 }, { id: "c", mode: "key" }
  ]);
  assert.deepEqual(groupPayload(["a"], { a: { mode: "shares", value: "" } }), [{ id: "a", mode: "shares", value: null }]);
});

test("same as each key: a $100 key is $100 there, 50 shares 50 shares, a percent its own percent; its own size wins", () => {
  const usd = { size: "usd", amount: 100 };
  assert.deepEqual(resolveSize({ id: "a", mode: "key" }, usd), { id: "a", mode: "dollars", value: 100 });
  assert.deepEqual(resolveSize({ id: "a", mode: "key" }, { size: "shares", amount: 50 }), { id: "a", mode: "shares", value: 50 });
  assert.deepEqual(resolveSize({ id: "a", mode: "key" }, { size: "equity", amount: 1 }), { id: "a", mode: "prorata" });
  assert.deepEqual(resolveSize({ id: "b", mode: "dollars", value: 10 }, usd), { id: "b", mode: "dollars", value: 10 });
  // A size picked but left empty: the key's.
  assert.deepEqual(resolveSize({ id: "b", mode: "dollars", value: null }, usd), { id: "b", mode: "dollars", value: 100 });
});

// 3 Nov, the approved design: one list, a tick for each account orders go to,
// the account on screen chosen apart from the ticks.
test("orders go to the ticked accounts only, the one on screen first when it is ticked", () => {
  const accounts = [
    { id: "alton", name: "Alton Live", type: "Live" },
    { id: "alpaca", name: "Alpaca Live", type: "Live" },
    { id: "rs", name: "Alton RS", type: "Paper" },
    { id: "wheel", name: "Wheel", type: "Paper" }
  ];
  const sizes = { alpaca: { mode: "dollars", value: "10" }, alton: { mode: "key" } };
  const both = sendPlan({ ticks: ["alton", "alpaca"], shownId: "alton", accounts, liveOk: true, sizes });
  assert.deepEqual([both.none, both.leadOff, both.leadSize], [false, false, { mode: "key" }]);
  assert.deepEqual(both.group, [{ id: "alpaca", mode: "dollars", value: 10 }]);
  // On screen but not ticked: nothing goes to it; every ticked one goes as one of the group.
  const notShown = sendPlan({ ticks: ["alton", "alpaca"], shownId: "wheel", accounts, liveOk: true, sizes });
  assert.deepEqual([notShown.leadOff, notShown.leadSize, notShown.group.map((g) => g.id)], [true, null, ["alton", "alpaca"]]);
  // Live accounts the server does not trade from here are never sent to.
  const paperOnly = sendPlan({ ticks: ["alton", "rs"], shownId: "alton", accounts, liveOk: false, sizes });
  assert.deepEqual([paperOnly.leadOff, paperOnly.group.map((g) => g.id), paperOnly.sending.map((a) => a.id)], [true, ["rs"], ["rs"]]);
  const none = sendPlan({ ticks: [], shownId: "rs", accounts, liveOk: true, sizes });
  assert.deepEqual([none.none, none.leadOff, none.group], [true, false, []]);
  assert.equal(cleanTicks(null), null);
  assert.deepEqual(cleanTicks(["a", "a", 3, "bad id!", "b"]), ["a", "b"]);
});

test("sizes kept with the account: known modes only, values as typed", () => {
  assert.deepEqual(cleanSizes({
    "178e2bf2-ed6d": { mode: "percent", value: "5" },
    a: { mode: "shares", value: 20 },
    b: { mode: "prorata", value: "9" },
    c: { mode: "everything", value: "1" },
    "bad id!": { mode: "shares", value: "1" },
    d: null
  }), { "178e2bf2-ed6d": { mode: "percent", value: "5" }, a: { mode: "shares", value: "20" }, b: { mode: "key" } });
  assert.deepEqual(cleanSizes(null), {});
  assert.deepEqual(cleanSizes([1, 2]), {});
});

test("a sell that replaced the account's earlier one says so", () => {
  assert.equal(groupNews([{ name: "Alton RS", ok: true, qty: 78, replaced: 1 }], "sent", "shares").detail, "Alton RS: 78 shares sent, replacing the earlier sell");
});

// 28 Oct: the other accounts' orders followed to the end, in the one pop-up.
test("the group's orders as they stand: filled, waiting, not filled", () => {
  const rows = [
    { name: "Alton RS", ok: true, qty: 83, track: true, status: "filled", filled: 83, avgPrice: 3.33 },
    { name: "Alpaca Live", live: true, ok: true, qty: 8, track: true, status: "new", filled: 0 },
    { name: "Paper", ok: true, qty: 5, track: true, status: "canceled", filled: 2 }
  ];
  const news = groupNews(rows, "sent", "shares");
  assert.equal(news.tone, "bad");
  assert.equal(news.title, "Also on 3 accounts: 1 filled, 1 waiting, 1 not filled");
  assert.equal(news.detail, "Alton RS: 83 shares filled at 3.33 · Alpaca Live (live): 8 shares sent, waiting to fill · Paper: not filled (canceled), 2 shares filled before");
  const waiting = groupNews([{ ...rows[0] }, { ...rows[1], status: "partially_filled", filled: 3 }], "sent", "shares");
  assert.equal(waiting.tone, "wait");
  assert.match(waiting.detail, /3 shares of 8 shares filled, the rest waiting/);
});

test("the same working order on another account: symbol, side and kind", () => {
  const sell = { id: "a", symbol: "ELPW", side: "sell", type: "limit", orderClass: "simple" };
  const theirs = [
    { id: "1", symbol: "ELPW", side: "sell", type: "limit", orderClass: "simple" },
    { id: "2", symbol: "ELPW", side: "sell", type: "stop", orderClass: "simple" },
    { id: "3", symbol: "ELPW", side: "sell", type: "limit", orderClass: "oco" },
    { id: "4", symbol: "ELPW", side: "buy", type: "limit", orderClass: "simple" },
    { id: "5", symbol: "AIOK", side: "sell", type: "limit", orderClass: "simple" },
    { id: "6", symbol: "ELPW", side: "sell", type: "stop_limit", orderClass: "simple" }
  ];
  assert.deepEqual(sameOrders(sell, theirs).map((o) => o.id), ["1"]);
  assert.deepEqual(sameOrders({ ...sell, type: "stop" }, theirs).map((o) => o.id), ["2", "6"]);
  assert.deepEqual(sameOrders({ ...sell, orderClass: "oco" }, theirs).map((o) => o.id), ["3"]);
  assert.deepEqual(sameOrders(sell, null), []);
});

test("exitsOf: a holding's stop and target at Alpaca, and whether it has no stop", () => {
  const oco = { side: "sell", type: "limit", orderClass: "oco", limit: 30, legs: [{ type: "stop_limit", stop: 26 }] };
  assert.deepEqual(exitsOf(100, [oco]), { held: 100, stop: 26, target: 30, other: 0, bare: false });
  // A short's exits buy; a sell on a short is something else, counted as waiting.
  assert.deepEqual(exitsOf(-22, [{ side: "buy", type: "stop_limit", orderClass: "simple", stop: 228.7, legs: [] }, { side: "sell", type: "limit", tif: "day", limit: 220, legs: [] }]),
    { held: -22, stop: 228.7, target: null, other: 1, bare: false });
  assert.equal(exitsOf(50, [{ side: "sell", type: "limit", tif: "gtc", limit: 12, legs: [] }]).bare, true);
  assert.deepEqual(exitsOf(0, [{ side: "buy", type: "limit", tif: "day", limit: 5, legs: [] }]), { held: 0, stop: null, target: null, other: 1, bare: false });
});

// ---------------------------------------------------------------------------
// 18 Nov: every ticked account's orders in one place, no "Also on" pop-up,
// and a new quantity shared like the old one.
// ---------------------------------------------------------------------------
import { refusalNews, orderBlocks, resplit, stopOf } from "./accountGroup.js";

test("refusal news: only what was not done, never a success", () => {
  assert.equal(refusalNews([{ name: "Paper 2", ok: true, qty: 19, orderId: "x" }]), null);
  assert.equal(refusalNews([]), null);
  // Holding none of it is nothing to do, not a failure.
  assert.equal(refusalNews([{ name: "Paper 2", ok: true, skip: "holds none" }, { name: "B", skip: "holds no AAPL to sell" }]), null);
  const one = refusalNews([{ name: "Alpaca Live", live: true, ok: false, error: "insufficient buying power" }, { name: "Paper 2", ok: true }]);
  assert.equal(one.tone, "bad");
  assert.equal(one.title, "Not done on Alpaca Live (live)");
  assert.equal(one.detail, "Alpaca Live (live): refused, insufficient buying power");
  const two = refusalNews([{ name: "A", ok: false, error: "x" }, { name: "B", skip: "its part comes to less than one share" }, { name: "C", ok: true }]);
  assert.equal(two.title, "Not done on 2 of 3 accounts");
  assert.match(two.detail, /B: not sent, its part comes to less than one share/);
});

test("order blocks: the same order on each account together, newest first", () => {
  const buy = (id, qty, at, extra = {}) => ({ id, symbol: "AAPL", side: "buy", type: "limit", tif: "day", orderClass: "simple", qty, filled: 0, limit: 230, submittedAt: at, ...extra });
  const blocks = orderBlocks([
    { accountId: "L", name: "Alpaca Live", live: true, orders: [buy("1", 31, "2026-11-18T15:00:01Z"), { ...buy("2", 12, "2026-11-18T14:00:00Z"), symbol: "TSLA", side: "sell", type: "stop", limit: null, stop: 380 }] },
    { accountId: "P", name: "Paper 2", orders: [buy("3", 19, "2026-11-18T15:00:02Z", { filled: 4 }), buy("4", 5, "2026-11-18T13:00:00Z", { limit: 229 })] }
  ]);
  assert.deepEqual(blocks.map((b) => [b.symbol, b.limit, b.rows.map((r) => r.order.id)]), [
    ["AAPL", 230, ["1", "3"]], ["TSLA", null, ["2"]], ["AAPL", 229, ["4"]]
  ]);
  assert.deepEqual([blocks[0].qty, blocks[0].filled], [50, 4]);
  assert.equal(blocks[0].rows[0].live, true);
  assert.equal(blocks[1].stop, 380);
  assert.equal(stopOf({ legs: [{ stop: 9 }] }), 9);
  assert.deepEqual(orderBlocks(null), []);
});

test("resplit: a new total in the same proportions, never under what filled", () => {
  const rows = [{ accountId: "L", name: "Alpaca Live", order: { id: "1", qty: 31, filled: 0 } }, { accountId: "P", name: "Paper 2", order: { id: "3", qty: 19, filled: 4 } }];
  const r = resplit(rows, 80);
  assert.deepEqual(r.rows.map((x) => [x.orderId, x.qty]), [["1", 50], ["3", 30]]); // 49.6 and 30.4: the share left over to the larger remainder
  assert.equal(r.rows.reduce((s, x) => s + x.qty, 0), 80);
  const low = resplit(rows, 5);
  assert.match(low.error, /Paper 2 has already filled 4/);
  assert.match(resplit(rows, 0).error, /how many/);
  // Part shares stay part shares.
  const part = resplit([{ accountId: "L", name: "L", order: { id: "1", qty: 1.5, filled: 0 } }, { accountId: "P", name: "P", order: { id: "2", qty: 0.5, filled: 0 } }], 3);
  assert.deepEqual(part.rows.map((x) => x.qty), [2.25, 0.75]);
});
