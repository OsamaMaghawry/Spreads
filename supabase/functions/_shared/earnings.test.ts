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
