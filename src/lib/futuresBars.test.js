import { test } from "node:test";
import assert from "node:assert/strict";
import { dbCandle, parseRows, rollUp, sessionDays, utcDays, byUtcDay, nyParts } from "../../supabase/functions/_shared/futuresBars.js";

const row = (iso, o, h, l, c, v = 10) => JSON.stringify({ hd: { ts_event: iso, rtype: 33 }, open: String(o), high: String(h), low: String(l), close: String(c), volume: v, symbol: "ES.v.0" });
const t = (iso) => Math.floor(Date.parse(iso) / 1000);

test("Databento rows become candles, bad rows dropped, one per time, oldest first", () => {
  const text = [
    row("2026-11-23T14:31:00.000000000Z", 5001, 5002, 5000.5, 5001.75),
    row("2026-11-23T14:30:00.000000000Z", 5000, 5001.25, 4999.75, 5001),
    "not json",
    JSON.stringify({ hd: { ts_event: "2026-11-23T14:32:00Z" }, open: "0", high: "1", low: "1", close: "1" })
  ].join("\n");
  const c = parseRows(text);
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { time: t("2026-11-23T14:30:00Z"), open: 5000, high: 5001.25, low: 4999.75, close: 5001, volume: 10 });
  assert.equal(dbCandle({ ts_event: "1763908200000000000", open: 1, high: 1, low: 1, close: 1 }).time, 1763908200);
});

test("minutes roll up into half hours", () => {
  const m = [0, 60, 1740, 1800].map((s, i) => ({ time: t("2026-11-23T14:30:00Z") + s, open: 10 + i, high: 20 + i, low: 5 - i, close: 11 + i, volume: 1 }));
  const h = rollUp(m, 1800);
  assert.equal(h.length, 2);
  assert.deepEqual(h[0], { time: t("2026-11-23T14:30:00Z"), open: 10, high: 22, low: 3, close: 13, volume: 3 });
});

test("a daily candle is the CME session from 18:00 New York the day before", () => {
  const hours = [
    ["2026-11-22T23:00:00Z", 100], // Sunday 18:00 New York: Monday's session
    ["2026-11-23T21:00:00Z", 101], // Monday 16:00
    ["2026-11-23T22:00:00Z", 999], // Monday 17:00: the halt, no trade date
    ["2026-11-23T23:00:00Z", 102] // Monday 18:00: Tuesday's session
  ].map(([iso, p]) => ({ time: t(iso), open: p, high: p, low: p, close: p, volume: 1 }));
  const d = sessionDays(hours);
  assert.deepEqual(d.map((x) => [new Date(x.time * 1000).toISOString().slice(0, 10), x.open, x.close]), [["2026-11-23", 100, 101], ["2026-11-24", 102, 102]]);
});

test("UTC days and New York time", () => {
  assert.deepEqual(utcDays(t("2026-11-22T23:00:00Z"), t("2026-11-24T01:00:00Z")), ["2026-11-22", "2026-11-23", "2026-11-24"]);
  assert.deepEqual([...byUtcDay([{ time: t("2026-11-23T01:00:00Z") }]).keys()], ["2026-11-23"]);
  assert.deepEqual(nyParts(t("2026-11-23T23:05:00Z")), { day: "2026-11-23", minutes: 18 * 60 + 5 });
  assert.deepEqual(nyParts(t("2026-07-06T22:05:00Z")), { day: "2026-07-06", minutes: 18 * 60 + 5 }); // summer time
});
