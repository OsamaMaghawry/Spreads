import test from "node:test";
import assert from "node:assert/strict";
import { allocateCallCover, coveredByShares, freeCallCover, scanCover } from "./callCover.ts";

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


// ---------------------------------------------------------------------------
// FREE cover -- what may cover a NEW short call -- from raw broker positions.
//
// The book below is the owner's live account on 23 Sep 2026 as the Positions
// tab showed it, in Alpaca's own shape (signed string qty, per-share average
// entry price), plus the one long IBIT call he bought to write against. Its
// strike and expiry are not on record here, so they are chosen for the test;
// every other line is as the broker reported it.
// ---------------------------------------------------------------------------

const LIVE_BOOK = [
  { symbol: "TSLA", qty: "100", avg_entry_price: "367.5" },
  { symbol: "TSLA260923C00390000", qty: "-1", avg_entry_price: "1.45" },
  { symbol: "TSLA260923P00362500", qty: "-1", avg_entry_price: "1.57" },
  { symbol: "TSLA270219P00370000", qty: "1", avg_entry_price: "44.02" },
  { symbol: "IBIT260925P00047000", qty: "-2", avg_entry_price: "0.18" },
  { symbol: "BMNR260925P00026500", qty: "-1", avg_entry_price: "0.20" },
  { symbol: "IBIT261218C00050000", qty: "1", avg_entry_price: "3.40" }
];

test("the owner's book: the IBIT long call is free cover, and TSLA is not", () => {
  const c = freeCallCover(LIVE_BOOK);

  // THE REPORTED FAULT. The Scanner showed TSLA and never IBIT, because it
  // counted shares and skipped every option. The long call is cover.
  assert.deepEqual(c.longsFree.IBIT, [
    { symbol: "IBIT261218C00050000", ticker: "IBIT", strike: 50, expiry: "2026-12-18", qty: 1, cost: 3.4, mark: null }
  ]);

  // THE ONE HE DID NOT REPORT. 100 TSLA shares, all of them already behind the
  // short 390C. The old scan offered a second TSLA covered call on them; the
  // second would have been naked.
  assert.equal(c.shares.TSLA, 100);
  assert.equal(c.sharesFree.TSLA, undefined);

  assert.deepEqual(c.coverTickers, ["IBIT"]);
});

test("a long PUT is not call cover, however long-dated", () => {
  // The TSLA 370P to Feb 2027 is the book's biggest option line. It protects
  // the shares; it covers no call.
  const c = freeCallCover(LIVE_BOOK);
  assert.equal(c.longsFree.TSLA, undefined);
});

test("when the short call expires, the shares behind it become free again", () => {
  const afterExpiry = LIVE_BOOK.filter((p) => p.symbol !== "TSLA260923C00390000");
  const c = freeCallCover(afterExpiry);
  assert.equal(c.sharesFree.TSLA, 100);
  assert.deepEqual(c.coverTickers, ["IBIT", "TSLA"]);
});

test("a long call already covering a short is not offered twice", () => {
  const c = freeCallCover([
    { symbol: "IBIT261218C00050000", qty: "1", avg_entry_price: "3.40" },
    { symbol: "IBIT261016C00055000", qty: "-1", avg_entry_price: "0.60" }
  ]);
  assert.equal(c.longsFree.IBIT, undefined);
  assert.deepEqual(c.coverTickers, []);
});

test("a long call expiring before a short cannot cover it, so it stays free", () => {
  // callCover's own rule: a long that dies first leaves the short bare. The
  // short is uncovered AND the long is still free cover for a nearer call.
  const c = freeCallCover([
    { symbol: "IBIT261016C00050000", qty: "1", avg_entry_price: "2.10" },
    { symbol: "IBIT261218C00055000", qty: "-1", avg_entry_price: "1.20" }
  ]);
  assert.equal(c.longsFree.IBIT?.[0]?.qty, 1);
  assert.equal(c.longsFree.IBIT?.[0]?.expiry, "2026-10-16");
});

test("two longs covering one short leave one free, contract for contract", () => {
  const c = freeCallCover([
    { symbol: "IBIT261218C00050000", qty: "2", avg_entry_price: "3.40" },
    { symbol: "IBIT261016C00055000", qty: "-1", avg_entry_price: "0.60" }
  ]);
  assert.equal(c.longsFree.IBIT?.[0]?.qty, 1);
});

test("short stock and a zero or missing qty cover nothing", () => {
  const c = freeCallCover([
    { symbol: "IBIT", qty: "-100", avg_entry_price: "50" },
    { symbol: "TSLA", qty: "0", avg_entry_price: "300" },
    { symbol: "NVDA" }
  ]);
  assert.deepEqual(c.sharesFree, {});
  assert.deepEqual(c.coverTickers, []);
});

test("an adjusted long call is not cover", () => {
  // After a corporate action the contract delivers something other than 100
  // shares, so counting it as cover for a standard short is a guess.
  const c = freeCallCover([{ symbol: "IBIT1261218C00050000", qty: "1", avg_entry_price: "3.40" }]);
  assert.deepEqual(c.coverTickers, []);
});

// "I guess you added the long calls and you removed the stocks because Tesla
// ... it's not showing up anymore." TSLA was left out on purpose; the fault
// was saying nothing. Every ticker held but spoken for comes back with a reason.
test("the owner's book: TSLA is named, with the call its shares stand behind", () => {
  const c = freeCallCover(LIVE_BOOK);
  assert.deepEqual(c.committed, [{
    ticker: "TSLA",
    reason: "Your 100 shares already cover the 390 call (2026-09-23) you sold."
  }]);
});

test("a free ticker is never listed as committed", () => {
  const c = freeCallCover(LIVE_BOOK);
  assert.ok(!c.committed.some((x) => x.ticker === "IBIT"));
  const after = freeCallCover(LIVE_BOOK.filter((p) => p.symbol !== "TSLA260923C00390000"));
  assert.deepEqual(after.committed, []);
});

test("a long call already covering a short is named, in the singular", () => {
  const c = freeCallCover([
    { symbol: "IBIT261218C00050000", qty: "1", avg_entry_price: "3.40" },
    { symbol: "IBIT261016C00055000", qty: "-1", avg_entry_price: "0.80" }
  ]);
  assert.equal(c.committed.length, 1);
  assert.match(c.committed[0].reason, /^Your long call already covers the 55 call \(2026-10-16\)/);
});

test("the long's price today travels, for the ticket chart to value it", () => {
  const c = freeCallCover([{ symbol: "IBIT261218C00050000", qty: "1", avg_entry_price: "3.40", current_price: "4.10" }]);
  assert.equal(c.longsFree.IBIT[0].mark, 4.1);
});

// "Even if I have another covered call ... just give me [it]. I need to see if I
// want to close mine and open another one before the current one expires."
test("the owner's book: the scan is given TSLA too, priced on its shares, and flagged", () => {
  const s = scanCover(freeCallCover(LIVE_BOOK));
  assert.deepEqual(s.tickers, ["IBIT", "TSLA"]);
  assert.equal(s.sharesByTicker.TSLA, 100);
  assert.match(s.inUse.TSLA, /already cover the 390 call/);
  // IBIT's long is free: priced on it, and not flagged.
  assert.equal(s.longCoverByTicker.IBIT.length, 1);
  assert.equal(s.inUse.IBIT, undefined);
});

test("a ticker with SOME free cover is sized on the free part only", () => {
  const s = scanCover(freeCallCover([
    { symbol: "TSLA", qty: "200", avg_entry_price: "360" },
    { symbol: "TSLA260923C00390000", qty: "-1", avg_entry_price: "1.45" }
  ]));
  assert.equal(s.sharesByTicker.TSLA, 100);
  assert.equal(s.inUse.TSLA, undefined);
});

test("a long call already covering a short is still offered, flagged", () => {
  const s = scanCover(freeCallCover([
    { symbol: "IBIT261218C00050000", qty: "1", avg_entry_price: "3.40" },
    { symbol: "IBIT261016C00055000", qty: "-1", avg_entry_price: "0.80" }
  ]));
  assert.deepEqual(s.tickers, ["IBIT"]);
  assert.equal(s.longCoverByTicker.IBIT[0].symbol, "IBIT261218C00050000");
  assert.match(s.inUse.IBIT, /already covers the 55 call/);
});

test("nothing held, nothing scanned", () => {
  const s = scanCover(freeCallCover([{ symbol: "IBIT260925P00047000", qty: "-2", avg_entry_price: "0.18" }]));
  assert.deepEqual(s.tickers, []);
});
