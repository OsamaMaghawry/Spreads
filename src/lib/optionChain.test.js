import test from "node:test";
import assert from "node:assert/strict";
import { legStrategy, contractSetup } from "./optionChain.js";

const row = (over = {}) => ({
  symbol: "TSLA261016P00370000",
  strike: 370,
  type: "P",
  bid: 4.2,
  ask: 4.4,
  mid: 4.3,
  delta: -0.18,
  iv: 0.42,
  ...over
});

const call380 = row({
  symbol: "TSLA261016C00380000", strike: 380, type: "C",
  bid: 3.0, ask: 3.4, mid: 3.2, delta: 0.21
});

const ctx = { ticker: "TSLA", expiry: "2026-10-16", spot: 365 };

test("the four things one option leg can be", () => {
  assert.equal(legStrategy("P", "sell"), "cash_secured_put");
  assert.equal(legStrategy("C", "sell"), "covered_call");
  assert.equal(legStrategy("P", "buy"), "long_put");
  assert.equal(legStrategy("C", "buy"), "long_call");
  // The ladder says "P"; a leg elsewhere says "put". Both have to work.
  assert.equal(legStrategy("put", "buy"), "long_put");
});

test("SELLING a put is collateralised at the strike and cannot lose past zero", () => {
  const r = contractSetup(row(), "sell", ctx);
  assert.equal(r.ok, true);
  assert.equal(r.setup.strategy, "cash_secured_put");
  assert.equal(r.setup.credit, 4.3);
  assert.equal(r.setup.collateral, 37000);
  assert.equal(r.setup.maxRisk, (370 - 4.3) * 100);
  assert.equal(r.setup.breakEvenLow, 365.7);
  assert.equal(r.setup.legs[0].side, "sell");
});

test("SELLING an uncovered call reports NO max risk, because it has none", () => {
  // Any number here reads as a ceiling. A naked call has no ceiling.
  const r = contractSetup(call380, "sell", { ...ctx, shares: 0 });
  assert.equal(r.setup.maxRisk, null);
  assert.equal(r.setup.unlimitedRisk, true);
  assert.equal(r.setup.collateral, null);
  assert.equal(r.setup.maxContracts, 0);
});

test("a call is uncovered on 99 shares, covered on 100", () => {
  assert.equal(contractSetup(call380, "sell", { ...ctx, shares: 99, basis: 350 }).setup.unlimitedRisk, true);
  assert.equal(contractSetup(call380, "sell", { ...ctx, shares: 100, basis: 350 }).setup.unlimitedRisk, false);
});

test("SELLING a covered call measures against the SHARES' basis, never the spot", () => {
  const r = contractSetup(call380, "sell", { ...ctx, shares: 300, basis: 350 });
  assert.equal(r.setup.collateral, 35000);
  assert.equal(r.setup.maxRisk, (350 - 3.2) * 100);
  assert.equal(r.setup.ifCalled, (380 - 350 + 3.2) * 100);
  assert.equal(r.setup.maxContracts, 3);
  // Spot is 365; measuring against it would report a different position.
  assert.notEqual(r.setup.collateral, 36500);
});

test("a covered call with shares but NO basis on record is treated as uncovered", () => {
  // Better to overstate the risk than to invent a basis and understate it.
  const r = contractSetup(call380, "sell", { ...ctx, shares: 300, basis: null });
  assert.equal(r.setup.unlimitedRisk, true);
  assert.equal(r.setup.maxRisk, null);
});

test("BUYING a put risks the debit and nothing more", () => {
  const r = contractSetup(row(), "buy", ctx);
  assert.equal(r.setup.strategy, "long_put");
  assert.equal(r.setup.debit, 4.3);
  // Negative credit IS the debit convention used everywhere else.
  assert.equal(r.setup.credit, -4.3);
  assert.equal(r.setup.maxRisk, 430);
  assert.equal(r.setup.breakEvenLow, 365.7);
  assert.equal(r.setup.breakEvenHigh, null);
  assert.equal(r.setup.legs[0].side, "buy");
});

test("BUYING a call breaks even ABOVE the strike", () => {
  const r = contractSetup(call380, "buy", ctx);
  assert.equal(r.setup.strategy, "long_call");
  assert.equal(r.setup.breakEvenHigh, 383.2);
  assert.equal(r.setup.breakEvenLow, null);
  assert.equal(r.setup.maxRisk, 320);
});

test("a strike with no two-sided market prices no ticket, and says why", () => {
  const r = contractSetup(row({ bid: null, ask: null, mid: null }), "buy", ctx);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no two-sided market/i);
});

test("the ticket is priced at the MID, not the bid", () => {
  // The scanner takes the bid because it models a fill nobody asked for. A
  // person clicking a strike sets their own limit, and starting at the bid
  // anchors every order to the worst half of the market.
  const r = contractSetup(row(), "sell", ctx);
  assert.equal(r.setup.credit, 4.3);
  assert.notEqual(r.setup.credit, 4.2);
});

test("targetDelta is null — nothing was asked for", () => {
  const r = contractSetup(row(), "sell", ctx);
  assert.equal(r.setup.targetDelta, null);
  // The contract's own delta still travels, on the leg.
  assert.equal(r.setup.legs[0].delta, -0.18);
});

test("moneyness is measured from the right side for each type", () => {
  // Put OTM below spot, call OTM above. Backwards, every row's label flips.
  assert.ok(contractSetup(row(), "sell", ctx).setup.otmPct < 0, "370 put is ITM at 365");
  assert.ok(contractSetup(call380, "sell", ctx).setup.otmPct > 0, "380 call is OTM at 365");
});

test("no spot means no moneyness, not a fabricated one", () => {
  const r = contractSetup(row(), "sell", { ticker: "TSLA", expiry: "2026-10-16", spot: null });
  assert.equal(r.setup.otmPct, null);
});

test("a missing row is refused rather than throwing", () => {
  assert.equal(contractSetup(null, "buy", ctx).ok, false);
});

// ---------------------------------------------------------------------------
// spreadSetup — two selected strikes as a vertical
// ---------------------------------------------------------------------------

import { spreadSetup } from "./optionChain.js";

const P = (strike, mid, exp = "2026-10-16") => ({ symbol: `TSLA${exp.replace(/-/g, "").slice(2)}P00${strike}000`, strike, type: "P", expiry: exp, bid: mid - 0.1, ask: mid + 0.1, mid, delta: -0.2, iv: 0.4 });
const C = (strike, mid, exp = "2026-10-16") => ({ symbol: `TSLA${exp.replace(/-/g, "").slice(2)}C00${strike}000`, strike, type: "C", expiry: exp, bid: mid - 0.1, ask: mid + 0.1, mid, delta: 0.2, iv: 0.4 });

test("a CREDIT put spread: sell the near strike, buy the far one", () => {
  const r = spreadSetup(
    [{ row: P(370, 4.3), action: "sell" }, { row: P(365, 2.3), action: "buy" }],
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.setup.strategy, "put_spread");
  assert.equal(r.setup.credit, 2);
  assert.equal(r.setup.width, 5);
  assert.equal(r.setup.maxRisk, 300);
  assert.equal(r.setup.maxProfit, 200);
  assert.equal(r.setup.breakEvenLow, 368);
  assert.equal(r.setup.structure, "vertical");
});

test("a DEBIT vertical carries a NEGATIVE credit, not a second field", () => {
  // Buying the near strike and selling the far one costs money. One sign
  // convention; openPosition reads it to decide what to send.
  const r = spreadSetup(
    [{ row: P(370, 4.3), action: "buy" }, { row: P(365, 2.3), action: "sell" }],
    ctx
  );
  assert.equal(r.setup.credit, -2);
  assert.equal(r.setup.debit, 2);
  assert.equal(r.setup.maxRisk, 200);
  assert.equal(r.setup.maxProfit, 300);
});

test("a call spread breaks even ABOVE the short strike", () => {
  const r = spreadSetup(
    [{ row: C(370, 4.3), action: "sell" }, { row: C(375, 2.3), action: "buy" }],
    ctx
  );
  assert.equal(r.setup.strategy, "call_spread");
  assert.equal(r.setup.breakEvenHigh, 372);
  assert.equal(r.setup.breakEvenLow, null);
});

test("risk is bounded on BOTH sides of a vertical", () => {
  // The whole reason a trader puts one leg against another.
  const credit = spreadSetup([{ row: P(370, 4.3), action: "sell" }, { row: P(365, 2.3), action: "buy" }], ctx);
  const debit = spreadSetup([{ row: P(370, 4.3), action: "buy" }, { row: P(365, 2.3), action: "sell" }], ctx);
  assert.ok(credit.setup.maxRisk > 0 && isFinite(credit.setup.maxRisk));
  assert.ok(debit.setup.maxRisk > 0 && isFinite(debit.setup.maxRisk));
  // And the two sides of one spread add up to its width.
  assert.equal(credit.setup.maxRisk + credit.setup.maxProfit, 500);
});

test("two legs that do not form a vertical are refused BY NAME", () => {
  // A "spread" assembled from legs that are not one reports a defined risk on
  // an undefined position.
  assert.match(spreadSetup([{ row: P(370, 4.3), action: "sell" }, { row: C(365, 2.3), action: "buy" }], ctx).reason, /same type/i);
  assert.match(spreadSetup([{ row: P(370, 4.3), action: "sell" }, { row: P(370, 2.3), action: "buy" }], ctx).reason, /same contract/i);
  assert.match(spreadSetup([{ row: P(370, 4.3), action: "sell" }, { row: P(365, 2.3), action: "sell" }], ctx).reason, /one leg sold and one bought/i);
  assert.match(spreadSetup([{ row: P(370, 4.3), action: "sell" }], ctx).reason, /exactly two legs/i);
  assert.match(spreadSetup([{ row: P(370, 4.3), action: "sell" }, { row: P(365, 2.3), action: "sell" }], ctx).reason, /one leg sold and one bought/i);
});

test("an unquoted leg prices no spread, and names which one", () => {
  const r = spreadSetup(
    [{ row: P(370, 4.3), action: "sell" }, { row: { ...P(250, 0), mid: null }, action: "buy" }],
    ctx
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /TSLA261016P00250000/);
});

// ---------------------------------------------------------------------------
// Calendars and diagonals — and which leg outlives the other
//
// The owner's own selection: BUY Feb 2027 370P, SELL Dec 2027 320P. The short
// outlives the long, so from February it is a bare short put until December.
// Reporting a bounded max risk on that is the single most dangerous thing this
// screen could do.
// ---------------------------------------------------------------------------

test("legs with different expiries are a spread, not a refusal", () => {
  const r = spreadSetup(
    [{ row: P(370, 44.5, "2027-02-19"), action: "buy" }, { row: P(320, 19.9, "2027-12-17"), action: "sell" }],
    ctx
  );
  assert.equal(r.ok, true);
  assert.equal(r.setup.structure, "diagonal");
  assert.deepEqual(r.setup.expiries, ["2027-02-19", "2027-12-17"]);
});

test("THE OWNER'S DIAGONAL: the short outlives the long, and the worst case is the strike", () => {
  // This test used to assert `maxRisk: null`, which put "No ceiling" on the
  // ticket. That was wrong, and wrong by withholding: a stock cannot go below
  // zero, so a bare short put's loss IS bounded, at the strike less what came
  // in. The note in this very branch had said so in words all along.
  const r = spreadSetup(
    [{ row: P(370, 44.5, "2027-02-19"), action: "buy" }, { row: P(320, 19.9, "2027-12-17"), action: "sell" }],
    ctx
  );
  // credit = 19.9 - 44.5 = -24.6, so (320 + 24.6) x 100.
  assert.equal(Math.round(r.setup.maxRisk), 34460);
  assert.equal(r.setup.unlimitedRisk, false);
  assert.match(r.setup.riskNote, /bare short put at 320/i);
  assert.match(r.setup.riskNote, /2027-02-19/);
  // And the width is meaningless here, so it is not reported as collateral.
  assert.equal(r.setup.collateral, null);
  assert.equal(r.setup.width, null);
});

test("a standard calendar — long outlives short, paid for — risks the debit", () => {
  const r = spreadSetup(
    [{ row: P(370, 4.3, "2026-10-16"), action: "sell" }, { row: P(370, 9.3, "2027-01-15"), action: "buy" }],
    ctx
  );
  assert.equal(r.setup.structure, "calendar");
  assert.equal(r.setup.credit, -5);
  assert.equal(r.setup.maxRisk, 500);
  assert.match(r.setup.riskNote, /outlives/i);
});

test("a diagonal whose long strike does NOT protect is unbounded", () => {
  // Long put BELOW the short put caps nothing: the short can be assigned at
  // 370 while the long only pays from 350 down.
  const r = spreadSetup(
    [{ row: P(370, 4.3, "2026-10-16"), action: "sell" }, { row: P(350, 9.3, "2027-01-15"), action: "buy" }],
    ctx
  );
  assert.equal(r.setup.maxRisk, null);
  assert.equal(r.setup.unlimitedRisk, true);
});

test("a short CALL that outlives its long has no ceiling, and says so", () => {
  const r = spreadSetup(
    [{ row: C(370, 4.3, "2026-10-16"), action: "buy" }, { row: C(380, 9.3, "2027-01-15"), action: "sell" }],
    ctx
  );
  assert.equal(r.setup.maxRisk, null);
  assert.match(r.setup.riskNote, /no ceiling/i);
});

test("a vertical is still bounded, and still reports its width", () => {
  const r = spreadSetup(
    [{ row: P(370, 4.3), action: "sell" }, { row: P(365, 2.3), action: "buy" }],
    ctx
  );
  assert.equal(r.setup.structure, "vertical");
  assert.equal(r.setup.maxRisk, 300);
  assert.equal(r.setup.collateral, 500);
});

test("the ticket's expiry is the NEAR one — it governs the next event", () => {
  const r = spreadSetup(
    [{ row: P(370, 44.5, "2027-02-19"), action: "buy" }, { row: P(320, 19.9, "2027-12-17"), action: "sell" }],
    ctx
  );
  assert.equal(r.setup.expiry, "2027-02-19");
  // Both travel on the legs, so the order carries the right contracts.
  assert.deepEqual(r.setup.legs.map((l) => l.expiry).sort(), ["2027-02-19", "2027-12-17"]);
});

test("the same contract twice is still refused", () => {
  const r = spreadSetup(
    [{ row: P(370, 4.3, "2027-02-19"), action: "sell" }, { row: P(370, 4.3, "2027-02-19"), action: "buy" }],
    ctx
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /same contract/i);
});

// A covered call must carry the BASIS it was priced from, not just the label
// saying where the basis came from. Without it the ticket's payoff chart has
// no shares to put under the call and draws a naked one -- an unbounded loss
// above the strike, directly under a max loss computed from this very number.
test("a covered call carries the basis its own risk figure was built on", () => {
  const r = contractSetup(
    { symbol: "AAPL261016C00240000", strike: 240, type: "C", bid: 2.9, ask: 3.1, mid: 3, delta: 0.3 },
    "sell",
    { ticker: "AAPL", expiry: "2026-10-16", spot: 230, shares: 300, basis: 200, basisSource: "adjusted" }
  );
  assert.equal(r.setup.basis, 200);
  assert.equal(r.setup.maxRisk, (200 - 3) * 100);
  assert.equal(r.setup.ifCalled, (240 - 200 + 3) * 100);
});

test("an UNCOVERED short call carries no basis to pretend with", () => {
  const r = contractSetup(
    { symbol: "AAPL261016C00240000", strike: 240, type: "C", bid: 2.9, ask: 3.1, mid: 3, delta: 0.3 },
    "sell",
    { ticker: "AAPL", expiry: "2026-10-16", spot: 230, shares: 0, basis: null }
  );
  assert.equal(r.setup.basis, null);
  assert.equal(r.setup.maxRisk, null);
  assert.equal(r.setup.unlimitedRisk, true);
});

// A BARE SHORT PUT IS BOUNDED. Both branches used to return maxRisk null and
// the ticket printed "No ceiling" over each, which on a put withholds a number
// the user badly needs: a stock cannot go below zero, so the worst a short put
// can do is its strike less what came in.
test("a diagonal whose short PUT outlives the long names its worst case", () => {
  const legs = [
    { action: "buy", expiry: "2027-02-19", row: { symbol: "TSLA270219P00370000", strike: 370, type: "P", bid: 41.73, ask: 43.08, mid: 42.405, delta: -0.43 } },
    { action: "sell", expiry: "2027-12-17", row: { symbol: "TSLA271217P00320000", strike: 320, type: "P", bid: 43.91, ask: 44.22, mid: 44.065, delta: -0.27 } }
  ];
  const r = spreadSetup(legs, { ticker: "TSLA", spot: 365.49 });
  assert.equal(r.ok, true);
  assert.equal(r.setup.structure, "diagonal");
  assert.equal(Math.round(r.setup.credit * 100) / 100, 1.66);
  // (320 - 1.66) x 100. NOT null, and not "No ceiling".
  assert.equal(Math.round(r.setup.maxRisk), 31834);
  assert.equal(r.setup.unlimitedRisk, false);
  assert.equal(Math.round(r.setup.maxProfit), 166);
  assert.ok(/worst case is 320 a share with the stock at zero/.test(r.setup.riskNote));
});

test("a bare short CALL still has no ceiling, because a stock has no top", () => {
  const legs = [
    { action: "buy", expiry: "2027-02-19", row: { symbol: "TSLA270219C00400000", strike: 400, type: "C", bid: 30, ask: 31, mid: 30.5, delta: 0.4 } },
    { action: "sell", expiry: "2027-12-17", row: { symbol: "TSLA271217C00450000", strike: 450, type: "C", bid: 33, ask: 34, mid: 33.5, delta: 0.35 } }
  ];
  const r = spreadSetup(legs, { ticker: "TSLA", spot: 365.49 });
  assert.equal(r.setup.maxRisk, null);
  assert.equal(r.setup.unlimitedRisk, true);
  assert.ok(/no ceiling on the loss/.test(r.setup.riskNote));
});

// ---------------------------------------------------------------------------
// A call sold against a long call already held. Same arithmetic as the
// Scanner's buildCallOverLong; the chain must not give a second answer.
// ---------------------------------------------------------------------------

const ibitCall55 = row({ symbol: "IBIT261016C00055000", strike: 55, type: "C", bid: 0.75, ask: 0.85, mid: 0.8, delta: 0.25 });
const long50 = { symbol: "IBIT261218C00050000", strike: 50, expiry: "2026-12-18", cost: 3.4, mark: 4.1, qty: 1 };
const ibit = { ticker: "IBIT", expiry: "2026-10-16", spot: 52, shares: 0 };

test("a call over a free long call is bounded, and priced as the spread it is", () => {
  const r = contractSetup(ibitCall55, "sell", { ...ibit, longCover: [long50] });
  assert.equal(r.ok, true);
  const s = r.setup;
  assert.equal(s.coveredBy, "long_call");
  assert.equal(s.unlimitedRisk, false);
  assert.equal(s.collateral, 340);
  // 3.40 cost - 0.80 credit, no strike gap (long 50 is under short 55).
  assert.ok(Math.abs(s.maxRisk - 260) < 1e-9);
  // Exercise to deliver: 55 - 50 + 0.80 - 3.40 = 2.40 a share, the floor.
  assert.ok(Math.abs(s.ifAssigned - 240) < 1e-9);
  assert.equal(s.maxProfit, null);
  assert.equal(s.maxContracts, 1);
  assert.equal(s.cover.mark, 4.1);
});

test("a long struck ABOVE the short adds the gap to the risk", () => {
  const r = contractSetup(ibitCall55, "sell", { ...ibit, longCover: [{ ...long50, strike: 58 }] });
  // 3.40 - 0.80 + (58 - 55) = 5.60 a share.
  assert.ok(Math.abs(r.setup.maxRisk - 560) < 1e-9);
});

test("a long that expires before the call cannot cover it — the call stays naked", () => {
  const r = contractSetup(ibitCall55, "sell", { ...ibit, longCover: [{ ...long50, expiry: "2026-10-09" }] });
  assert.equal(r.setup.unlimitedRisk, true);
  assert.equal(r.setup.maxRisk, null);
  assert.equal(r.setup.coveredBy, undefined);
});

test("a long with no cost on record is not cover — risk cannot be bounded from nothing", () => {
  const r = contractSetup(ibitCall55, "sell", { ...ibit, longCover: [{ ...long50, cost: null }] });
  assert.equal(r.setup.unlimitedRisk, true);
});

test("a credit covering everything the long cost is refused, not ranked as riskless", () => {
  const r = contractSetup(ibitCall55, "sell", { ...ibit, longCover: [{ ...long50, cost: 0.5 }] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /check the quote/);
});

test("the long covers before shares, as in the Scanner and the allocator", () => {
  const r = contractSetup(ibitCall55, "sell", { ...ibit, shares: 100, basis: 40, longCover: [long50] });
  assert.equal(r.setup.coveredBy, "long_call");
});

test("shares still cover when there is no free long", () => {
  const r = contractSetup(call380, "sell", { ...ctx, shares: 100, basis: 350, longCover: [] });
  assert.equal(r.setup.unlimitedRisk, false);
  assert.equal(r.setup.basis, 350);
});

test("BUYING a call ignores the long cover entirely", () => {
  const r = contractSetup(ibitCall55, "buy", { ...ibit, longCover: [long50] });
  assert.equal(r.setup.strategy, "long_call");
  assert.equal(r.setup.coveredBy, undefined);
});

test("shares already behind a call sold still price the ticket, and it says so", () => {
  const r = contractSetup(call380, "sell", {
    ...ctx, shares: 100, basis: 350,
    coverInUse: "Your 100 shares already cover the 390 call (2026-09-23) you sold."
  });
  assert.equal(r.setup.unlimitedRisk, false);
  assert.match(r.setup.coverInUse, /already cover the 390 call/);
});

test("free cover carries no flag", () => {
  const r = contractSetup(call380, "sell", { ...ctx, shares: 100, basis: 350 });
  assert.equal(r.setup.coverInUse, undefined);
});

// ---------------------------------------------------------------------------
// Unequal quantities per leg: "buying 1 Call vs selling 2 calls"
// ---------------------------------------------------------------------------

import { ratioPayoff } from "./optionChain.js";

test("2 bought against 4 sold goes as two units of 1:2, priced per unit", () => {
  const r = spreadSetup(
    [{ row: C(400, 5), action: "buy", qty: 2 }, { row: C(410, 3), action: "sell", qty: 4 }],
    { ...ctx, shares: 0 }
  );
  assert.equal(r.ok, true);
  assert.equal(r.setup.units, 2);
  assert.equal(r.setup.structure, "ratio");
  assert.equal(r.setup.ratioLabel, "1×2");
  const bySide = Object.fromEntries(r.setup.legs.map((l) => [l.side, l.ratio]));
  assert.deepEqual(bySide, { sell: 2, buy: 1 });
  assert.deepEqual(r.setup.legQty, { [C(410, 3).symbol]: 4, [C(400, 5).symbol]: 2 });
  // 2 x 3.00 taken, 5.00 paid: a 1.00 credit per 1:2.
  assert.equal(r.setup.credit, 1);
  // A net short call has no ceiling; the width means nothing here.
  assert.equal(r.setup.maxRisk, null);
  assert.equal(r.setup.width, null);
  assert.equal(r.setup.collateral, null);
  // Peak at the short strike: 1.00 + 10 of intrinsic on the long call.
  assert.equal(r.setup.maxProfit, 1100);
  assert.equal(r.setup.breakEvenLow, 421);
  assert.equal(r.setup.breakEvenHigh, null);
  assert.match(r.setup.riskNote, /without limit/);
  assert.match(r.setup.riskNote, /200 shares would cover/);
});

test("the extra short call is named a stock repair when the shares are there", () => {
  const r = spreadSetup(
    [{ row: C(400, 5), action: "buy", qty: 1 }, { row: C(410, 2.5), action: "sell", qty: 2 }],
    { ...ctx, shares: 100, accountName: "Paper" }
  );
  assert.equal(r.setup.credit, 0);
  assert.match(r.setup.riskNote, /stock repair/);
  // Done for nothing: no loss below the long strike, one break-even above.
  assert.equal(r.setup.breakEvenLow, 420);
  assert.equal(r.setup.breakEvenHigh, null);
});

test("equal quantities stay a plain vertical, sent as that many units", () => {
  const r = spreadSetup(
    [{ row: P(370, 4.3), action: "sell", qty: 3 }, { row: P(365, 2.3), action: "buy", qty: 3 }],
    ctx
  );
  assert.equal(r.setup.structure, "vertical");
  assert.equal(r.setup.units, 3);
  assert.ok(r.setup.legs.every((l) => l.ratio === 1));
  assert.equal(r.setup.credit, 2);
  assert.equal(r.setup.maxRisk, 300);
  assert.equal(r.setup.breakEvenLow, 368);
});

test("a put ratio is bounded: the worst case is the stock at zero", () => {
  // Buy 1 100P for 5, sell 2 90P for 2.50: done for nothing.
  const p = ratioPayoff({ isPut: true, credit: 0, sellStrike: 90, buyStrike: 100, sellRatio: 2, buyRatio: 1 });
  // At zero: +100 on the long, -180 on the two shorts.
  assert.equal(p.maxLoss, 8000);
  assert.equal(p.maxProfit, 1000);
  assert.deepEqual(p.breakEvens, [80]);
});

test("a debit call ratio has two break-evens", () => {
  const p = ratioPayoff({ isPut: false, credit: -1, sellStrike: 110, buyStrike: 100, sellRatio: 2, buyRatio: 1 });
  assert.equal(p.maxLoss, null);
  assert.equal(p.maxProfit, 900);
  assert.deepEqual(p.breakEvens, [101, 119]);
});

test("a back ratio (more bought than sold) has no cap on profit and a bounded loss", () => {
  const calls = ratioPayoff({ isPut: false, credit: 0, sellStrike: 100, buyStrike: 110, sellRatio: 1, buyRatio: 2 });
  assert.equal(calls.maxProfit, null);
  assert.equal(calls.maxLoss, 1000);
  assert.deepEqual(calls.breakEvens, [120]);
  const puts = ratioPayoff({ isPut: true, credit: 0, sellStrike: 100, buyStrike: 90, sellRatio: 1, buyRatio: 2 });
  assert.equal(puts.maxLoss, 1000);
  assert.equal(puts.maxProfit, 8000);
  assert.deepEqual(puts.breakEvens, [80]);
});

test("unequal quantities across two expiries show no risk figure", () => {
  const r = spreadSetup(
    [{ row: C(400, 5, "2026-11-20"), action: "buy", qty: 1 }, { row: C(410, 3), action: "sell", qty: 2 }],
    ctx
  );
  assert.equal(r.setup.maxRisk, null);
  assert.match(r.setup.riskNote, /two expiries/);
});

test("a missing or nonsense quantity reads as one", () => {
  const r = spreadSetup(
    [{ row: P(370, 4.3), action: "sell", qty: "abc" }, { row: P(365, 2.3), action: "buy", qty: 0 }],
    ctx
  );
  assert.equal(r.setup.units, 1);
  assert.equal(r.setup.structure, "vertical");
});

// ---------------------------------------------------------------------------
// collarSetup — a put bought and a call sold on shares held
// ---------------------------------------------------------------------------

import { collarSetup } from "./optionChain.js";

const held = { ...ctx, ticker: "TSLA", spot: 400, shares: 200, basis: 380, basisSource: "broker", accountName: "Paper" };

test("a collar: floor, cap and net, measured against the basis and from today", () => {
  // Buy the 380 put for 6, sell the 430 call for 7: a 1.00 credit.
  const r = collarSetup([{ row: P(380, 6), action: "buy" }, { row: C(430, 7), action: "sell" }], held);
  assert.equal(r.ok, true);
  const s = r.setup;
  assert.equal(s.strategy, "collar");
  assert.equal(s.credit, 1);
  assert.equal(s.floor, 380);
  assert.equal(s.cap, 430);
  // Against the 380 basis: worst 380 - 380 + 1 = +1 a share (a gain), best 51.
  assert.equal(s.worstFromBasis, 100);
  assert.equal(s.bestFromBasis, 5100);
  assert.equal(s.maxRisk, 0);
  // From today's 400: worst -19, best +31.
  assert.equal(s.worstFromSpot, -1900);
  assert.equal(s.bestFromSpot, 3100);
  assert.equal(s.maxContracts, 2);
  assert.deepEqual(s.legs.map((l) => `${l.side} ${l.type} ${l.strike}`), ["buy put 380", "sell call 430"]);
  // Even at 379 against the basis: outside the floor, so no break-even shown.
  assert.equal(s.breakEvenLow, null);
});

test("a collar costing money, with the basis above the price", () => {
  const r = collarSetup([{ row: P(370, 8), action: "buy" }, { row: C(420, 5), action: "sell" }], { ...held, basis: 410 });
  const s = r.setup;
  assert.equal(s.credit, -3);
  assert.equal(s.debit, 3);
  // Worst against 410: 370 - 410 - 3 = -43 a share.
  assert.equal(s.maxRisk, 4300);
  assert.equal(s.bestFromBasis, 700);
  assert.equal(s.breakEvenLow, 413);
});

test("no basis on record: measured from today's price, and said so", () => {
  const r = collarSetup([{ row: P(380, 6), action: "buy" }, { row: C(430, 7), action: "sell" }], { ...held, basis: null });
  assert.equal(r.setup.maxRisk, 1900);
  assert.equal(r.setup.maxProfit, 3100);
  assert.match(r.setup.riskNote, /today's price/);
});

test("a collar is refused without the shares, or the wrong way round", () => {
  const legs = [{ row: P(380, 6), action: "buy" }, { row: C(430, 7), action: "sell" }];
  assert.match(collarSetup(legs, { ...held, shares: 50 }).reason, /100 free/);
  assert.match(collarSetup([{ row: P(380, 6), action: "sell" }, { row: C(430, 7), action: "buy" }], held).reason, /buys the put/);
  assert.match(collarSetup([{ row: P(440, 6), action: "buy" }, { row: C(430, 7), action: "sell" }], held).reason, /at or below/);
  assert.match(collarSetup([{ row: P(380, 6, "2026-11-20"), action: "buy" }, { row: C(430, 7), action: "sell" }], held).reason, /same expiry/);
});

// ---------------------------------------------------------------------------
// repairSetup — shares below cost plus a 1x2 call ratio
// ---------------------------------------------------------------------------

import { repairSetup } from "./optionChain.js";

// Bought at 420, now 400. Buy the 400 call for 12, sell two 410s at 6.50.
const below = { ...ctx, ticker: "TSLA", spot: 400, shares: 200, basis: 420, basisSource: "broker", accountName: "Paper" };
const repairLegs = (buyQty = 1, sellQty = 2) => [
  { row: C(400, 12), action: "buy", qty: buyQty },
  { row: C(410, 6.5), action: "sell", qty: sellQty }
];

test("a stock repair over free shares: bounded, measured with the shares, against the basis", () => {
  const r = repairSetup(repairLegs(), below);
  assert.equal(r.ok, true);
  const s = r.setup;
  assert.equal(s.strategy, "stock_repair");
  // The order itself is untouched: one unit of a 1:2.
  assert.equal(s.structure, "ratio");
  assert.equal(s.units, 1);
  assert.deepEqual(s.legs.map((l) => `${l.side} ${l.strike} x${l.ratio}`), ["sell 410 x2", "buy 400 x1"]);
  assert.equal(s.credit, 1);
  // (420 + 400 - 1) / 2 = 409.50: break-even falls from 420.
  assert.equal(s.repairBreakEven, 409.5);
  assert.equal(s.breakEvenLow, 409.5);
  // At or above 410: 2 x 410 - 420 - 400 + 1 = +1 a share.
  assert.equal(s.repairCap, 100);
  assert.equal(s.maxProfit, 100);
  // Shares to zero, less the credit: 419 a share.
  assert.equal(s.maxRisk, 41900);
  assert.equal(s.unlimitedRisk, false);
  assert.equal(s.sharesHeld, 200);
});

test("a repair the shares do not cover stays the naked ratio it is", () => {
  const r = repairSetup(repairLegs(), { ...below, shares: 50 });
  assert.equal(r.setup.strategy, "call_spread");
  assert.equal(r.setup.maxRisk, null);
  // Two units need 200 shares: 200 held is enough, 150 is not.
  assert.equal(repairSetup(repairLegs(2, 4), below).setup.strategy, "stock_repair");
  assert.equal(repairSetup(repairLegs(2, 4), { ...below, shares: 150 }).setup.strategy, "call_spread");
});

test("only a 1x2 call ratio is a repair", () => {
  // A plain vertical, a 1x3 and a put ratio are passed through unchanged.
  assert.equal(repairSetup(repairLegs(1, 1), below).setup.structure, "vertical");
  assert.equal(repairSetup(repairLegs(1, 3), below).setup.strategy, "call_spread");
  const puts = [{ row: P(400, 12), action: "buy", qty: 1 }, { row: P(390, 6.5), action: "sell", qty: 2 }];
  assert.equal(repairSetup(puts, below).setup.strategy, "put_spread");
});

test("a repair with no basis on record is measured from today's price, and says so", () => {
  const r = repairSetup(repairLegs(), { ...below, basis: null });
  assert.equal(r.setup.basis, null);
  // (400 + 400 - 1) / 2 would be 399.50, below the long strike: there the
  // break-even is the price less the credit.
  assert.equal(r.setup.repairBreakEven, 399);
  assert.match(r.setup.riskNote, /today's price/);
});

// ---------------------------------------------------------------------------
// protectedRepairSetup — the repair plus a put bought as a floor
// ---------------------------------------------------------------------------

import { protectedRepairSetup } from "./optionChain.js";

const protectedLegs = (u = 1) => [
  { row: P(380, 4), action: "buy", qty: u },
  { row: C(400, 12), action: "buy", qty: u },
  { row: C(410, 6.5), action: "sell", qty: 2 * u }
];

test("a protected repair: one order of three contracts, a floor, a cap, against the basis", () => {
  const r = protectedRepairSetup(protectedLegs(), below);
  assert.equal(r.ok, true);
  const s = r.setup;
  assert.equal(s.strategy, "protected_repair");
  assert.deepEqual(s.legs.map((l) => `${l.side} ${l.type} ${l.strike} x${l.ratio}`), ["sell call 410 x2", "buy call 400 x1", "buy put 380 x1"]);
  assert.equal(s.units, 1);
  // 13 in for the two 410s, 12 out for the 400 call, 4 out for the put.
  assert.equal(s.credit, -3);
  assert.equal(s.debit, 3);
  // Worst at or below 380: 380 - 420 - 3 = -43 a share.
  assert.equal(s.worstFromBasis, -4300);
  assert.equal(s.maxRisk, 4300);
  // Best at or above 410: 820 - 420 - 400 - 3 = -3: the floor costs the
  // repair its recovery here, and the ticket says so rather than hiding it.
  assert.equal(s.repairCap, -300);
  assert.equal(s.repairBreakEven, null);
  // Two units: quantities 2, 2 and 4, still one order of 1:1:2.
  assert.equal(protectedRepairSetup(protectedLegs(2), below).setup.units, 2);
});

test("a protected repair with a break-even", () => {
  // A cheaper put: 13 - 12 - 1 = 0 net. (420 + 400) / 2 = 410: at the short.
  const legs = [{ row: P(370, 1), action: "buy", qty: 1 }, { row: C(400, 12), action: "buy", qty: 1 }, { row: C(410, 6.5), action: "sell", qty: 2 }];
  const s = protectedRepairSetup(legs, below).setup;
  assert.equal(s.repairBreakEven, 410);
  assert.equal(s.repairCap, 0);
  assert.equal(s.maxRisk, 5000);
});

test("a protected repair is refused in the wrong shape or without the shares", () => {
  assert.match(protectedRepairSetup(protectedLegs(), { ...below, shares: 50 }).reason, /50 free/);
  const wrongQty = protectedLegs().map((l, i) => (i === 2 ? { ...l, qty: 3 } : l));
  assert.match(protectedRepairSetup(wrongQty, below).reason, /two calls sold/);
  const highPut = [{ row: P(405, 9), action: "buy", qty: 1 }, ...protectedLegs().slice(1)];
  assert.match(protectedRepairSetup(highPut, below).reason, /at or below the call bought/);
  const otherExpiry = [{ row: P(380, 4, "2026-11-20"), action: "buy", qty: 1 }, ...protectedLegs().slice(1)];
  assert.match(protectedRepairSetup(otherExpiry, below).reason, /same expiry/);
});

// ---------------------------------------------------------------------------
// withEarnings — the earnings warning on a ticket built from the chain
// ---------------------------------------------------------------------------

import { withEarnings } from "./optionChain.js";

const built = (expiry, extra = {}) => ({ ok: true, setup: { ticker: "INTC", expiry, expiries: [expiry], ...extra } });
const cal = (nextEarnings, more = {}) => ({ nextEarnings, earningsUnknown: false, earningsCheckedThrough: "2027-01-11", ...more });

test("earnings before the ticket's expiry is flagged, with the days to it", () => {
  const r = withEarnings(built("2026-11-20"), cal({ date: "2026-10-23", session: "amc" }), "2026-10-13");
  assert.deepEqual(r.setup.earnings, { date: "2026-10-23", session: "amc", daysAway: 10 });
  assert.equal(r.setup.earningsUnknown, false);
});

test("earnings after the expiry is clear; the last leg's expiry is the one that counts", () => {
  assert.equal(withEarnings(built("2026-10-16"), cal({ date: "2026-10-23", session: "amc" }), "2026-10-13").setup.earnings, undefined);
  // A diagonal: near leg before the report, far leg after it.
  const diag = built("2026-10-16", { expiries: ["2026-10-16", "2026-11-20"] });
  assert.equal(withEarnings(diag, cal({ date: "2026-10-23", session: null }), "2026-10-13").setup.earnings.date, "2026-10-23");
});

test("no report found: unknown when the calendar lacks the ticker or the expiry is past what it holds", () => {
  assert.equal(withEarnings(built("2026-11-20"), cal(null, { earningsUnknown: true }), "2026-10-13").setup.earningsUnknown, true);
  const far = withEarnings(built("2027-06-17"), cal(null), "2026-10-13").setup;
  assert.equal(far.earningsUnknown, true);
  assert.match(far.earningsUnknownWhy, /2027-01-11/);
  // Known ticker, inside the window, nothing due: clear, nothing stamped.
  const clear = withEarnings(built("2026-11-20"), cal(null), "2026-10-13");
  assert.equal(clear.setup.earnings, undefined);
  assert.equal(clear.setup.earningsUnknown, undefined);
  // A refusal passes through untouched.
  assert.deepEqual(withEarnings({ ok: false, reason: "x" }, cal(null), "2026-10-13"), { ok: false, reason: "x" });
});

// ---------------------------------------------------------------------------
// chainLegQuantities — three picks on the chain that make a protected repair
// ---------------------------------------------------------------------------

import { chainLegQuantities } from "./optionChain.js";

test("three picks in the protected-repair shape: the call sold goes to twice the call bought", () => {
  const legs = [
    { row: C(410, 6.5), action: "sell", qty: 1, expiry: "2026-10-16" },
    { row: C(400, 12), action: "buy", qty: 1, expiry: "2026-10-16" },
    { row: P(380, 4), action: "buy", qty: 1, expiry: "2026-10-16" }
  ];
  const out = chainLegQuantities(legs);
  assert.deepEqual(out.map((l) => l.qty), [2, 1, 1]);
  // Straight into the builder.
  assert.equal(protectedRepairSetup(out, below).ok, true);
});

test("anything else is left exactly as picked", () => {
  const two = [{ row: C(410, 6.5), action: "sell", qty: 1 }, { row: C(400, 12), action: "buy", qty: 1 }];
  assert.equal(chainLegQuantities(two), two);
  // A count the trader changed is theirs.
  const set = [
    { row: C(410, 6.5), action: "sell", qty: 3, expiry: "2026-10-16" },
    { row: C(400, 12), action: "buy", qty: 1, expiry: "2026-10-16" },
    { row: P(380, 4), action: "buy", qty: 1, expiry: "2026-10-16" }
  ];
  assert.equal(chainLegQuantities(set), set);
  // Wrong shapes: the call sold below the call bought; a put above it; two expiries.
  const low = [{ ...set[0], qty: 1, row: C(390, 15) }, set[1], set[2]];
  assert.equal(chainLegQuantities(low), low);
  const highPut = [{ ...set[0], qty: 1 }, set[1], { ...set[2], row: P(405, 9) }];
  assert.equal(chainLegQuantities(highPut), highPut);
  const otherExp = [{ ...set[0], qty: 1 }, set[1], { ...set[2], expiry: "2026-11-20" }];
  assert.equal(chainLegQuantities(otherExp), otherExp);
});

test("a collar for a count: one put per call, 100 free shares each", () => {
  const legs = (q) => [{ row: P(380, 6), action: "buy", qty: q }, { row: C(430, 7), action: "sell", qty: q }];
  assert.equal(collarSetup(legs(2), held).setup.units, 2);
  assert.match(collarSetup(legs(3), held).reason, /300 for 3/);
  assert.match(collarSetup([{ row: P(380, 6), action: "buy", qty: 1 }, { row: C(430, 7), action: "sell", qty: 2 }], held).reason, /one put for each call/);
});
