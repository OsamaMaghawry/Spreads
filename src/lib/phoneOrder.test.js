import test from "node:test";
import assert from "node:assert/strict";
import { buildPhoneOrder, marketableLimit, stepPrice, positionExits, riskReward, phoneSession, rMultiple, exitsNotes } from "./phoneOrder.js";

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

// Trading audit 2026-W48 (head-of-trading, 26 Nov).
test("W48-F1: a sale of shares held (or a buy-back of a short) takes no stop and target", () => {
  const q2 = { bid: 99.9, ask: 100.1, last: 100 };
  const sell = buildPhoneOrder({ symbol: "XYZ", side: "sell", qty: 100, type: "market", sl: 101.9, tp: 95.9 }, { session: "regular", quote: q2, held: 100 });
  assert.ok(sell.error, "a bracket on a closing sale would open a short");
  assert.match(sell.error, /new position the other way/);
  const later = buildPhoneOrder({ symbol: "XYZ", side: "sell", qty: 100, type: "market", sl: 101.9 }, { session: "extended", quote: q2, held: 100 });
  assert.ok(later.error, "nor set after the fill");
  const cover = buildPhoneOrder({ symbol: "XYZ", side: "buy", qty: 100, type: "limit", limit: 100, sl: 98, tp: 104 }, { session: "regular", quote: q2, held: -100 });
  assert.ok(cover.error);
  // A plain closing sale still goes, and an opening order keeps its bracket.
  assert.equal(buildPhoneOrder({ symbol: "XYZ", side: "sell", qty: 100, type: "market" }, { session: "regular", quote: q2, held: 100 }).order.type, "market");
  assert.equal(buildPhoneOrder({ symbol: "XYZ", side: "sell", qty: 100, type: "limit", limit: 100, sl: 101.9, tp: 95.9 }, { session: "regular", quote: q2, held: 0 }).order.stopLoss, 101.9);
});

test("W48-F4a: no marketable limit from the last trade when the touch is missing", () => {
  assert.equal(marketableLimit("buy", { bid: 0, ask: 0, last: 100 }), null);
  assert.equal(marketableLimit("sell", { bid: 0, ask: 101, last: 100 }), null);
  const r = buildPhoneOrder({ ...base, type: "market" }, { session: "extended", quote: { bid: 0, ask: 0, last: 100 } });
  assert.ok(r.error);
});

test("W48-F5: a stop already through the market is refused, not only one through the limit", () => {
  const q2 = { bid: 99.9, ask: 100.1, last: 100 };
  const buy = buildPhoneOrder({ ...base, type: "limit", limit: 101, sl: 100.5, tp: 104 }, { session: "regular", quote: q2 });
  assert.ok(buy.error, "stop 100.50 above the 99.90 bid fires as soon as it fills");
  const sell = buildPhoneOrder({ ...base, side: "sell", type: "limit", limit: 99, sl: 99.5, tp: 96 }, { session: "regular", quote: q2 });
  assert.ok(sell.error);
  assert.ok(buildPhoneOrder({ ...base, type: "limit", limit: 101, sl: 99, tp: 104 }, { session: "regular", quote: q2 }).order);
});

test("W48-F6: R is withheld when the stop is at the entry or on the profit side", () => {
  assert.equal(rMultiple({ avg: 100, stop: 100, last: 102, short: false }), null);
  assert.equal(rMultiple({ avg: 100.123, stop: 100.12, last: 102.765, short: false }), null);
  assert.equal(rMultiple({ avg: 100, stop: 101, last: 102, short: false }), null);
  assert.equal(rMultiple({ avg: 100, stop: 98, last: 102, short: false }), 1);
  assert.equal(rMultiple({ avg: 100, stop: 102, last: 98, short: true }), 1);
});

test("W48-F3: the phone's exits toast says when a stop lasts for today only", () => {
  const note = "a position with part of a share: the stop lasts for today only";
  assert.match(exitsNotes({ note }), /today only/);
  assert.match(exitsNotes({ group: [{ name: "B", ok: true, note }] }), /B: .*today only/);
  assert.equal(exitsNotes({ note: null }), "");
});

test("W48-F8: the phone says every order is a day order", () => {
  assert.match(buildPhoneOrder({ ...base, type: "limit", limit: 12 }, { session: "regular", quote: q }).words, /for the day/);
});
