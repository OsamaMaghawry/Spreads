import test from "node:test";
import assert from "node:assert/strict";
import { sharesByTicker, nakedShortCalls, unjudgedShortCalls, sessionPhase, judgeOnLivePrices } from "./watchRules.ts";

// A naked short call is the one position with no maximum loss, and the one
// the dashboard's pairing used to hide. The watch's rule for it shipped as a
// call to a helper that did not exist; every account then failed as
// "unreadable". These tests pin the helper and the rule down.

const occ = (ticker: string, strike: number, type: string, expiry = "2026-09-18") => ({ ticker, strike, type, expiryFormatted: expiry });
const leg = (ticker: string, strike: number, type: string, qty: number, expiry?: string) =>
  ({ symbol: `${ticker}${strike}${type}${expiry ? expiry.slice(5) : ""}`, occ: occ(ticker, strike, type, expiry), qty });

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

test("a partially covered short call is reported as naked, with how much is uncovered", () => {
  const out = nakedShortCalls([leg("AAPL", 200, "C", -3)], { AAPL: 200 });
  assert.equal(out.length, 1);
  assert.equal(out[0].shares, 200);
  assert.equal(out[0].uncovered, 1);
  assert.equal(out[0].coveredByShares, 2);
});

test("the short call of a call credit spread is covered by its long, not naked", () => {
  // The production incident: six call spreads on one account, six false criticals.
  const out = nakedShortCalls([leg("MSFT", 512.5, "C", -2), leg("MSFT", 520, "C", 2)], {});
  assert.deepEqual(out, []);
});

test("a long call expiring later still covers; one expiring earlier does not", () => {
  const later = nakedShortCalls([leg("NVDA", 230, "C", -3, "2026-09-04"), leg("NVDA", 240, "C", 3, "2026-09-18")], {});
  assert.deepEqual(later, []);
  const earlier = nakedShortCalls([leg("NVDA", 230, "C", -3, "2026-09-18"), leg("NVDA", 240, "C", 3, "2026-09-04")], {});
  assert.equal(earlier.length, 1);
  assert.equal(earlier[0].uncovered, 3);
});

test("longs and shares combine, and each long covers only one short contract", () => {
  const out = nakedShortCalls([leg("AAPL", 200, "C", -3), leg("AAPL", 210, "C", 1)], { AAPL: 100 });
  assert.equal(out.length, 1);
  assert.equal(out[0].coveredByLongs, 1);
  assert.equal(out[0].coveredByShares, 1);
  assert.equal(out[0].uncovered, 1);
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

// The session clock. Ten of the session watch's thirty-six daily runs fall
// outside 13:30–20:00 UTC, and judging those on live prices is what produced
// the "price not trusted" mail — so which side of the bell we are on decides
// which price the watch believes.
test("sessionPhase: the bell, from both sides", () => {
  const at = (h: number, m: number, day = 4) => {
    // 2026-09-03 is a Thursday; 05/06 Sep are Sat/Sun.
    const d = new Date(Date.UTC(2026, 8, day, h, m, 0));
    return sessionPhase(d);
  };
  assert.equal(at(12, 59), "pre", "before the pre-open runs even start");
  assert.equal(at(13, 0), "pre", "the 13:00 run — the market has not opened");
  assert.equal(at(13, 15), "pre", "the 13:15 run, the other half of the morning batch");
  assert.equal(at(13, 29), "pre");
  assert.equal(at(13, 30), "open", "the bell");
  assert.equal(at(16, 0), "open");
  assert.equal(at(19, 59), "open", "the last minute of the session");
  assert.equal(at(20, 0), "post", "the close — everything after here is stale by design");
  assert.equal(at(20, 30), "post", "the batch that actually reached the inbox");
  assert.equal(at(21, 45), "post");
});

test("sessionPhase: nothing has traded over a weekend", () => {
  assert.equal(sessionPhase(new Date(Date.UTC(2026, 8, 5, 16, 0))), "closed", "Saturday midday");
  assert.equal(sessionPhase(new Date(Date.UTC(2026, 8, 6, 16, 0))), "closed", "Sunday midday");
});

test("judgeOnLivePrices only inside the session", () => {
  assert.equal(judgeOnLivePrices(new Date(Date.UTC(2026, 8, 3, 16, 0))), true);
  assert.equal(judgeOnLivePrices(new Date(Date.UTC(2026, 8, 3, 13, 0))), false, "pre-open");
  assert.equal(judgeOnLivePrices(new Date(Date.UTC(2026, 8, 3, 20, 30))), false, "after the close");
  assert.equal(judgeOnLivePrices(new Date(Date.UTC(2026, 8, 5, 16, 0))), false, "weekend");
});

// --- Adjusted contracts: the watch refuses to judge them --------------------

const adjustedLeg = (ticker: string, strike: number, qty: number, expiry = "2026-09-18") => ({
  symbol: `${ticker}${strike}C-adj`,
  occ: { ticker, strike, type: "C", expiryFormatted: expiry, adjusted: true },
  qty
});

test("an adjusted short call raises no naked critical", () => {
  // 100 shares behind one adjusted contract answers nothing: the contract no
  // longer delivers 100 shares. Running the arithmetic anyway answers in the
  // alarming direction and pages the owner about a position that may be
  // perfectly covered.
  const legs = [adjustedLeg("AAPL", 250, -1)];
  assert.deepEqual(nakedShortCalls(legs, { AAPL: 0 }), []);
  assert.deepEqual(nakedShortCalls(legs, { AAPL: 100 }), []);
});

test("an adjusted short call is reported as unjudged instead", () => {
  const out = unjudgedShortCalls([adjustedLeg("AAPL", 250, -2)], {});
  assert.equal(out.length, 1);
  assert.equal(out[0].contracts, 2);
  assert.equal(out[0].occ.ticker, "AAPL");
});

test("a plain short call is still judged, and still fires", () => {
  const out = nakedShortCalls([leg("NVDA", 220, "C", -1)], {});
  assert.equal(out.length, 1);
  assert.equal(out[0].uncovered, 1);
  assert.deepEqual(unjudgedShortCalls([leg("NVDA", 220, "C", -1)], {}), []);
});

test("the watch and the dashboard allocate cover the same way", () => {
  // Both read allocateCallCover now. This is the case that made them
  // disagree on a live account: a long call below a short one.
  const legs = [leg("TSLA", 352.5, "C", 1), leg("TSLA", 375, "C", -1)];
  assert.deepEqual(nakedShortCalls(legs, {}), []);
});

// Found by the 22 Oct 2026 trading audit: the window was fixed at 13:30-20:00
// UTC, which is New York's session only in summer. From Mon 2 Nov 2026 the last
// trading hour (15:00-16:00 ET = 20:00-21:00 UTC) read as "post".
test("sessionPhase: winter time — the session is 14:30-21:00 UTC", () => {
  const at = (h: number, m: number) => sessionPhase(new Date(Date.UTC(2026, 10, 2, h, m, 0))); // Mon 2 Nov, EST
  assert.equal(at(14, 0), "pre", "09:00 ET, before the bell");
  assert.equal(at(14, 30), "open", "the bell, 09:30 ET");
  assert.equal(at(20, 30), "open", "15:30 ET is the last hour, not after the close");
  assert.equal(at(20, 59), "open");
  assert.equal(at(21, 0), "post", "16:00 ET");
});

test("sessionPhase: the clock-change day itself", () => {
  // Sun 1 Nov 2026 is the changeover; Mon 26 Oct is still daylight time.
  assert.equal(sessionPhase(new Date(Date.UTC(2026, 9, 26, 13, 30))), "open", "09:30 EDT");
  assert.equal(sessionPhase(new Date(Date.UTC(2026, 9, 26, 20, 30))), "post", "16:30 EDT");
});
