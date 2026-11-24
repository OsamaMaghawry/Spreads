import test from "node:test";
import assert from "node:assert/strict";
import { buildPhoneOrder, marketableLimit, stepPrice, positionExits, riskReward, phoneSession } from "./phoneOrder.js";

const q = { bid: 12.34, ask: 12.36, last: 12.35 };
const base = { symbol: "XYZ", side: "buy", qty: 100 };

test("a market order in regular hours goes at market", () => {
  const r = buildPhoneOrder({ ...base, type: "market" }, { session: "regular", quote: q });
  assert.equal(r.order.type, "market");
  assert.equal(r.order.extendedHours, false);
  assert.equal(r.notes.length, 0);
});

test("a market order in extended hours goes as a limit 0.5% through the touch", () => {
  const buy = buildPhoneOrder({ ...base, type: "market" }, { session: "extended", quote: q });
  assert.equal(buy.order.type, "limit");
  assert.equal(buy.order.limitPrice, 12.42);
  assert.equal(buy.order.extendedHours, true);
  assert.equal(buy.order.timeInForce, "day");
  const sell = buildPhoneOrder({ ...base, side: "sell", type: "market" }, { session: "extended", quote: q });
  assert.equal(sell.order.limitPrice, 12.28);
});

test("regular hours only, outside the session, says it waits", () => {
  const r = buildPhoneOrder({ ...base, type: "limit", limit: 12.3, ext: false }, { session: "extended", quote: q });
  assert.equal(r.order.extendedHours, false);
  assert.match(r.notes.join(" "), /waits for 9:30/);
});

test("a limit is extended hours by default", () => {
  const r = buildPhoneOrder({ ...base, type: "limit", limit: 12.3 }, { session: "regular", quote: q });
  assert.equal(r.order.extendedHours, true);
  assert.equal(r.order.limitPrice, 12.3);
});

test("stop and target: a bracket when it can be one, else set after the fill", () => {
  const rth = buildPhoneOrder({ ...base, type: "market", sl: 12, tp: 13 }, { session: "regular", quote: q });
  assert.equal(rth.order.stopLoss, 12);
  assert.equal(rth.order.takeProfit, 13);
  assert.equal(rth.later, null);
  const ext = buildPhoneOrder({ ...base, type: "limit", limit: 12.3, sl: 12, tp: 13 }, { session: "extended", quote: q });
  assert.equal(ext.order.stopLoss, undefined);
  assert.deepEqual(ext.later, { stop: 12, target: 13 });
  const one = buildPhoneOrder({ ...base, type: "market", sl: 12 }, { session: "regular", quote: q });
  assert.deepEqual(one.later, { stop: 12, target: null });
});

test("exits on the wrong side of the entry are refused", () => {
  assert.match(buildPhoneOrder({ ...base, type: "limit", limit: 12.3, sl: 12.5 }, { quote: q }).error, /stop must be below/);
  assert.match(buildPhoneOrder({ ...base, side: "sell", type: "limit", limit: 12.3, tp: 12.5 }, { quote: q }).error, /target must be below/);
});

test("whole shares and prices are required", () => {
  assert.ok(buildPhoneOrder({ ...base, qty: 1.5, type: "market" }, { quote: q }).error);
  assert.ok(buildPhoneOrder({ ...base, type: "limit", limit: "" }, { quote: q }).error);
});

test("a stop order never goes for extended hours", () => {
  const r = buildPhoneOrder({ ...base, type: "stop", stop: 12.5 }, { session: "extended", quote: q });
  assert.equal(r.order.extendedHours, false);
  assert.match(r.notes.join(" "), /9:30 to 16:00/);
});

test("price steps and marketable limits", () => {
  assert.equal(stepPrice(12.34, 5), 12.39);
  assert.equal(stepPrice(0.5123, -1), 0.5122);
  assert.equal(stepPrice(0.0002, -5), 0.0002);
  assert.equal(marketableLimit("buy", { ask: 0.5 }), 0.5025);
});

test("a position's exits from its open orders", () => {
  const orders = [
    { symbol: "XYZ", side: "sell", type: "stop", stop: 11.8 },
    { symbol: "XYZ", side: "sell", type: "limit", limit: 13 },
    { symbol: "ABC", side: "sell", type: "stop", stop: 1 }
  ];
  assert.deepEqual(positionExits(orders, "XYZ", false), { stop: 11.8, target: 13 });
  assert.deepEqual(positionExits([{ symbol: "XYZ", side: "buy", type: "limit", orderClass: "oco", limit: 9, legs: [{ stop: 11 }] }], "XYZ", true), { stop: 11, target: 9 });
});

test("risk and reward", () => {
  assert.deepEqual(riskReward({ side: "buy", qty: 100, entry: 12, sl: 11.5, tp: 13 }), { risk: 50, reward: 100, r: 2 });
});

test("sessions", () => {
  // Tue 25 Nov 2025 10:00 and 08:00 New York (UTC-5).
  assert.equal(phoneSession(Date.UTC(2025, 10, 25, 15, 0) / 1000), "regular");
  assert.equal(phoneSession(Date.UTC(2025, 10, 25, 13, 0) / 1000), "extended");
  assert.equal(phoneSession(Date.UTC(2025, 10, 29, 15, 0) / 1000), "closed");
});

test("in regular hours a limit with stop and target is one bracket, not extended", () => {
  const r = buildPhoneOrder({ ...base, type: "limit", limit: 12.3, sl: 12, tp: 13 }, { session: "regular", quote: q });
  assert.equal(r.order.extendedHours, false);
  assert.equal(r.order.stopLoss, 12);
  assert.equal(r.later, null);
  assert.match(r.notes.join(" "), /until 16:00/);
});

test("no market order overnight or while closed", () => {
  assert.match(buildPhoneOrder({ ...base, type: "market" }, { session: "overnight", quote: q }).error, /limit/);
  assert.match(buildPhoneOrder({ ...base, type: "market" }, { session: "closed", quote: q }).error, /closed/);
  assert.equal(buildPhoneOrder({ ...base, type: "limit", limit: 12.3 }, { session: "overnight", quote: q }).order.extendedHours, true);
});

test("the target read as the server reads it: the last closing limit", () => {
  const orders = [{ symbol: "XYZ", side: "sell", type: "limit", limit: 13 }, { symbol: "XYZ", side: "sell", type: "limit", limit: 14 }];
  assert.equal(positionExits(orders, "XYZ", false).target, 14);
});
