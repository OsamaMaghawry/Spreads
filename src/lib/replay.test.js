import test from "node:test";
import assert from "node:assert/strict";
import { replayCandles, nextCursor, inSession, dayOf, practiceFill, practiceValue, triggerExits, practiceExit, newPractice, countBefore, rollMinutes } from "./replay.js";

// New York is UTC-4 in October: 9:30 is 13:30Z.
const ny = (date, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.parse(`${date}T00:00:00Z`) / 1000 + (h + 4) * 3600 + m * 60;
};
// Every minute from 8:00 to 17:00 on Thursday 22 and Friday 23 Oct 2026; each
// candle's close is a running count, so sums and extremes are easy to check.
const minutes = [];
let k = 0;
for (const date of ["2026-10-22", "2026-10-23"]) {
  for (let t = ny(date, "08:00"); t < ny(date, "17:00"); t += 60) {
    k += 1;
    minutes.push({ time: t, open: k - 0.5, high: k + 1, low: k - 1, close: k, volume: 10 });
  }
}
const day = (date, o, h, l, c) => ({ time: Date.parse(`${date}T04:00:00Z`) / 1000, open: o, high: h, low: l, close: c, volume: 1000 });
// The broker's own daily candles (regular hours), deliberately not equal to
// the minutes' sums, to show which is used where.
const days = [day("2026-10-20", 1, 2, 0.5, 1.5), day("2026-10-21", 2, 3, 1, 2.5), day("2026-10-22", 90, 400, 89, 390), day("2026-10-23", 600, 900, 590, 890)];
const data = { minutes, days };
const at = (t, interval, regular = true) => replayCandles(data, interval, t, { regular });
const fri1042 = ny("2026-10-23", "10:42");

test("the regular session", () => {
  assert.equal(inSession(ny("2026-10-23", "09:30")), true);
  assert.equal(inSession(ny("2026-10-23", "09:29")), false);
  assert.equal(inSession(ny("2026-10-23", "16:00")), false);
  assert.equal(dayOf(ny("2026-10-23", "10:42"), false), Date.parse("2026-10-23T04:00:00Z") / 1000);
});

test("nothing after the replay's moment is ever on screen, at any interval", () => {
  for (const iv of ["1Min", "5Min", "15Min", "1Hour", "4Hour", "1Day", "1Week", "1Month"]) {
    for (const regular of [true, false]) {
      const list = at(fri1042, iv, regular);
      const lastMinute = minutes[countBefore(minutes, fri1042) - 1];
      assert.ok(list.length > 0, iv);
      assert.ok(list.every((c) => c.high <= lastMinute.high), `${iv} shows a later high`);
      assert.equal(list.at(-1).close, lastMinute.close, `${iv} ends at the last revealed price`);
    }
  }
});

test("every interval agrees: an hour half done is exactly its minutes so far", () => {
  const ones = at(fri1042, "1Min");
  const hours = at(fri1042, "1Hour");
  const fives = at(fri1042, "5Min");
  // The 10:30 hourly candle so far: the twelve minutes 10:30 to 10:41.
  const h = hours.at(-1);
  assert.equal(h.time, ny("2026-10-23", "10:30"));
  const its = ones.filter((m) => m.time >= h.time);
  assert.equal(its.length, 12);
  assert.deepEqual([h.open, h.high, h.low, h.close, h.volume], [its[0].open, Math.max(...its.map((m) => m.high)), Math.min(...its.map((m) => m.low)), its.at(-1).close, 120]);
  // The first hour starts at the open, as the live chart's do.
  assert.equal(hours.filter((c) => c.time < h.time).at(-1).time, ny("2026-10-23", "09:30"));
  assert.equal(fives.at(-1).time, ny("2026-10-23", "10:40"));
  assert.equal(fives.at(-1).volume, 20);
  // The day's high across intervals is the same number.
  const todays = (list) => Math.max(...list.filter((c) => c.time >= ny("2026-10-23", "09:30")).map((c) => c.high));
  assert.equal(todays(hours), todays(ones));
  assert.equal(todays(fives), todays(ones));
});

test("daily: finished days are the broker's; the day in progress is its minutes; at the close, the broker's again", () => {
  const d = at(fri1042, "1Day");
  assert.deepEqual(d.slice(0, 3).map((c) => c.close), [1.5, 2.5, 390]);
  const sessionSoFar = minutes.filter((m) => m.time >= ny("2026-10-23", "09:30") && m.time < fri1042);
  assert.deepEqual([d.at(-1).open, d.at(-1).close, d.at(-1).volume], [sessionSoFar[0].open, sessionSoFar.at(-1).close, sessionSoFar.length * 10]);
  const closed = at(ny("2026-10-23", "16:00"), "1Day");
  assert.equal(closed.at(-1).close, 890);
  // Before Friday's open, the chart ends at Thursday.
  assert.equal(at(ny("2026-10-23", "09:00"), "1Day").at(-1).close, 390);
  // The week: Tuesday to Friday so far, in one candle.
  const w = at(fri1042, "1Week");
  assert.equal(w.length, 1);
  assert.deepEqual([w[0].open, w[0].close], [1, d.at(-1).close]);
});

test("a step goes to the end of the next candle", () => {
  const step = (unit, t, regular = true) => nextCursor(data, unit, t, { regular });
  assert.equal(step("1Min", fri1042), ny("2026-10-23", "10:43"));
  assert.equal(step("5Min", fri1042), ny("2026-10-23", "10:45"));
  assert.equal(step("1Hour", fri1042), ny("2026-10-23", "11:30"));
  // The last session-aligned candle stops at the close.
  assert.equal(step("4Hour", ny("2026-10-23", "13:31")), ny("2026-10-23", "16:00"));
  // After the close, a regular-hours step goes to the next session.
  assert.equal(step("5Min", ny("2026-10-22", "16:00")), ny("2026-10-23", "09:35"));
  assert.equal(step("5Min", ny("2026-10-22", "16:00"), false), ny("2026-10-22", "16:05"));
  assert.equal(step("1Day", ny("2026-10-22", "12:00")), ny("2026-10-22", "16:00"));
  assert.equal(step("1Day", ny("2026-10-22", "16:00")), ny("2026-10-23", "16:00"));
  assert.equal(step("1Week", ny("2026-10-20", "12:00")), ny("2026-10-23", "16:00"));
  // The end of the data: nothing more to show.
  assert.equal(step("1Min", ny("2026-10-23", "17:00"), false), null);
  assert.equal(step("1Day", ny("2026-10-23", "16:00")), null);
});

test("the practice account: averages, realized profit, a flip to short, cash", () => {
  let a = newPractice();
  a = practiceFill(a, { side: "buy", qty: 10, price: 100, time: 1 });
  a = practiceFill(a, { side: "buy", qty: 10, price: 110, time: 2 });
  assert.deepEqual([a.qty, a.avg], [20, 105]);
  a = practiceFill(a, { side: "sell", qty: 15, price: 120, time: 3 });
  assert.deepEqual([a.qty, a.avg, a.realized], [5, 105, 225]);
  a = practiceFill(a, { side: "sell", qty: 10, price: 100, time: 4 });
  assert.deepEqual([a.qty, a.avg, a.realized], [-5, 100, 200]);
  assert.equal(a.cash, 100000 - 1000 - 1100 + 1800 + 1000);
  const v = practiceValue(a, 90);
  assert.deepEqual([v.unrealized, v.equity], [50, a.cash - 450]);
  a = practiceFill(a, { side: "buy", qty: 5, price: 90, time: 5 });
  assert.deepEqual([a.qty, a.avg, a.realized], [0, 0, 250]);
  assert.equal(practiceValue(a, 90).equity, 100250);
});

test("practice stop: on the low for a long, at the open through a gap; covering what was added after it", () => {
  let a = practiceFill(newPractice(), { side: "buy", qty: 10, price: 100, time: 1 });
  a = practiceExit(a, "stop", 95, 100).acct;
  // Bought more after setting the stop: the stop covers all of it.
  a = practiceFill(a, { side: "buy", qty: 10, price: 100, time: 2 });
  assert.equal(a.stop, 95);
  a = triggerExits(a, [{ time: 3, open: 99, high: 99, low: 96, close: 97 }]);
  assert.equal(a.qty, 20);
  a = triggerExits(a, [{ time: 4, open: 94, high: 94.5, low: 93, close: 94 }]);
  assert.deepEqual([a.qty, a.realized, a.trades.at(-1).price, a.trades.at(-1).qty, a.trades.at(-1).why, a.stop], [0, -120, 94, 20, "stop", null]);
});

test("practice target: on the high, better at a gap; one cancels the other; a short the other way round", () => {
  let a = practiceFill(newPractice(), { side: "buy", qty: 10, price: 100, time: 1 });
  a = practiceExit(a, "stop", 95, 100).acct;
  a = practiceExit(a, "target", 110, 100).acct;
  a = triggerExits(a, [{ time: 2, open: 104, high: 110.5, low: 103, close: 110 }]);
  assert.deepEqual([a.qty, a.trades.at(-1).price, a.trades.at(-1).why, a.stop, a.target], [0, 110, "target", null, null]);
  let g = practiceExit(practiceExit(practiceFill(newPractice(), { side: "buy", qty: 10, price: 100, time: 1 }), "target", 110, 100).acct, "stop", 95, 100).acct;
  g = triggerExits(g, [{ time: 2, open: 112, high: 113, low: 111, close: 112 }]);
  assert.equal(g.trades.at(-1).price, 112);
  // Both inside one minute: the stop.
  let both = practiceExit(practiceExit(practiceFill(newPractice(), { side: "buy", qty: 1, price: 100, time: 1 }), "target", 101, 100).acct, "stop", 99, 100).acct;
  both = triggerExits(both, [{ time: 2, open: 100, high: 101.5, low: 98.5, close: 100 }]);
  assert.equal(both.trades.at(-1).why, "stop");
  let s = practiceFill(newPractice(), { side: "sell", qty: 4, price: 50, time: 1 });
  s = practiceExit(s, "target", 45, 50).acct;
  s = practiceExit(s, "stop", 52, 50).acct;
  s = triggerExits(s, [{ time: 2, open: 49, high: 49.5, low: 44.9, close: 45 }]);
  assert.deepEqual([s.qty, s.trades.at(-1).price, s.trades.at(-1).why], [0, 45, "target"]);
});

test("practice exits on the wrong side of the price are refused; cleared with null", () => {
  const a = practiceFill(newPractice(), { side: "buy", qty: 10, price: 100, time: 1 });
  assert.match(practiceExit(a, "stop", 101, 100).reason, /stop at 101.00 for a long must be below the price 100.00/);
  assert.match(practiceExit(a, "target", 99, 100).reason, /take-profit at 99.00 for a long must be above the price 100.00/);
  assert.match(practiceExit(newPractice(), "stop", 1, 1).reason, /No practice position/);
  const set = practiceExit(a, "stop", 95, 100).acct;
  assert.equal(practiceExit(set, "stop", null, 100).acct.stop, null);
  // Turned the other way round: the old exits go.
  const flipped = practiceFill(set, { side: "sell", qty: 15, price: 100, time: 2 });
  assert.equal(flipped.stop, null);
});

test("hourly and longer reach back through half-hour candles before the minutes; shorter charts do not", () => {
  // Wednesday 21 Oct, regular hours, as half-hour candles: 9:30 to 15:30.
  const context = [];
  for (let t = ny("2026-10-21", "09:30"); t < ny("2026-10-21", "16:00"); t += 1800) context.push({ time: t, open: 5, high: 6, low: 4, close: 5, volume: 7 });
  const withContext = { minutes, days, context };
  const hours = replayCandles(withContext, "1Hour", fri1042, { regular: true });
  assert.equal(hours[0].time, ny("2026-10-21", "09:30"));
  assert.equal(hours.filter((c) => c.time < ny("2026-10-22", "00:00")).length, 7);
  // The 15:30 hour of Wednesday is its one half hour.
  assert.equal(hours.find((c) => c.time === ny("2026-10-21", "15:30")).volume, 7);
  assert.deepEqual(hours.slice(7), at(fri1042, "1Hour"));
  assert.deepEqual(replayCandles(withContext, "15Min", fri1042, { regular: true }), at(fri1042, "15Min"));
});

test("minutes let go become half-hour candles, and every chart reads the same afterwards", () => {
  const rolled = rollMinutes(data, ny("2026-10-23", "09:47"));
  assert.equal(rolled.minutes[0].time, ny("2026-10-23", "09:30"));
  assert.equal(rolled.context.at(-1).time, ny("2026-10-23", "09:00"));
  assert.equal(rolled.days, days);
  for (const iv of ["30Min", "1Hour", "4Hour", "1Day"]) {
    assert.deepEqual(replayCandles(rolled, iv, fri1042, { regular: true }), at(fri1042, iv), iv);
    assert.deepEqual(replayCandles(rolled, iv, fri1042, { regular: false }), at(fri1042, iv, false), `${iv} all hours`);
  }
  assert.equal(rollMinutes(data, minutes[0].time).minutes, minutes);
});

test("a share's practice stop waits for regular hours: an overnight gap fills at the open", () => {
  const a = practiceExit(practiceFill(newPractice(), { side: "buy", qty: 10, price: 100, time: 1 }), "stop", 95, 100).acct;
  const out = triggerExits(a, [
    { time: ny("2026-10-23", "08:00"), open: 93, high: 93, low: 92, close: 92 },
    { time: ny("2026-10-23", "09:30"), open: 91, high: 92, low: 90, close: 91 }
  ], { regularOnly: true });
  assert.deepEqual([out.qty, out.trades.at(-1).price, out.trades.at(-1).time], [0, 91, ny("2026-10-23", "09:30")]);
});
