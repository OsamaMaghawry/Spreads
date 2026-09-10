import test from "node:test";
import assert from "node:assert/strict";
import { openBook, premiumOnly, realizedShares } from "./openBook.js";

const lot = (ticker, qty, price, acquired, disposed = null) => ({
  ticker, qty, acquired_price: price, acquired_date: acquired, disposed_date: disposed
});
const eq = (ticker, qty, currentPrice) => ({
  assetClass: "equity", ticker, symbol: ticker, qty, currentPrice,
  unrealizedPL: null
});

// The real staging account, which is why this module exists.
const WHEEL_LOTS = [
  lot("TSLA", 100, 320, "2026-07-24"),
  lot("AMZN", 100, 227.5, "2026-07-29"),
  lot("JNJ", 100, 257.5, "2026-07-31"),
  lot("XOP", 100, 167, "2026-08-07"),
  lot("WMT", 100, 109, "2026-08-21"),
  lot("WMT", 100, 108, "2026-08-21"),
  lot("WMT", 100, 108, "2026-08-21")
];

test("the Options Wheel book: 7 lots, 700 shares, $129,700 — the figure the screen never showed", () => {
  const b = openBook(WHEEL_LOTS, []);
  assert.equal(b.lots, 7);
  assert.equal(b.shares, 700);
  assert.equal(b.basis, 129700);
  assert.equal(b.tickers.length, 5, "three WMT lots are one ticker, not three");
  assert.equal(b.tickers[0].ticker, "WMT", "sorted by basis: WMT $32,500 leads");
  assert.equal(b.tickers[0].basis, 32500);
  assert.equal(b.tickers[0].lots, 3);
  assert.equal(b.tickers[0].shares, 300);
});

test("with no marks the totals are null, never zero", () => {
  const b = openBook(WHEEL_LOTS, []);
  assert.equal(b.complete, false);
  assert.equal(b.unrealized, null, "$0.00 is a claim about a portfolio; this is not that claim");
  assert.equal(b.marketValue, null);
  assert.equal(b.markedBasis, 0);
  assert.equal(b.unmarkedBasis, 129700);
  assert.deepEqual(b.unmarked.sort(), ["AMZN", "JNJ", "TSLA", "WMT", "XOP"]);
});

test("TSLA marked at the price the live account actually sold at", () => {
  // 9 Sep 2026, the Alton Live disposal: 375.15 against a 320.00 basis.
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("TSLA", 100, 375.15)]);
  assert.equal(b.complete, true);
  assert.equal(b.tickers[0].mark, 375.15);
  assert.equal(Math.round(b.unrealized), 5515);
  assert.equal(b.marketValue, 37515);
});

test("ONE unmarked position withholds the whole total", () => {
  // Six of seven priced. The seventh is the $32,000 TSLA lot -- exactly the
  // case a lot-count coverage figure ("6 of 7") would wave through.
  const marks = [
    eq("AMZN", 100, 240), eq("JNJ", 100, 260), eq("XOP", 100, 170),
    eq("WMT", 300, 112)
  ];
  const b = openBook(WHEEL_LOTS, marks);
  assert.equal(b.complete, false);
  assert.equal(b.unrealized, null);
  assert.deepEqual(b.unmarked, ["TSLA"]);
  assert.equal(b.markedBasis, 129700 - 32000);
  assert.equal(b.unmarkedBasis, 32000, "coverage is in DOLLARS, so the gap is visible");
});

test("a fully marked book reports the gain", () => {
  const marks = [
    eq("TSLA", 100, 375.15), eq("AMZN", 100, 240), eq("JNJ", 100, 260),
    eq("XOP", 100, 170), eq("WMT", 300, 112)
  ];
  const b = openBook(WHEEL_LOTS, marks);
  assert.equal(b.complete, true);
  // 5,515 + 1,250 + 250 + 300 + 1,100
  assert.equal(Math.round(b.unrealized), 8415);
});

test("the same book DOWN reports the loss just as plainly", () => {
  // The symmetry is the honesty: a default that only revealed gains would be
  // marketing.
  const marks = [
    eq("TSLA", 100, 300), eq("AMZN", 100, 200), eq("JNJ", 100, 240),
    eq("XOP", 100, 150), eq("WMT", 300, 100)
  ];
  const b = openBook(WHEEL_LOTS, marks);
  assert.equal(b.complete, true);
  assert.ok(b.unrealized < 0);
  // TSLA -2,000 · AMZN -2,750 · JNJ -1,750 · XOP -1,700 · WMT -2,500
  assert.equal(Math.round(b.unrealized), -10700);
});

test("a broker quantity that disagrees with the ledger withholds the total", () => {
  // Not a rounding difference: the two disagree about the position, and a
  // total built on a disagreement is a guess with a decimal point.
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("TSLA", 50, 375)]);
  assert.equal(b.tickers[0].marked, true, "the per-line mark still shows");
  assert.equal(b.tickers[0].qtyMatchesBroker, false);
  assert.equal(b.tickers[0].brokerQty, 50);
  assert.equal(b.complete, false);
  assert.equal(b.unrealized, null);
  assert.deepEqual(b.mismatched, ["TSLA"]);
});

test("disposed lots are not open, and short stock is not a wheel lot", () => {
  const lots = [lot("TSLA", 100, 320, "2026-07-24", "2026-09-09"), lot("JNJ", 100, 257.5, "2026-07-31")];
  const b = openBook(lots, [eq("JNJ", 100, 260), { assetClass: "equity", ticker: "NVDA", qty: -100, currentPrice: 180 }]);
  assert.equal(b.lots, 1);
  assert.equal(b.tickers.length, 1);
  assert.equal(b.tickers[0].ticker, "JNJ");
});

test("an adjusted ticker still finds its broker row", () => {
  const b = openBook([lot("TSLA1", 100, 320, "2026-07-24")], [eq("TSLA", 100, 375)]);
  assert.equal(b.complete, true);
  assert.equal(b.tickers[0].mark, 375);
});

test("a lot with no acquisition price is held, unmarked and named", () => {
  const b = openBook([lot("JNJ", 100, null, "2026-07-31")], [eq("JNJ", 100, 260)]);
  assert.equal(b.tickers[0].basisKnown, false);
  assert.equal(b.tickers[0].marked, false, "no basis means no unrealized figure to state");
  assert.equal(b.complete, false);
  assert.deepEqual(b.unmarked, ["JNJ"]);
});

test("an option row is never mistaken for a share mark", () => {
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [
    { assetClass: "option", ticker: "TSLA", symbol: "TSLA260918C00362500", qty: 1, currentPrice: 17.85 }
  ]);
  assert.equal(b.complete, false, "a contract price is not a share price");
});

test("empty and junk inputs produce an empty book, not a crash", () => {
  for (const b of [openBook(null, null), openBook([], []), openBook([{}], [{}])]) {
    assert.equal(b.lots, 0);
    assert.equal(b.basis, 0);
    assert.equal(b.complete, false);
    assert.equal(b.unrealized, null);
  }
});

// --- the two views -------------------------------------------------------

const tr = (premium, early, stock) => ({
  close_date: "2026-09-09", premium_pl: premium, early_close_pl: early, stock_pl: stock,
  realized_pl: premium + early + stock
});

test("Premium only reports the option legs, NOT realized_pl", () => {
  // realized_pl already carries the share result of every disposed lot. If the
  // two were not separable the switch would mean nothing.
  const trades = [tr(144, 0, 1258.909), tr(1738, -3570, 0)];
  assert.equal(Math.round(premiumOnly(trades)), Math.round(144 - 1832));
  assert.equal(Math.round(realizedShares(trades)), 1259);
  const realized = trades.reduce((a, t) => a + t.realized_pl, 0);
  assert.equal(
    Math.round(premiumOnly(trades) + realizedShares(trades)),
    Math.round(realized),
    "the two components must reconstitute realized_pl exactly"
  );
});

test("a row with no close date is in neither view", () => {
  assert.equal(premiumOnly([{ premium_pl: 100 }]), 0);
  assert.equal(realizedShares([{ stock_pl: 100 }]), 0);
  assert.equal(premiumOnly(null), 0);
});

// --- the gate's blockers, each as the case that produced it ----------------

test("B2: an unknown acquisition price does not silently shrink the book's cost", () => {
  // The banner read "No current price for JNJ — $0.00 of $10,900.00 at cost"
  // when the price was there and the COST was not, and the book's own basis
  // had quietly dropped the JNJ shares out of both columns.
  const b = openBook(
    [lot("JNJ", 100, null, "2026-07-31"), lot("WMT", 100, 109, "2026-08-21")],
    [eq("JNJ", 100, 260), eq("WMT", 100, 112)]
  );
  assert.equal(b.unknownCostShares, 100, "the shares with no cost are counted, not vanished");
  assert.deepEqual(b.noCost, ["JNJ"]);
  assert.deepEqual(b.noPrice, [], "the price was never the missing input");
  assert.deepEqual(b.noPosition, []);
  assert.equal(b.complete, false);
  assert.equal(b.unrealized, null);
});

test("B3/B6: shares the broker holds with no ledger lot are NAMED, and do not withhold", () => {
  // Reversed after desk-editor. `stock_lots` is option-touched only, so a
  // broker position with no lot here is usually ordinary stock bought outside
  // the product -- out of scope by design, not a failure. Withholding on it
  // gave those users a PERMANENT dash while the copy told them to wait for a
  // sync that would never come.
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("TSLA", 100, 375), eq("NVDA", 500, 180)]);
  assert.deepEqual(b.stranded, ["NVDA"], "named, always");
  assert.equal(b.complete, true, "the lots this page covers are all priced");
  assert.equal(Math.round(b.unrealized), 5500, "100 TSLA at 375 against a 320 basis");
});

test("B4: no cost AND no broker row is reported as no position, not as no cost", () => {
  // The banner said "there is a current price, but nothing to measure it
  // against" when there was no price either. Order of the reason chain.
  const b = openBook([lot("JNJ", 100, null, "2026-07-31")], []);
  assert.deepEqual(b.noPosition, ["JNJ"]);
  assert.deepEqual(b.noCost, [], "cost is not the finding when the position is absent");
  assert.equal(b.complete, false);
});

test("B5: a lot the broker does not report is a reconciliation failure, not a missing price", () => {
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("AMZN", 100, 240)]);
  assert.deepEqual(b.noPosition, ["TSLA"]);
  assert.deepEqual(b.noPrice, [], "'no current price' describes a data gap and would bury this");
  assert.equal(b.complete, false);
});

test("B4: a broker row with a null price is a missing price, and cost is not blamed", () => {
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("TSLA", 100, null)]);
  assert.deepEqual(b.noPrice, ["TSLA"]);
  assert.deepEqual(b.noCost, []);
});

test("B4: no cost WITH a price present is the one case that branch may claim", () => {
  const b = openBook([lot("JNJ", 100, null, "2026-07-31")], [eq("JNJ", 100, 260)]);
  assert.deepEqual(b.noCost, ["JNJ"]);
  assert.deepEqual(b.noPrice, []);
  assert.deepEqual(b.noPosition, []);
});

test("M2: a fractional quantity difference is not a disagreement", () => {
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("TSLA", 100.0000001, 375)]);
  assert.equal(b.tickers[0].qtyMatchesBroker, true);
  assert.equal(b.complete, true);
  // And a real difference still is one.
  const c = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("TSLA", 99, 375)]);
  assert.equal(c.complete, false);
});

test("M3: two broker symbols collapsing to one ticker withhold rather than pick a winner", () => {
  // TSLA @375 and the adjusted TSLA1 @10 both key to TSLA. Letting the last
  // one win published -$31,000 as a COMPLETE total.
  const b = openBook([lot("TSLA", 100, 320, "2026-07-24")], [eq("TSLA", 100, 375), eq("TSLA1", 100, 10)]);
  assert.deepEqual(b.collided, ["TSLA"]);
  assert.equal(b.complete, false);
  assert.equal(b.unrealized, null);
});

test("M3: an all-digit ticker keeps its own identity", () => {
  // Stripping trailing digits without occ.ts's `|| root` fallback keyed every
  // numeric ticker to the empty string, and they collided with each other.
  const b = openBook([lot("2330", 100, 50, "2026-08-01")], [eq("2330", 100, 55)]);
  assert.equal(b.tickers[0].ticker, "2330");
  assert.equal(b.complete, true);
  assert.equal(Math.round(b.unrealized), 500);
});

// --- the curve must end where its own headline says ------------------------

import { viewCurve } from "./openBook.js";

const row = (date, premium, early, stock) => ({
  close_date: date, premium_pl: premium, early_close_pl: early, stock_pl: stock,
  realized_pl: premium + early + stock
});

test("the curve ended at a number that was NEITHER view's figure", () => {
  // The owner's report: the graph does not go with the filter. It accumulated
  // realized_pl in both views, so Premium only showed -$751 over a chart
  // ending at +$594.
  const trades = [row("2026-09-01", 100, 0, 0), row("2026-09-02", 50, -20, 900)];
  const realized = trades.reduce((a, t) => a + t.realized_pl, 0);

  const p = viewCurve(trades, "premium", null);
  assert.equal(p.end, premiumOnly(trades), "Premium only ends at the option legs");
  assert.equal(p.end, 130);
  assert.notEqual(p.end, realized, "and that is NOT the realized total");
  assert.equal(p.marked, false, "nothing to mark: the shares are excluded on purpose");

  const w = viewCurve(trades, "whole", 5515);
  assert.equal(w.realizedEnd, realized);
  assert.equal(w.end, realized + 5515, "Whole view ends at realized plus the mark");
});

test("Whole view draws the realized path, then ONE dashed step to today", () => {
  const trades = [row("2026-09-01", 100, 0, 0), row("2026-09-02", 50, 0, 0)];
  const w = viewCurve(trades, "whole", 1000);
  assert.equal(w.points.length, 3, "two trades plus today's mark");
  const last = w.points[2];
  assert.equal(last.isMark, true);
  assert.equal(last.cum, null, "the mark is not part of the realized line");
  assert.equal(last.mark, 150 + 1000);
  // The dashed series needs BOTH ends or it draws nothing.
  assert.equal(w.points[1].mark, 150, "the last historical point anchors the dashed leg");
  assert.equal(w.points[0].mark, null);
});

test("an unpriced book draws no mark rather than a flat line to nowhere", () => {
  const trades = [row("2026-09-01", 100, 0, 0)];
  const w = viewCurve(trades, "whole", null);
  assert.equal(w.marked, false);
  assert.equal(w.points.length, 1);
  assert.equal(w.end, 100);
});

test("the curve sorts by close date whatever order the rows arrive in", () => {
  const trades = [row("2026-09-03", 10, 0, 0), row("2026-09-01", 100, 0, 0)];
  const p = viewCurve(trades, "premium", null);
  assert.deepEqual(p.points.map((x) => x.date), ["2026-09-01", "2026-09-03"]);
  assert.deepEqual(p.points.map((x) => x.cum), [100, 110]);
});

test("no trades produces no points and no crash", () => {
  for (const v of ["whole", "premium"]) {
    const c = viewCurve([], v, 500);
    assert.deepEqual(c.points, []);
    assert.equal(c.marked, false);
    assert.equal(c.end, 0);
  }
  assert.deepEqual(viewCurve(null, "whole", null).points, []);
});

// --- the tables follow the view too ---------------------------------------

import { viewBreakdown } from "./openBook.js";

test("Premium only re-buckets by month to the option legs", () => {
  // Same defect as the curve, one layer down: the tables summed realized_pl in
  // both views, so every month showed share results Premium only excludes and
  // the columns never changed when the switch was flipped.
  const trades = [
    { ...row("2026-08-31", 100, 0, 0), ticker: "NVDA" },
    { ...row("2026-09-02", 69, 0, 86), ticker: "NVDA" },
    { ...row("2026-09-09", 144, 0, 1258.909), ticker: "TSLA" }
  ];
  const m = viewBreakdown(trades, "premium", [], "month");
  assert.deepEqual(m.map((r) => r.month), ["2026-08", "2026-09"]);
  assert.equal(m[0].pl, 100);
  assert.equal(m[1].pl, 213, "69 + 144 — the $1,344.91 of share result is excluded");
});

test("Whole view leaves computeStats' own rows alone", () => {
  // The mark on shares still held belongs to no month: it is today's price on
  // a position that has not closed, and putting it in September would claim a
  // realization that has not happened.
  const original = [{ month: "2026-09", pl: 999, trades: 3, settled: 3, wins: 2 }];
  assert.strictEqual(viewBreakdown([], "whole", original, "month"), original);
});

test("win/loss stays measured on the whole row, not the option leg", () => {
  // A put assigned into a losing stock position has a POSITIVE option leg.
  // Counting that as a win because this view hides the shares would be the
  // flattering half of the very defect the switch exists to fix.
  const trades = [{ ...row("2026-09-09", 160, 0, -2000), ticker: "TSLA" }];
  const t = viewBreakdown(trades, "premium", [], "ticker");
  assert.equal(t[0].pl, 160, "the view's own figure is the option leg");
  assert.equal(t[0].wins, 0, "but it is not a win: the position lost $1,840");
  assert.equal(t[0].settled, 1);
});

test("a provisional row counts as activity but not as a settled outcome", () => {
  const trades = [{ ...row("2026-09-07", 160, 0, 0), ticker: "TSLA", provisional: true }];
  const t = viewBreakdown(trades, "premium", [], "ticker");
  assert.equal(t[0].trades, 1);
  assert.equal(t[0].settled, 0);
  assert.equal(t[0].wins, 0);
});
