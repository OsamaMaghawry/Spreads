// The guards that should have stopped the JPM spread from ever being offered.
//
//   node --experimental-strip-types --test supabase/functions/_shared/optionScan.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { buildSetup, impliedSpotFromParity } from "./optionScan.ts";

const EXPIRY = "2026-08-28";

// A put chain around JPM's real price. Deltas are irrelevant to these guards —
// nearestDelta just has to pick something — so they are left rough.
const put = (strike, bid, ask, delta) => ({
  symbol: `JPM260828P00${String(strike * 1000).padStart(8, "0")}`,
  strike, bid, ask, mid: (bid + ask) / 2, delta
});

const PUTS = [
  put(350.0, 0.55, 0.75, -0.11),
  put(352.5, 1.06, 1.35, -0.18),
  put(355.0, 1.87, 2.65, -0.26),
  put(357.5, 3.4, 4.1, -0.42)
];

const base = { ticker: "JPM", expiry: EXPIRY, strategy: "put_spread", calls: [], targetDelta: 0.26, wingWidth: 2.5 };

test("the incident: a short strike through spot is refused, not offered", () => {
  // Spot as it really was. The 355 short is $0.67 in the money.
  const r: any = buildSetup({ ...base, spot: 354.33, puts: PUTS });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Short put \$355 is already through the spot price \$354\.33/);
});

test("the same setup was offered because the spot was wrong", () => {
  // $363.54 — the number the dialog showed. Nothing about the option data
  // changed; only the stock price did, and that alone made it look sellable.
  const r: any = buildSetup({ ...base, spot: 363.54, puts: PUTS });
  assert.equal(r.ok, true, "this is why the guard has to sit on spot, not on the legs");
  assert.equal(r.setup.legs[0].strike, 355);
});

test("an ordinary out-of-the-money spread still builds", () => {
  const r: any = buildSetup({ ...base, spot: 360.0, puts: PUTS, targetDelta: 0.18, wingWidth: 2.5 });
  assert.equal(r.ok, true);
  assert.equal(r.setup.legs[0].strike, 352.5);
  assert.equal(r.setup.legs[1].strike, 350);
  assert.equal(Math.round(r.setup.credit * 100) / 100, 0.31);
});

test("selling through the money is possible when explicitly asked for", () => {
  const r: any = buildSetup({ ...base, spot: 354.33, puts: PUTS, allowItmShort: true });
  assert.equal(r.ok, true, "the guard is a default, not a prohibition");
});

test("spot provenance travels with the setup so the dialog can show it", () => {
  const r: any = buildSetup({
    ...base,
    spot: { price: 360.0, source: "trade", asOf: 1756300000000, trusted: true },
    puts: PUTS,
    targetDelta: 0.18
  });
  assert.equal(r.setup.spot, 360.0);
  assert.equal(r.setup.spotSource, "trade");
  assert.equal(r.setup.spotAsOf, 1756300000000);
});

// ---------------------------------------------------------------------------
// Put-call parity: the one witness to spot that is not the stock feed
// ---------------------------------------------------------------------------

const call = (strike, bid, ask) => ({ strike, bid, ask, mid: (bid + ask) / 2 });

test("the chain's implied spot is derived from the options, not the feed", () => {
  // Built so C - P + K = 360 at every strike.
  const calls = [call(355, 5.2, 5.4), call(357.5, 3.3, 3.5), call(360, 1.9, 2.1)];
  const puts = [
    { strike: 355, mid: 0.3 - 0.0 + 0.3, bid: 0, ask: 0 },
    { strike: 357.5, mid: 2.9, bid: 0, ask: 0 },
    { strike: 360, mid: 2.0, bid: 0, ask: 0 }
  ];
  const implied = impliedSpotFromParity(puts, calls, EXPIRY);
  assert.ok(implied > 355 && implied < 362, `implied spot ${implied} should sit near the chain's level`);
});

test("a feed price the option chain contradicts is refused", () => {
  const calls = [call(355, 5.2, 5.4), call(357.5, 3.3, 3.5), call(360, 1.9, 2.1)];
  const puts = [
    { strike: 355, mid: 0.6, bid: 0.5, ask: 0.7, delta: -0.1, symbol: "a" },
    { strike: 357.5, mid: 2.9, bid: 2.8, ask: 3.0, delta: -0.3, symbol: "b" },
    { strike: 360, mid: 2.0, bid: 1.9, ask: 2.1, delta: -0.4, symbol: "c" }
  ];
  const r: any = buildSetup({
    ...base, strategy: "iron_condor", spot: 400, puts, calls, targetDelta: 0.3, wingWidth: 2.5
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /option chain implies a spot of/);
});

test("parity is skipped when only one side of the chain was fetched", () => {
  // A put spread never fetches calls, so there is nothing to cross-check
  // against and the check must not fire spuriously.
  assert.equal(impliedSpotFromParity(PUTS, [], EXPIRY), null);
  const r: any = buildSetup({ ...base, spot: 360, puts: PUTS, targetDelta: 0.18 });
  assert.equal(r.ok, true);
});
