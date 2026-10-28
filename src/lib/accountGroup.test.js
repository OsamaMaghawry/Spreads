import { test } from "node:test";
import assert from "node:assert/strict";
import { groupChoices, cleanGroup, groupNews, groupPayload, cleanSizes } from "./accountGroup.js";

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

test("each account's own size goes with it; pro rata where none is set", () => {
  assert.deepEqual(groupPayload(["a", "b", "c"], { b: { mode: "percent", value: "5" }, c: { mode: "prorata", value: "9" } }), [
    { id: "a", mode: "prorata" }, { id: "b", mode: "percent", value: 5 }, { id: "c", mode: "prorata" }
  ]);
  assert.deepEqual(groupPayload(["a"], { a: { mode: "shares", value: "" } }), [{ id: "a", mode: "shares", value: null }]);
});

test("sizes kept with the account: known modes only, values as typed", () => {
  assert.deepEqual(cleanSizes({
    "178e2bf2-ed6d": { mode: "percent", value: "5" },
    a: { mode: "shares", value: 20 },
    b: { mode: "prorata", value: "9" },
    c: { mode: "everything", value: "1" },
    "bad id!": { mode: "shares", value: "1" },
    d: null
  }), { "178e2bf2-ed6d": { mode: "percent", value: "5" }, a: { mode: "shares", value: "20" }, b: { mode: "prorata" } });
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
