import test from "node:test";
import assert from "node:assert/strict";
import { allocateCallCover, coveredByShares } from "./callCover.ts";

const call = (symbol: string, ticker: string, strike: number, qty: number, expiry: string, adjusted = false) => ({
  symbol, ticker, type: "C", strike, qty, expiry, adjusted
});

test("a long call covers a short one regardless of strike", () => {
  // The failure this rule was written for: long 352.50 under short 375 is a
  // spread, and counting shares alone called it naked with unlimited risk.
  const { bySymbol } = allocateCallCover(
    [call("L", "TSLA", 352.5, 1, "260919"), call("S", "TSLA", 375, -1, "260919")],
    {}
  );
  assert.equal(bySymbol.S.uncovered, 0);
  assert.equal(bySymbol.S.coveredByLongs, 1);
  assert.equal(bySymbol.S.fromShares, 0);
});

test("a long that expires before the short does not cover it", () => {
  const { bySymbol } = allocateCallCover(
    [call("L", "TSLA", 352.5, 1, "260904"), call("S", "TSLA", 375, -1, "260919")],
    {}
  );
  assert.equal(bySymbol.S.uncovered, 1);
});

test("shares cover what the longs did not, a hundred per contract", () => {
  const { bySymbol, sharesLeft } = allocateCallCover(
    [call("L", "TSLA", 350, 1, "260919"), call("S", "TSLA", 375, -3, "260919")],
    { TSLA: 210 }
  );
  assert.equal(bySymbol.S.coveredByLongs, 1);
  assert.equal(bySymbol.S.fromShares, 2);
  assert.equal(bySymbol.S.uncovered, 0);
  assert.equal(sharesLeft.TSLA, 10, "the ten shares nothing claimed stay free");
});

test("cover is counted per contract, so partial cover is partial", () => {
  // Ten short calls against a hundred shares are ONE covered call and NINE
  // naked ones. Both halves have to survive: naming the whole leg naked hides
  // a covered contract, naming it covered hides nine unbounded ones.
  const { bySymbol } = allocateCallCover([call("S", "AAPL", 250, -10, "260919")], { AAPL: 100 });
  assert.equal(bySymbol.S.contracts, 10);
  assert.equal(bySymbol.S.covered, 1);
  assert.equal(bySymbol.S.uncovered, 9);
});

test("the shortest-dated short has the first claim on one long", () => {
  const { bySymbol } = allocateCallCover(
    [
      call("L", "MU", 100, 1, "261017"),
      call("LATE", "MU", 120, -1, "261017"),
      call("SOON", "MU", 120, -1, "260919")
    ],
    {}
  );
  assert.equal(bySymbol.SOON.uncovered, 0, "the one running out of time first is covered");
  assert.equal(bySymbol.LATE.uncovered, 1);
});

test("an adjusted short call is unjudged, not naked and not covered", () => {
  const { bySymbol } = allocateCallCover([call("S1", "AAPL", 250, -1, "260919", true)], { AAPL: 1000 });
  assert.equal(bySymbol.S1.judged, false);
  assert.equal(bySymbol.S1.covered, 0);
  assert.equal(bySymbol.S1.uncovered, 0, "zero here means nothing; judged is the field to read");
});

test("an adjusted contract consumes no cover, so the shares stay with the ones we can read", () => {
  const { bySymbol } = allocateCallCover(
    [call("ADJ", "AAPL", 250, -1, "260919", true), call("PLAIN", "AAPL", 260, -1, "260919")],
    { AAPL: 100 }
  );
  assert.equal(bySymbol.ADJ.judged, false);
  assert.equal(bySymbol.PLAIN.fromShares, 1, "the hundred shares went to the contract that could use them");
  assert.equal(bySymbol.PLAIN.uncovered, 0);
});

test("an adjusted LONG is not counted as cover either", () => {
  const { bySymbol } = allocateCallCover(
    [call("L", "AAPL", 240, 1, "260919", true), call("S", "AAPL", 250, -1, "260919")],
    {}
  );
  assert.equal(bySymbol.S.uncovered, 1);
});

test("a long is spent once, not once per short", () => {
  const { bySymbol } = allocateCallCover(
    [call("L", "NVDA", 200, 1, "260919"), call("A", "NVDA", 220, -1, "260919"), call("B", "NVDA", 230, -1, "260919")],
    {}
  );
  const covered = bySymbol.A.coveredByLongs + bySymbol.B.coveredByLongs;
  assert.equal(covered, 1);
  assert.equal(bySymbol.A.uncovered + bySymbol.B.uncovered, 1);
});

test("cover does not cross tickers", () => {
  const { bySymbol } = allocateCallCover(
    [call("L", "MSFT", 400, 5, "260919"), call("S", "NVDA", 220, -1, "260919")],
    { MSFT: 1000 }
  );
  assert.equal(bySymbol.S.uncovered, 1);
});

test("coveredByShares is the hundred-per-contract rule, written once", () => {
  assert.equal(coveredByShares(10, 100), 1);
  assert.equal(coveredByShares(10, 99), 0);
  assert.equal(coveredByShares(2, 210), 2);
  assert.equal(coveredByShares(3, 210), 2);
  assert.equal(coveredByShares(1, 0), 0);
});
