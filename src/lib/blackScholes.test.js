import test from "node:test";
import assert from "node:assert/strict";
import { bsPrice, impliedVol, tteYears, RISK_FREE } from "./blackScholes.js";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

// ---------------------------------------------------------------------------
// The boundary that makes one function serve every date
// ---------------------------------------------------------------------------

test("at expiry the model IS intrinsic value", () => {
  // This is what lets a calendar be priced by the same call that prices a
  // vertical: set the date past a leg's expiry and the formula stops being a
  // model and becomes arithmetic.
  near(bsPrice(370, 350, 0, RISK_FREE, 0.4, false), 0);
  near(bsPrice(340, 350, 0, RISK_FREE, 0.4, false), 10);
  near(bsPrice(370, 350, 0, RISK_FREE, 0.4, true), 20);
  near(bsPrice(340, 350, 0, RISK_FREE, 0.4, true), 0);
  // A negative time to expiry is a date already past, not an error.
  near(bsPrice(340, 350, -1, RISK_FREE, 0.4, false), 10);
});

test("with no volatility there is no time value", () => {
  near(bsPrice(340, 350, 1, RISK_FREE, 0, false), 10);
});

// ---------------------------------------------------------------------------
// The model itself
// ---------------------------------------------------------------------------

test("an option with time left is worth more than its intrinsic value", () => {
  const atm = bsPrice(350, 350, 0.5, RISK_FREE, 0.4, false);
  assert.ok(atm > 0, "an at-the-money put with six months left is not worthless");
  const itm = bsPrice(340, 350, 0.5, RISK_FREE, 0.4, false);
  assert.ok(itm > atm, "deeper in the money is worth more");
  // ...but a put's time value does not make it worth more than the strike.
  assert.ok(bsPrice(0.01, 350, 0.5, RISK_FREE, 0.4, false) < 350);
});

test("put-call parity holds", () => {
  // C - P = S - K·e^(-rT). If this breaks, the two sides of every chain
  // disagree and so does every spread drawn from them.
  const S = 365, K = 350, T = 0.75, v = 0.42;
  const c = bsPrice(S, K, T, RISK_FREE, v, true);
  const p = bsPrice(S, K, T, RISK_FREE, v, false);
  near(c - p, S - K * Math.exp(-RISK_FREE * T), 1e-6);
});

test("implied volatility round-trips through the price", () => {
  const S = 365, K = 350, T = 0.75, v = 0.42;
  const price = bsPrice(S, K, T, RISK_FREE, v, false);
  near(impliedVol(price, S, K, T, RISK_FREE, false), v, 1e-4);
});

test("an unreachable price falls back to 0.25 rather than inventing a number", () => {
  // The same fallback the scanner uses. A crossed or stale quote must not
  // produce a 400% volatility that then prices a whole curve.
  assert.equal(impliedVol(0, 365, 350, 0.5, RISK_FREE, false), 0.25);
  assert.equal(impliedVol(400, 365, 350, 0.5, RISK_FREE, false), 0.25);
  assert.equal(impliedVol(5, 365, 350, 0, RISK_FREE, false), 0.25);
});

// ---------------------------------------------------------------------------
// tteYears
// ---------------------------------------------------------------------------

test("time to expiry is measured to the close on the day", () => {
  const from = Date.parse("2026-09-16T20:00:00Z");
  near(tteYears("2026-09-16", from), 0);
  // 365.25 days later is one year, near enough.
  near(tteYears("2027-09-16", from), 365 / 365.25, 1e-3);
});

test("a date already past is zero, never negative", () => {
  assert.equal(tteYears("2020-01-01", Date.parse("2026-09-16T20:00:00Z")), 0);
  assert.equal(tteYears(null), 0);
  assert.equal(tteYears("not-a-date"), 0);
});
