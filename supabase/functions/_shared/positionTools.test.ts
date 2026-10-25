import test from "node:test";
import assert from "node:assert/strict";
import { usSession, stopPlan, stopsToReplace, exitPlan } from "./positionTools.ts";

const long = { qty: 100, side: "long" as const, avgPrice: 340, last: 350 };
const short = { qty: -50, side: "short" as const, avgPrice: 360, last: 350 };

test("the share market's hours, New York time", () => {
  assert.equal(usSession(Date.parse("2026-10-23T14:00:00Z")), "regular");   // Fri 10:00
  assert.equal(usSession(Date.parse("2026-10-23T12:00:00Z")), "extended");  // Fri 8:00
  assert.equal(usSession(Date.parse("2026-10-23T22:30:00Z")), "extended");  // Fri 18:30
  assert.equal(usSession(Date.parse("2026-10-24T02:00:00Z")), "closed");    // Fri 22:00
  assert.equal(usSession(Date.parse("2026-10-24T15:00:00Z")), "closed");    // Saturday
});

test("a stop for a long sits below, for a short above; from the last price or the entry", () => {
  const a = stopPlan(long, { mode: "pct", value: 2 }) as any;
  assert.deepEqual([a.side, a.qty, a.stopPrice, a.type, a.timeInForce], ["sell", 100, 343, "stop", "gtc"]);
  assert.equal((stopPlan(long, { mode: "usd", value: 5, from: "entry" }) as any).stopPrice, 335);
  const s = stopPlan(short, { mode: "pct", value: 2 }) as any;
  assert.deepEqual([s.side, s.qty, s.stopPrice], ["buy", 50, 357]);
  assert.equal((stopPlan(long, { mode: "price", value: 345.5 }) as any).stopPrice, 345.5);
});

test("a stop that would trigger at once, or with nothing to measure from, is refused in words", () => {
  const why = (p: any, i: any) => (stopPlan(p, i) as any).reason;
  assert.match(why(long, { mode: "price", value: 351 }), /above the last price 350: it would sell at once/);
  assert.match(why(short, { mode: "price", value: 340 }), /below the last price 350: it would buy at once/);
  assert.match(why({ ...long, qty: 0 }, { mode: "pct", value: 2 }), /No position/);
  assert.match(why({ ...long, last: null }, { mode: "pct", value: 2 }), /No price/);
  assert.match(why(long, { mode: "pct", value: 0 }), /how far/);
});

test("part of a share: a day stop, said so; a coin: stop-limit, its limit 1% past", () => {
  const f = stopPlan({ ...long, qty: 2.5 }, { mode: "pct", value: 2 }) as any;
  assert.equal(f.timeInForce, "day");
  assert.match(f.note, /today only/);
  const c = stopPlan({ qty: 0.01, qtyText: "0.010000000", side: "long", avgPrice: 80000, last: 81000 }, { mode: "pct", value: 1 }, true) as any;
  assert.deepEqual([c.type, c.stopPrice, c.limitPrice, c.qtyText, c.timeInForce], ["stop_limit", 80190, 79388.1, "0.010000000", "gtc"]);
});

test("a new stop replaces the old stops on the closing side, not a bracket's legs or other orders", () => {
  const orders = [
    { id: "1", side: "sell", type: "stop" }, { id: "2", side: "sell", type: "limit" },
    { id: "3", side: "sell", type: "trailing_stop" }, { id: "4", side: "buy", type: "stop" },
    { id: "5", side: "sell", type: "stop", legs: [{}] }
  ];
  assert.deepEqual(stopsToReplace(orders, "sell").map((o) => o.id), ["1", "3"]);
});

test("exits: the broker's close in the session; a limit at the bid or ask outside it; refused overnight", () => {
  assert.deepEqual(exitPlan(long, 50, "regular", {}), { ok: true, how: "close", percent: 50 });
  assert.deepEqual(exitPlan(long, 100, "closed", {}, true), { ok: true, how: "close", percent: 100 });
  const pre = exitPlan(long, 50, "extended", { bid: 349.9, ask: 350.1 }) as any;
  assert.deepEqual([pre.how, pre.side, pre.qty, pre.limitPrice, pre.note], ["limit", "sell", 50, 349.9, null]);
  const cover = exitPlan(short, 100, "extended", { bid: 349.9, ask: 350.1 }) as any;
  assert.deepEqual([cover.side, cover.qty, cover.limitPrice], ["buy", 50, 350.1]);
  const odd = exitPlan({ ...long, qty: 7.5 }, 50, "extended", { bid: 10 }) as any;
  assert.equal(odd.qty, 3);
  assert.match(odd.note, /whole shares/);
  const why = (...a: any[]) => (exitPlan(...(a as [any, any, any, any])) as any).reason;
  assert.match(why(long, 50, "closed", {}), /shut now/);
  assert.match(why(long, 0, "regular", {}), /between 1% and 100%/);
  assert.match(why(long, 50, "extended", {}), /No bid/);
  assert.match(why({ ...long, qty: 1 }, 50, "extended", { bid: 10 }), /less than one/);
});
