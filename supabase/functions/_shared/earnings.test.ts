import test from "node:test";
import assert from "node:assert/strict";
import { fetchSlice, PROVIDER_CAP } from "./earnings.ts";

const rows = (n: number, date: string) =>
  Array.from({ length: n }, (_, i) => ({ symbol: `S${date}${i}`, reportDate: date, session: null }));

test("a slice under the cap is taken as it is, and whole", async () => {
  const calls: string[] = [];
  const r = await fetchSlice("2026-11-02", "2026-11-08", async (f, t) => { calls.push(`${f}..${t}`); return rows(900, f); });
  assert.equal(r.events.length, 900);
  assert.equal(r.complete, true);
  assert.deepEqual(calls, ["2026-11-02..2026-11-08"]);
});

test("a slice at the cap is walked again a day at a time", async () => {
  // The week of 2 Nov 2026 came back at the cap: its earliest days were cut.
  const calls: string[] = [];
  const r = await fetchSlice("2026-11-02", "2026-11-08", async (f, t) => {
    calls.push(`${f}..${t}`);
    return f === t ? rows(300, f) : rows(PROVIDER_CAP, f);
  });
  assert.equal(calls.length, 8);
  assert.equal(r.events.length, 7 * 300);
  assert.equal(r.complete, true);
});

test("a single day still at the cap is reported incomplete, so nothing is deleted on it", async () => {
  const r = await fetchSlice("2026-11-02", "2026-11-03", async (f, t) =>
    f === t && f === "2026-11-03" ? rows(PROVIDER_CAP, f) : rows(f === t ? 10 : PROVIDER_CAP, f));
  assert.equal(r.complete, false);
  assert.equal((await fetchSlice("2026-11-03", "2026-11-03", async () => rows(PROVIDER_CAP, "2026-11-03"))).complete, false);
});

import { currentReports } from "./earnings.ts";

test("a moved report: the most recently fetched date wins, the old ones are set aside", () => {
  // INTC on staging, 13 Oct 2026. Intel confirmed the 29th on 6 Oct.
  const rows = [
    { symbol: "INTC", report_date: "2026-10-21", session: "amc", fetched_at: "2026-09-23T14:06:05Z" },
    { symbol: "INTC", report_date: "2026-10-22", session: "amc", fetched_at: "2026-10-05T18:34:59Z" },
    { symbol: "INTC", report_date: "2026-10-29", session: "amc", fetched_at: "2026-10-12T14:07:10Z" }
  ];
  assert.deepEqual(currentReports(rows).map((r) => r.report_date), ["2026-10-29"]);
});

test("next quarter's report is a different report, and is kept", () => {
  const rows = [
    { symbol: "INTC", report_date: "2026-10-29", session: "amc", fetched_at: "2026-10-12T14:07:10Z" },
    { symbol: "INTC", report_date: "2027-01-28", session: "amc", fetched_at: "2026-09-01T10:00:00Z" },
    { symbol: "AMZN", report_date: "2026-10-28", session: "amc", fetched_at: "2026-09-28T13:51:17Z" },
    { symbol: "AMZN", report_date: "2026-10-29", session: "amc", fetched_at: "2026-10-12T14:07:10Z" }
  ];
  const out = currentReports(rows).map((r) => `${r.symbol} ${r.report_date}`).sort();
  assert.deepEqual(out, ["AMZN 2026-10-29", "INTC 2026-10-29", "INTC 2027-01-28"]);
});
