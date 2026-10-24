import test from "node:test";
import assert from "node:assert/strict";
import { secMoment, sessionAt, secReports, withFigures, earningsTimeline, cikMap } from "./earningsHistory.ts";

const iso = (s: number | null) => (s === null ? null : new Date(s * 1000).toISOString());

test("EDGAR's acceptance time, corrected: Apple at 4:30 p.m., JPMorgan at 6:30 a.m., summer and winter", () => {
  // As EDGAR's submissions file wrote them, 24 Oct 2026.
  assert.equal(iso(secMoment("2026-07-31T00:30:28.000Z")), "2026-07-30T20:30:28.000Z"); // 4:30 p.m. EDT
  assert.equal(iso(secMoment("2026-01-30T02:30:33.000Z")), "2026-01-29T21:30:33.000Z"); // 4:30 p.m. EST
  assert.equal(iso(secMoment("2026-10-13T14:30:38.000Z")), "2026-10-13T10:30:38.000Z"); // 6:30 a.m. EDT
  assert.equal(iso(secMoment("2026-01-13T16:41:09.000Z")), "2026-01-13T11:41:09.000Z"); // 6:41 a.m. EST
  assert.equal(secMoment("not a time"), null);
  assert.equal(sessionAt(secMoment("2026-07-31T00:30:28.000Z")!), "amc");
  assert.equal(sessionAt(secMoment("2026-10-13T14:30:38.000Z")!), "bmo");
  assert.equal(sessionAt(Date.parse("2026-10-13T16:00:00Z") / 1000), "dmh");
});

test("results announcements: 8-Ks with Item 2.02 only, one a day, oldest first, dated in New York", () => {
  const filings = {
    form: ["10-Q", "8-K", "8-K", "8-K", "8-K/A", "4"],
    items: ["", "2.02,9.01", "5.02", "2.02,9.01", "2.02", ""],
    acceptanceDateTime: ["2026-07-31T14:01:02.000Z", "2026-07-31T00:30:28.000Z", "2026-06-01T20:00:00.000Z", "2026-05-01T00:30:41.000Z", "2026-05-01T12:00:00.000Z", "2026-05-02T00:00:00.000Z"],
    filingDate: ["2026-07-31", "2026-07-30", "2026-06-01", "2026-04-30", "2026-05-01", "2026-05-01"]
  };
  const r = secReports(filings);
  assert.deepEqual(r.map((x) => [x.date, x.session]), [["2026-04-30", "amc"], ["2026-05-01", "bmo"], ["2026-07-30", "amc"]]);
  assert.equal(secReports(null).length, 0);
});

test("figures: a quarter's EPS goes to the first report after the quarter ends; revenue from the calendar row", () => {
  const reports = [
    { date: "2026-04-30", at: null, session: "amc" as const, upcoming: false, source: "sec" as const },
    { date: "2026-07-30", at: null, session: "amc" as const, upcoming: false, source: "sec" as const }
  ];
  const surprises = [{ period: "2026-06-30", actual: 1.62, estimate: 1.5 }, { period: "2026-03-31", actual: 1.65, estimate: 1.62 }];
  const calendar = [{ date: "2026-07-30", revenueActual: 94e9, revenueEstimate: 89e9, epsActual: 1.62, epsEstimate: 1.5 }];
  const out = withFigures(reports, surprises, calendar);
  assert.equal(out[0].epsActual, 1.65);
  assert.equal(out[0].period, "quarter ended Mar 31, 2026");
  assert.equal(out[0].revenueActual, undefined);
  assert.equal(out[1].epsEstimate, 1.5);
  assert.equal(out[1].revenueActual, 94e9);
});

test("the timeline: filed reports, the calendar's dates the SEC lacks, and the next report only", () => {
  const sec = [{ date: "2026-07-30", at: 1, session: "amc" as const, upcoming: false, source: "sec" as const }];
  const cached = [
    { report_date: "2026-07-31", session: "amc" },   // the same report, a day off: not doubled
    { report_date: "2026-09-02", session: "bmo" },   // past, not in the SEC list (a foreign filer)
    { report_date: "2026-11-02", session: "amc" },
    { report_date: "2027-01-28", session: null }
  ];
  const calendar = [{ date: "2026-11-02", epsEstimate: 1.76, revenueEstimate: 101e9, hour: "amc" }];
  const out = earningsTimeline(sec, cached, calendar, "2026-10-24");
  assert.deepEqual(out.map((r) => [r.date, r.source, r.upcoming]), [["2026-07-30", "sec", false], ["2026-09-02", "calendar", false], ["2026-11-02", "calendar", true]]);
  assert.equal(out[2].epsEstimate, 1.76);
  assert.equal(out[2].epsActual, null);
});

test("tickers to CIKs: ten digits, class shares with a dot as Alpaca writes them", () => {
  const m = cikMap({ 0: { cik_str: 320193, ticker: "AAPL" }, 1: { cik_str: 1067983, ticker: "BRK-B" }, 2: { ticker: "X" } });
  assert.equal(m.get("AAPL"), "0000320193");
  assert.equal(m.get("BRK.B"), "0001067983");
  assert.equal(m.size, 2);
});

test("the next report keeps the calendar's part of the day, with the company's habit beside it when they differ", () => {
  const sec = ["2026-01-13", "2026-04-14", "2026-07-14", "2026-10-13"].map((date) => ({ date, at: 1, session: "bmo" as const, upcoming: false, source: "sec" as const }));
  const out = earningsTimeline(sec, [{ report_date: "2027-01-14", session: "amc" }], [], "2026-10-24");
  assert.equal(out.at(-1)!.session, "amc");
  assert.equal(out.at(-1)!.usualSession, "bmo");
  const agrees = earningsTimeline(sec, [{ report_date: "2027-01-14", session: "bmo" }], [], "2026-10-24");
  assert.equal(agrees.at(-1)!.usualSession, undefined);
});
