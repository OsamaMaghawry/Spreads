import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_KINDS, DEFAULT_SHOWN, nyTime, ismDays, econEvents, earningsEvent, eventSlot, placeEvents,
  badgeLayout, badgeAt, badgeWidth, cleanShown, nextOfEach, eventWhen, BADGE_H
} from "./marketEvents.js";

const iso = (sec) => new Date(sec * 1000).toISOString();

test("New York times: 8:30 in winter is 13:30 UTC, in summer 12:30", () => {
  assert.equal(iso(nyTime("2026-01-13", "08:30")), "2026-01-13T13:30:00.000Z");
  assert.equal(iso(nyTime("2026-07-14", "08:30")), "2026-07-14T12:30:00.000Z");
  // The FOMC decision three days before clocks change back still reads EDT.
  assert.equal(iso(nyTime("2026-10-28", "14:00")), "2026-10-28T18:00:00.000Z");
  assert.equal(iso(nyTime("2026-12-09", "14:00")), "2026-12-09T19:00:00.000Z");
});

test("ISM: first and third business day, past New Year, ISM's 2 January, Independence Day and Labor Day", () => {
  assert.deepEqual(ismDays(2026, 10), ["2026-10-01", "2026-10-05"]);
  assert.deepEqual(ismDays(2026, 11), ["2026-11-02", "2026-11-04"]);
  assert.deepEqual(ismDays(2026, 12), ["2026-12-01", "2026-12-03"]);
  // ISM's own calendar: "The Manufacturing report will be released on January 5th due to ISM holiday."
  assert.deepEqual(ismDays(2026, 1), ["2026-01-05", "2026-01-07"]);
  assert.deepEqual(ismDays(2025, 1), ["2025-01-03", "2025-01-07"]);
  // 2026's Independence Day is a Saturday, observed Friday 3 July.
  assert.deepEqual(ismDays(2026, 7), ["2026-07-01", "2026-07-06"]);
  assert.deepEqual(ismDays(2025, 7), ["2025-07-01", "2025-07-03"]);
  assert.deepEqual(ismDays(2025, 9), ["2025-09-02", "2025-09-04"]);
});

test("the economic calendar: sorted, every date real, every kind known, the shutdown dates as revised", () => {
  const all = econEvents();
  const kinds = new Set(EVENT_KINDS.map((k) => k.id));
  for (let i = 1; i < all.length; i++) assert.ok(all[i].time >= all[i - 1].time);
  for (const e of all) {
    assert.ok(kinds.has(e.kind), e.kind);
    const [y, m, d] = e.date.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d));
    assert.equal(day.getUTCDate(), d, `${e.date} is not a date`);
    assert.ok(day.getUTCDay() !== 0 && day.getUTCDay() !== 6, `${e.id} falls on a weekend`);
  }
  const on = (kind, date) => all.find((e) => e.kind === kind && e.date === date);
  assert.ok(on("cpi", "2025-10-24"), "September 2025 CPI, released after the shutdown");
  assert.ok(!all.some((e) => e.kind === "cpi" && e.date === "2025-11-13"), "October 2025 CPI was never published");
  assert.ok(on("jobs", "2026-11-06"));
  assert.equal(on("fomc", "2026-10-28").title, "FOMC rate decision");
  assert.equal(iso(on("fomc", "2026-10-28").time), "2026-10-28T18:00:00.000Z");
  assert.equal(on("pce", "2026-01-22").clock, "10:00");
  // Each FOMC year has its eight meetings.
  for (const y of ["2024", "2025", "2026", "2027"]) {
    assert.equal(all.filter((e) => e.title === "FOMC rate decision" && e.date.startsWith(y)).length, 8, y);
  }
  assert.equal(all.filter((e) => e.kind === "pmi" && e.date.startsWith("2026")).length, 24);
});

test("an earnings report: filed moment when known, else the part of the day; EPS against the estimate", () => {
  const past = earningsEvent({ date: "2026-07-30", at: 1785443428, session: "amc", epsActual: 1.62, epsEstimate: 1.5, revenueActual: 94.04e9, revenueEstimate: 89.3e9 });
  assert.equal(past.time, 1785443428);
  assert.equal(past.clock, "after the close");
  assert.equal(past.detail, "EPS 1.62 vs 1.50 expected (+8.0%) · Revenue $94.04B vs $89.30B expected");
  const next = earningsEvent({ date: "2026-11-02", session: "amc", upcoming: true, epsEstimate: 1.76 });
  assert.equal(iso(next.time), "2026-11-02T21:05:00.000Z");
  assert.equal(next.title, "Earnings (scheduled)");
  assert.equal(next.detail, "EPS expected 1.76");
  const bare = earningsEvent({ date: "2026-01-13", session: "bmo" });
  assert.equal(iso(bare.time), "2026-01-13T13:00:00.000Z");
  assert.equal(bare.detail, "");
});

test("where an event sits: inside a candle, in a gap the next candle, past the end in the space to the right", () => {
  const times = [0, 300, 600, 900, 2000, 2300];
  assert.equal(eventSlot(times, 310, 300), 1);
  assert.equal(eventSlot(times, 600, 300), 2);
  assert.equal(eventSlot(times, 1500, 300), 4); // overnight gap: the morning's first candle
  assert.equal(eventSlot(times, 2400, 300), 5);
  assert.equal(eventSlot(times, 2600, 300), 6);
  assert.equal(eventSlot(times, 3500, 300), 9);
  assert.equal(eventSlot(times, -5, 300), null);
  assert.equal(eventSlot([], 5, 300), null);
  // A daily chart: an after-close report lands on that day's candle.
  const days = [nyTime("2026-07-29"), nyTime("2026-07-30"), nyTime("2026-07-31")];
  assert.equal(eventSlot(days, nyTime("2026-07-30", "16:30"), 86400), 1);
});

test("placing: only the kinds shown, with their label and colour", () => {
  const events = [{ kind: "cpi", time: 310 }, { kind: "ppi", time: 610 }, { kind: "earnings", time: 900 }];
  const placed = placeEvents(events, ["cpi", "earnings"], [0, 300, 600, 900], 300);
  assert.deepEqual(placed.map((e) => [e.kind, e.slot, e.label]), [["cpi", 1, "CPI"], ["earnings", 3, "E"]]);
});

test("badges: a row each until they fit, three rows, then dots; the pointer finds them", () => {
  const ev = (slot, label = "CPI") => ({ slot, label });
  const xOf = (slot) => slot * 10;
  const out = badgeLayout([ev(10), ev(10.5), ev(11), ev(11.5), ev(30, "E")], xOf, 200);
  const base = 200 - 4 - BADGE_H;
  assert.deepEqual(out.map((b) => [b.dot, b.y]), [[false, base], [false, base - 17], [false, base - 34], [true, base + BADGE_H / 2 - 3], [false, base]]);
  assert.equal(out[0].w, badgeWidth("CPI"));
  assert.equal(badgeAt(out, out[1].x + 3, out[1].y + 3), out[1]);
  assert.equal(badgeAt(out, out[3].x + 2, out[3].y + 2), out[3]);
  assert.equal(badgeAt(out, 500, 5), null);
  // Off-screen slots are left out.
  assert.equal(badgeLayout([ev(1)], () => null, 200).length, 0);
});

test("saved choices, the next of each kind, and how a moment reads", () => {
  assert.deepEqual(cleanShown(null), DEFAULT_SHOWN);
  assert.deepEqual(cleanShown(["cpi", "cpi", "nonsense", "fomc"]), ["cpi", "fomc"]);
  assert.deepEqual(cleanShown([]), []);
  const now = nyTime("2026-10-24", "12:00");
  const next = nextOfEach(econEvents(), now);
  assert.equal(next.fomc.date, "2026-10-28");
  assert.equal(next.cpi.date, "2026-11-10");
  assert.equal(next.pmi.date, "2026-11-02");
  assert.equal(eventWhen(next.fomc), "Wed, Oct 28, 2026, 2:00 PM New York");
  assert.equal(eventWhen(earningsEvent({ date: "2026-11-02", session: "amc", upcoming: true })), "Mon, Nov 2, 2026, after the close");
});
