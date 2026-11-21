import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FUTURES, PARENT, futuresSpec, ticksBetween, roundToTick, futuresPL, cmeTradeDate, cmeOpenAt, cmeClosures
} from "../../supabase/functions/_shared/futuresSpecs.js";

// Contract sizes as CME publishes them (cmegroup.com contract specs).
test("each contract's tick value is its point value times its tick", () => {
  const expect = {
    ES: 12.5, MES: 1.25, NQ: 5, MNQ: 0.5, YM: 5, MYM: 0.5, RTY: 5, M2K: 0.5, EMD: 10,
    CL: 10, QM: 12.5, MCL: 1, NG: 10, QG: 12.5, MNG: 1, RB: 4.2, HO: 4.2,
    GC: 10, QO: 12.5, MGC: 1, SI: 25, QI: 31.25, SIL: 5, HG: 12.5, MHG: 1.25, PL: 5,
    "6E": 6.25, E7: 6.25, M6E: 1.25, "6B": 6.25, M6B: 0.625, "6J": 6.25, J7: 6.25, "6A": 5, M6A: 1, "6C": 5, "6S": 6.25,
    ZT: 7.8125, ZF: 7.8125, ZN: 15.625, ZB: 31.25, UB: 31.25,
    ZC: 12.5, XC: 1.25, ZS: 12.5, XK: 1.25, ZW: 12.5, XW: 1.25, LE: 10, GF: 12.5, HE: 10,
    BTC: 25, MBT: 0.5, ETH: 25, MET: 0.05
  };
  assert.deepEqual(Object.keys(FUTURES).sort(), Object.keys(expect).sort());
  for (const [root, tv] of Object.entries(expect)) assert.equal(FUTURES[root].tickValue, tv, root);
});

test("each mini and micro is the stated fraction of its full-size contract", () => {
  for (const [root, [parent, n]] of Object.entries(PARENT)) {
    assert.equal(FUTURES[root].pointValue * n, FUTURES[parent].pointValue, root);
    assert.notEqual(FUTURES[root].size, "standard", root);
  }
});

test("a symbol names its contract however it is written", () => {
  for (const s of ["ES", "/ES", "es", "ES1!", "ESZ6", "ESZ26"]) assert.equal(futuresSpec(s)?.root, "ES", s);
  assert.equal(futuresSpec("M2KH7")?.root, "M2K");
  assert.equal(futuresSpec("MNQ")?.root, "MNQ");
  assert.equal(futuresSpec("6EH7")?.root, "6E");
  assert.equal(futuresSpec("M6EH7")?.root, "M6E");
  assert.equal(futuresSpec("ZNH7")?.root, "ZN");
  assert.equal(futuresSpec("/MBT")?.root, "MBT");
  assert.equal(futuresSpec("AAPL"), null);
  assert.equal(futuresSpec("ESA6"), null); // A is not a month code
  assert.equal(futuresSpec(""), null);
});

test("money is counted in whole ticks", () => {
  const { ES, MNQ, CL, GC } = FUTURES;
  assert.equal(futuresPL(5000, 5001.25, 1, ES), 62.5); // 5 ticks x $12.50
  assert.equal(futuresPL(5001.25, 5000, 1, ES), -62.5);
  assert.equal(futuresPL(5000, 5001.25, -1, ES), -62.5); // short
  assert.equal(futuresPL(18000, 18002.5, 2, MNQ), 10); // 10 ticks x $0.50 x 2
  assert.equal(futuresPL(70.1, 70.3, 1, CL), 200); // 0.1 + 0.2 never leaks into dollars
  assert.equal(futuresPL(2650.3, 2649.9, 3, GC), -120);
  assert.equal(ticksBetween(70.1, 70.3, CL), 20);
});

test("prices land on the tick grid", () => {
  const { ES, CL } = FUTURES;
  assert.equal(roundToTick(5000.13, ES), 5000.25);
  assert.equal(roundToTick(5000.12, ES), 5000);
  assert.equal(roundToTick(5000.01, ES, "up"), 5000.25);
  assert.equal(roundToTick(5000.24, ES, "down"), 5000);
  assert.equal(roundToTick(5000.25, ES, "up"), 5000.25); // already on the grid
  assert.equal(roundToTick(70.105, CL, "down"), 70.1);
});

test("Globex: Sunday 18:00 to Friday 17:00, halted 17:00 to 18:00, trade date rolls at 18:00", () => {
  // Week of 23 Nov 2026 (Sunday 22 Nov).
  assert.equal(cmeTradeDate("2026-11-22", 17 * 60 + 59), null); // Sunday before the open
  assert.equal(cmeTradeDate("2026-11-22", 18 * 60 + 5), "2026-11-23"); // Sunday 18:05 is Monday's session
  assert.equal(cmeTradeDate("2026-11-23", 9 * 60 + 30), "2026-11-23");
  assert.equal(cmeTradeDate("2026-11-23", 16 * 60 + 59), "2026-11-23");
  assert.equal(cmeOpenAt("2026-11-23", 17 * 60 + 30), false); // the daily halt
  assert.equal(cmeTradeDate("2026-11-23", 18 * 60), "2026-11-24");
  assert.equal(cmeTradeDate("2026-11-27", 16 * 60 + 59), "2026-11-27"); // Friday
  assert.equal(cmeOpenAt("2026-11-27", 18 * 60), false); // Friday evening: the weekend
  assert.equal(cmeOpenAt("2026-11-28", 12 * 60), false); // Saturday
});

test("fixed closures: New Year's Day and Christmas; Good Friday is left to the bars", () => {
  assert.deepEqual([...cmeClosures(2026)].sort(), ["2026-01-01", "2026-12-25"]);
  assert.equal(cmeOpenAt("2026-12-24", 18 * 60 + 30), false); // into Christmas
  assert.equal(cmeTradeDate("2021-04-01", 20 * 60), "2021-04-02"); // Good Friday 2021 traded a short session
  // Thanksgiving trades with an early halt; the clock alone keeps it open and the bars decide.
  assert.equal(cmeTradeDate("2026-11-26", 10 * 60), "2026-11-26");
});

test("prices are shown as each contract is quoted", async () => {
  const { formatFuturesPrice } = await import("../../supabase/functions/_shared/futuresSpecs.js");
  assert.equal(formatFuturesPrice(1.08505, FUTURES["6E"]), "1.08505");
  assert.equal(formatFuturesPrice(5000.25, FUTURES.ES), "5000.25");
  assert.equal(formatFuturesPrice(70.1, FUTURES.CL), "70.10");
  assert.equal(formatFuturesPrice(110.015625, FUTURES.ZN), "110'00.5");
  assert.equal(formatFuturesPrice(110.5, FUTURES.ZN), "110'16");
  assert.equal(formatFuturesPrice(108.0078125, FUTURES.ZF), "108'00.25");
});
