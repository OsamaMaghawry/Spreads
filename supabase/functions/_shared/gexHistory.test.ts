import { test } from "node:test";
import assert from "node:assert/strict";
import { occParts, bsPrice, impliedVol, csvObjects, openInterestOf, quotesOf, historyChain, historySummary } from "./gexHistory.ts";
import { closeOf, YEAR_MS } from "./gex.js";

test("OCC symbols: root, expiry, side and strike", () => {
  assert.deepEqual(occParts("TSLA  261106C00500000"), { root: "TSLA", expiry: "2026-11-06", call: true, strike: 500 });
  assert.deepEqual(occParts("SPY   270115P00560500"), { root: "SPY", expiry: "2027-01-15", call: false, strike: 560.5 });
  assert.equal(occParts("TSLA"), null);
});

test("Black-Scholes: a textbook price, put-call parity, and the volatility found again from the price", () => {
  const c = bsPrice(100, 100, 1, 0.2, true, 0.05);
  assert.ok(Math.abs(c - 10.4506) < 0.001, String(c));
  const p = bsPrice(100, 100, 1, 0.2, false, 0.05);
  assert.ok(Math.abs(c - p - (100 - 100 * Math.exp(-0.05))) < 1e-6);
  for (const [k, call, iv] of [[90, true, 0.35], [110, false, 0.6], [100, true, 1.2]] as const) {
    const price = bsPrice(250, k * 2.5, 30 / 365, iv, call);
    assert.ok(Math.abs(impliedVol(price, 250, k * 2.5, 30 / 365, call) - iv) < 1e-4, `${k} ${call}`);
  }
  // Below what it is worth at once: no volatility gives it.
  assert.equal(impliedVol(5, 300, 250, 30 / 365, true), 0);
  assert.equal(impliedVol(0, 300, 250, 30 / 365, true), 0);
});

test("Databento CSV read by its header; open interest only, largest kept; quotes last kept", () => {
  const stats = csvObjects([
    "ts_recv,ts_event,rtype,publisher_id,instrument_id,ts_ref,price,quantity,sequence,ts_in_delta,stat_type,channel_id,update_action,stat_flags,symbol",
    "x,2026-11-06T11:30:00.58Z,24,108,1,,,3943,1,0,9,81,1,0,TSLA  261120C00450000",
    "x,2026-11-06T11:30:00.59Z,24,108,1,,,3950,2,0,9,81,1,0,TSLA  261120C00450000",
    "x,2026-11-06T11:30:00.57Z,24,108,2,,,120,3,0,9,81,1,0,TSLA  261120P00400000",
    "x,2026-11-06T21:40:45Z,24,21,2,,0,2147483647,4,0,11,81,1,0,TSLA  261120P00400000",
    ""
  ].join("\n"));
  const { oi, published } = openInterestOf(stats);
  assert.deepEqual([...oi.entries()], [["TSLA  261120C00450000", 3950], ["TSLA  261120P00400000", 120]]);
  assert.equal(published, "2026-11-06T11:30:00.57Z");
  const quotes = quotesOf(csvObjects("ts_recv,bid_px_00,ask_px_00,symbol\nx,10.1,10.3,A\nx,10.2,10.4,A\nx,,0.05,B"));
  assert.deepEqual(quotes.get("A"), { bid: 10.2, ask: 10.4 });
  assert.deepEqual(quotes.get("B"), { bid: 0, ask: 0.05 });
});

test("a past day's chain: within 90 days and 20% of the price, volatility from the closing midpoint", () => {
  const day = "2026-11-06";
  const at = closeOf(day) - 2 * 60000;
  const spot = 450;
  const years = (closeOf("2026-11-20") - at) / YEAR_MS;
  const mid = bsPrice(spot, 460, years, 0.55, true);
  const oi = new Map([
    ["TSLA  261120C00460000", 5000], // counted
    ["TSLA  261120P00440000", 7000], // counted, no quote: volatility filled later
    ["TSLA  261106C00450000", 9000], // expires at today's close, after `at`: counted
    ["TSLA  261030C00450000", 9000], // expired
    ["TSLA  261120C00600000", 9000], // 33% away
    ["TSLA  270320C00460000", 9000], // beyond 90 days
    ["TSLL  261120C00460000", 9000], // another root
    ["TSLA  261120C00470000", 0] // nothing open
  ]);
  const quotes = new Map([["TSLA  261120C00460000", { bid: mid - 0.05, ask: mid + 0.05 }], ["TSLA  261106C00450000", { bid: 1, ask: 1.2 }]]);
  const chain = historyChain({ symbol: "TSLA", spot, at, oi, quotes, published: "2026-11-06T11:30:00Z" });
  assert.deepEqual(chain.expiries, ["2026-11-06", "2026-11-20"]);
  assert.equal(chain.rows.length, 3);
  const call = chain.rows.find((r) => r[0] === 460)!;
  assert.deepEqual(call.slice(0, 4), [460, 1, 1, 5000]);
  assert.ok(Math.abs(call[4] - 0.55) < 0.002, String(call[4]));
  assert.equal(chain.rows.find((r) => r[0] === 440)![4], 0);
  assert.equal(chain.counts.noQuote, 1);

  const s: any = historySummary(chain);
  // The contract expiring at that day's close, at the money, has the most gamma (as on the live page).
  assert.equal(s.windows.month.callWall, 450);
  assert.equal(s.windows.nearest.contracts, 1);
  assert.equal(s.windows.month.putWall, 440);
  assert.equal(s.filled, 1); // the put took its expiry's median
  assert.equal(s.expiries.length, 2);
});
