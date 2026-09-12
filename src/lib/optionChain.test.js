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
