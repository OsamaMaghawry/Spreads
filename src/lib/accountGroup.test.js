import { test } from "node:test";
import assert from "node:assert/strict";
import { groupChoices, cleanGroup, groupNews } from "./accountGroup.js";

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
