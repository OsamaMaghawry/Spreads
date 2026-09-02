import test from "node:test";
import assert from "node:assert/strict";
import { sharesByTicker, nakedShortCalls } from "./watchRules.ts";

// A naked short call is the one position with no maximum loss, and the one
// the dashboard's pairing used to hide. The watch's rule for it shipped as a
// call to a helper that did not exist; every account then failed as
// "unreadable". These tests pin the helper and the rule down.

const occ = (ticker: string, strike: number, type: string) => ({ ticker, strike, type, expiryFormatted: "2026-09-18" });
const leg = (ticker: string, strike: number, type: string, qty: number) =>
  ({ symbol: `${ticker}${strike}${type}`, occ: occ(ticker, strike, type), qty });

test("sharesByTicker counts long share positions and ignores option contracts", () => {
  const positions = [
    { symbol: "AAPL", qty: "300", asset_class: "us_equity" },
    { symbol: "AAPL260918C00200000", qty: "-3", asset_class: "us_option" },
    { symbol: "MSFT", qty: "100" },
    { symbol: "TSLA", qty: "-50" } // short shares cover nothing
  ];
  assert.deepEqual(sharesByTicker(positions), { AAPL: 300, MSFT: 100 });
});

test("sharesByTicker tolerates an empty or missing list", () => {
  assert.deepEqual(sharesByTicker([]), {});
  assert.deepEqual(sharesByTicker(undefined as any), {});
});

test("a short call fully backed by shares is covered, not naked", () => {
  const out = nakedShortCalls([leg("AAPL", 200, "C", -3)], { AAPL: 300 });
  assert.deepEqual(out, []);
});

test("a short call with no shares behind it is naked", () => {
  const out = nakedShortCalls([leg("NVDA", 150, "C", -2)], {});
  assert.equal(out.length, 1);
  assert.equal(out[0].symbol, "NVDA150C");
  assert.equal(out[0].contracts, 2);
  assert.equal(out[0].shares, 0);
});

test("a partially covered short call is reported as naked", () => {
  const out = nakedShortCalls([leg("AAPL", 200, "C", -3)], { AAPL: 200 });
  assert.equal(out.length, 1);
  assert.equal(out[0].shares, 200);
});

test("shares are claimed by the first covered call, so a second short call on the same name is naked", () => {
  const out = nakedShortCalls([leg("AAPL", 200, "C", -1), leg("AAPL", 210, "C", -1)], { AAPL: 100 });
  assert.equal(out.length, 1);
  assert.equal(out[0].symbol, "AAPL210C");
});

test("short puts, long calls and share legs are never naked calls", () => {
  const out = nakedShortCalls([leg("AAPL", 180, "P", -1), leg("AAPL", 220, "C", 1), { symbol: "AAPL", qty: 100 }], {});
  assert.deepEqual(out, []);
});
