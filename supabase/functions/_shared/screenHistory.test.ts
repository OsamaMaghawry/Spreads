import test from "node:test";
import assert from "node:assert/strict";
import { historyRow, premarket, nyMoment } from "./screenHistory.ts";

// Thirty weekdays of a share, the last on Friday 23 Oct 2026: closes 101 to
// 130, each day's volume its close times 1,000.
const days: any[] = [];
let t = Date.parse("2026-09-14T04:00:00Z");
while (days.length < 30) {
  const wd = new Date(t).getUTCDay();
  if (wd !== 0 && wd !== 6) {
    const c = 101 + days.length;
    days.push({ t: new Date(t).toISOString(), o: c - 0.5, h: c + 1, l: c - 1, c, v: c * 1000, vw: c - 0.2, n: 50 });
  }
  t += 86400000;
}
const last = days[29].t.slice(0, 10);

test("at the open: the day's opening price only, and the days before for the norms", () => {
  const r = historyRow(days, last, "open")!;
  assert.equal(last, "2026-10-23");
  assert.deepEqual([r.open, r.high, r.low, r.close, r.volume, r.vwap], [129.5, null, null, null, null, null]);
  assert.deepEqual([r.prevClose, r.prevVolume, r.lastDate, r.lastClose], [129, 129000, "2026-10-22", 129]);
  // The twenty days before: closes 110 to 129.
  assert.equal(r.sma20, 119.5);
  assert.equal(r.avgVol20, 119500);
  assert.equal(r.avgDollar20, days.slice(9, 29).reduce((a, b) => a + b.c * b.v, 0) / 20);
  assert.deepEqual([r.d5, r.d21], [124, 108]);
  // Every true range is 2 (the high and low 1 either side, a close 1 up).
  assert.equal(r.atr14, 2);
});

test("at the close: the whole day, with the same norms as at the open", () => {
  const o = historyRow(days, last, "open")!;
  const c = historyRow(days, last, "close")!;
  assert.deepEqual([c.high, c.low, c.close, c.volume, c.vwap, c.trades], [131, 129, 130, 130000, 129.8, 50]);
  assert.deepEqual([c.avgVol20, c.sma20, c.d5, c.lastDate], [o.avgVol20, o.sma20, o.d5, o.lastDate]);
});

test("a day it did not trade, or too little history for a norm", () => {
  assert.equal(historyRow(days, "2026-10-24", "open"), null);
  const short = historyRow(days.slice(20), last, "open")!;
  assert.deepEqual([short.avgVol20, short.sma20, short.atr14, short.d21, short.d5], [null, null, null, null, 124]);
  const first = historyRow(days.slice(29), last, "open")!;
  assert.deepEqual([first.prevClose, first.lastDate], [null, null]);
});

test("the pre-market and New York times", () => {
  const m = (t: string, c: number, v: number) => ({ t, o: c, h: c + 0.5, l: c - 0.5, c, v });
  assert.deepEqual(premarket([m("2026-10-23T08:01:00Z", 10, 100), m("2026-10-23T12:00:00Z", 11, 250), m("2026-10-23T13:29:00Z", 10.5, 50)]), { pmVolume: 400, pmHigh: 11.5, pmLow: 9.5, pmLast: 10.5 });
  assert.deepEqual(premarket([]), { pmVolume: 0, pmHigh: null, pmLow: null, pmLast: null });
  assert.equal(new Date(nyMoment("2026-10-23", "09:30")).toISOString(), "2026-10-23T13:30:00.000Z");
  assert.equal(new Date(nyMoment("2026-12-03", "09:30")).toISOString(), "2026-12-03T14:30:00.000Z");
  assert.equal(new Date(nyMoment("2026-03-09", "04:00")).toISOString(), "2026-03-09T08:00:00.000Z");
});
