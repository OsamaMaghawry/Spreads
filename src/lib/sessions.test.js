import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDays, sessionWindows, latestSessions, sessionStats, prevDay, nyMs, dayTag } from "./sessions.js";

// Alpaca's calendar around Thanksgiving 2026: the 26th shut, the 27th closing
// at 13:00 with extended hours to 17:00.
const days = calendarDays([
  { date: "2026-11-24", open: "09:30", close: "16:00", session_open: "0400", session_close: "2000" },
  { date: "2026-11-25", open: "09:30", close: "16:00", session_open: "0400", session_close: "2000" },
  { date: "2026-11-27", open: "09:30", close: "13:00", session_open: "0400", session_close: "1700" },
  { date: "2026-11-30", open: "09:30", close: "16:00", session_open: "0400", session_close: "2000" }
]);
const at = (date, hhmm) => nyMs(date, hhmm);

test("the calendar made plain; New York clock times in winter", () => {
  assert.equal(days[2].sessionClose, "17:00");
  assert.equal(new Date(at("2026-11-27", "13:00")).toISOString(), "2026-11-27T18:00:00.000Z");
  assert.equal(prevDay(days, "2026-11-27"), "2026-11-25");
  assert.equal(dayTag("2026-11-10"), "Tue 11/10");
});

test("sessions of a day: after hours from the minute after the close; an early close", () => {
  const w = sessionWindows(days).filter((x) => x.date === "2026-11-27");
  const by = Object.fromEntries(w.map((x) => [x.kind, x]));
  assert.equal(by.overnight.from, at("2026-11-25", "20:00")); // over the holiday
  assert.equal(by.overnight.to, at("2026-11-27", "04:00"));
  assert.equal(by.premarket.to, at("2026-11-27", "09:30"));
  assert.equal(by.regular.to, at("2026-11-27", "13:01"));
  assert.equal(by.afterhours.from, at("2026-11-27", "13:01"));
  assert.equal(by.afterhours.to, at("2026-11-27", "17:00"));
  // The Monday after: overnight from Friday's 17:00.
  assert.equal(sessionWindows(days).find((x) => x.date === "2026-11-30" && x.kind === "overnight").from, at("2026-11-27", "17:00"));
});

test("at each hour: the latest of each kind, live or done, and the day its change is from", () => {
  // 19:00 on the 25th: after hours running; the overnight is the one into the 25th.
  let s = latestSessions(days, at("2026-11-25", "19:00"));
  assert.equal(s.current, "afterhours");
  assert.deepEqual([s.afterhours.date, s.afterhours.live, s.afterhours.refDate], ["2026-11-25", true, "2026-11-25"]);
  assert.deepEqual([s.overnight.date, s.overnight.live], ["2026-11-25", false]);
  assert.equal(s.next.overnight, at("2026-11-25", "20:00"));
  assert.equal(s.next.premarket, at("2026-11-27", "04:00"));
  // 21:00: the overnight into the 27th has begun (Thanksgiving between).
  s = latestSessions(days, at("2026-11-25", "21:00"));
  assert.equal(s.current, "overnight");
  assert.deepEqual([s.overnight.date, s.overnight.live, s.overnight.refDate], ["2026-11-27", true, "2026-11-25"]);
  assert.deepEqual([s.afterhours.date, s.afterhours.live], ["2026-11-25", false]);
  // Thanksgiving noon: still the overnight; pre-market and regular the 25th's.
  s = latestSessions(days, at("2026-11-26", "12:00"));
  assert.equal(s.current, "overnight");
  assert.equal(s.premarket.date, "2026-11-25");
  // 14:00 on the 27th: the early close has passed; after hours running.
  s = latestSessions(days, at("2026-11-27", "14:00"));
  assert.equal(s.current, "afterhours");
  assert.deepEqual([s.regular.date, s.regular.live, s.regular.refDate], ["2026-11-27", false, "2026-11-25"]);
  // Saturday: nothing running; the overnight into Monday has begun (Friday 17:00).
  s = latestSessions(days, at("2026-11-28", "12:00"));
  assert.equal(s.current, "overnight");
  assert.equal(s.overnight.date, "2026-11-30");
});

test("a session's figures: the regular session's volume keeps the closing auction, its prices do not", () => {
  const s = latestSessions(days, at("2026-11-25", "19:00")).regular;
  const bar = (hhmm, c, v, h = c, l = c) => ({ t: new Date(at("2026-11-25", hhmm)).toISOString(), c, v, h, l });
  const bars = [bar("09:29", 9, 500), bar("09:30", 10, 1000, 10.2, 9.9), bar("15:59", 10.5, 2000, 10.6, 10.4), bar("16:00", 9.0, 50000, 10.55, 9.0), bar("16:05", 11, 300)];
  const st = sessionStats(bars, s, 10, 10.55);
  assert.deepEqual(st, { v: 53000, h: 10.6, l: 9.9, last: 10.55, ref: 10 });
  // While it runs, the last candle's close.
  assert.equal(sessionStats(bars.slice(0, 3), { ...s, live: true }, 10).last, 10.5);
  // After hours: from 16:01.
  const ah = latestSessions(days, at("2026-11-25", "19:00")).afterhours;
  assert.deepEqual(sessionStats(bars, ah, 10.55), { v: 300, h: 11, l: 11, last: 11, ref: 10.55 });
  assert.deepEqual(sessionStats([], ah, 0), { v: 0, h: null, l: null, last: null, ref: null });
});
