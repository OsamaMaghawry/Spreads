import test from "node:test";
import assert from "node:assert/strict";
import { sessionCandles } from "./sessionBars.ts";

const bar = (t: string, o: number, h: number, l: number, c: number, v = 10) => ({ t, o, h, l, c, v });
const sec = (iso: string) => Date.parse(iso) / 1000;

// 23 Oct 2026, daylight time: 9:00 New York is 13:00 UTC.
const day = [
  bar("2026-10-23T13:00:00Z", 347.51, 351.68, 347.51, 349.3), // 9:00-9:30, pre-market: left out
  bar("2026-10-23T13:30:00Z", 349.155, 349.4, 348.0, 348.5),
  bar("2026-10-23T14:00:00Z", 348.5, 349.3, 346.45, 347.7),
  bar("2026-10-23T14:30:00Z", 347.7, 348.0, 347.0, 347.9),
  bar("2026-10-23T19:30:00Z", 347.5, 347.9, 347.4, 347.69), // 15:30-16:00
  bar("2026-10-23T20:00:00Z", 347.69, 348.5, 347.6, 348.1) // 16:00, after hours: left out
];

test("hourly candles start at the 9:30 open and leave out pre-market and after hours", () => {
  const h = sessionCandles(day, 60);
  assert.deepEqual(h.map((x) => x.time), [sec("2026-10-23T13:30:00Z"), sec("2026-10-23T14:30:00Z"), sec("2026-10-23T19:30:00Z")]);
  assert.deepEqual(h[0], { time: sec("2026-10-23T13:30:00Z"), open: 349.155, high: 349.4, low: 346.45, close: 347.7, volume: 20 });
});

test("four-hour candles: 9:30-13:30, then 13:30-16:00", () => {
  const h = sessionCandles(day, 240);
  assert.equal(h.length, 2);
  assert.equal(h[0].time, sec("2026-10-23T13:30:00Z"));
  assert.equal(h[1].time, sec("2026-10-23T17:30:00Z"));
  assert.equal(h[1].close, 347.69);
});
