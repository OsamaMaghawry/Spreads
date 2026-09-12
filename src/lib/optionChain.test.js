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
