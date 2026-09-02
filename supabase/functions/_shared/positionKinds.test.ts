import test from "node:test";
import assert from "node:assert/strict";
import {
  KINDS, classifyLeg, riskOfKind, collateralOfKind, breakEvenOfKind, stressLossOfKind, totalRisk, STOCK_LIKE
} from "./positionKinds.ts";

// An Options Wheel account onboarded with a full history and an empty positions
// screen. Its whole book — cash-secured puts, covered calls, assigned shares —
// fell through pairSpreads, which returns only what it can pair. These tests
// are that account.

const put = (strike: number, qty: number, credit = 2) =>
  ({ symbol: "X", ticker: "X", optionType: "P", strike, qty, avgEntryPrice: credit });
const call = (strike: number, qty: number, credit = 2) =>
  ({ symbol: "X", ticker: "X", optionType: "C", strike, qty, avgEntryPrice: credit });

test("a lone short put is a position, not nothing", () => {
  // Today pairSide finds no protective long and emits nothing at all.
  assert.equal(classifyLeg(put(100, -1), { cash: 10000 }), KINDS.CASH_SECURED_PUT);
});

test("a lone short put is cash-secured whatever the cash balance says", () => {
  // Alpaca has no uncovered tier: if the order went through, the collateral was
  // there. On a margin account cash sits below the strike while buying power
  // covers it -- the old cash test called a real CSP "uncovered".
  assert.equal(classifyLeg(put(100, -1), { cash: 10000 }), KINDS.CASH_SECURED_PUT);
  assert.equal(classifyLeg(put(100, -1), { cash: 9999 }), KINDS.CASH_SECURED_PUT);
  assert.equal(classifyLeg(put(100, -1), {}), KINDS.CASH_SECURED_PUT);
});

// --- Stress loss: the number that rolls into the account ---------------------

test("the JNJ card: stock-to-zero is $25,520, the 15% shock is about $3,400", () => {
  // Spot 260, 257.20 strike, $2 credit. The full strike is what one position
  // can lose; it is not what a portfolio risks, and it is not what a margin
  // engine charges.
  const p = { ...put(257.2, -1, 2), stockPrice: 260 };
  assert.equal(riskOfKind(KINDS.CASH_SECURED_PUT, p), 25520);
  const stress = stressLossOfKind(KINDS.CASH_SECURED_PUT, p, 0.15);
  // 260 * 0.85 = 221; intrinsic 36.20; less $2 credit = 34.20 * 100
  assert.equal(stress, 3420);
});

test("a short put the move does not reach survives it", () => {
  const p = { ...put(200, -1, 2), stockPrice: 260 }; // 23% OTM
  assert.equal(stressLossOfKind(KINDS.CASH_SECURED_PUT, p, 0.15), 0);
});

test("a covered call's shock is the shares' drop less its credit", () => {
  const p = { ...call(120, -1, 2), stockPrice: 100, shareBasis: 95 };
  assert.equal(stressLossOfKind(KINDS.COVERED_CALL, p, 0.15), 1300, "100 shares * $15 - $200");
});

test("shares lose the move, no more", () => {
  assert.equal(stressLossOfKind(KINDS.SHARES, { shareQty: 100, stockPrice: 100 }, 0.15), 1500);
});

test("a naked call still has no max loss, but has a loss at the defined move", () => {
  const p = { ...call(105, -1, 2), stockPrice: 100 };
  assert.equal(riskOfKind(KINDS.NAKED_CALL, p), null);
  assert.equal(stressLossOfKind(KINDS.NAKED_CALL, p, 0.15), 800, "115 - 105 = 10, less $2 credit");
});

test("no spot means no shock figure, not a zero", () => {
  assert.equal(stressLossOfKind(KINDS.CASH_SECURED_PUT, put(100, -1), 0.15), null);
});

test("the move is a parameter, not a constant", () => {
  const p = { ...put(257.2, -1, 2), stockPrice: 260 };
  assert.ok(stressLossOfKind(KINDS.CASH_SECURED_PUT, p, 0.25)! > stressLossOfKind(KINDS.CASH_SECURED_PUT, p, 0.15)!);
});

test("spreads are not stock-like; every single kind is", () => {
  for (const k of Object.values(KINDS)) assert.ok(STOCK_LIKE.has(k), k);
  assert.equal(STOCK_LIKE.has("put_spread"), false);
  assert.equal(STOCK_LIKE.has("iron_condor"), false);
});

test("shares cover a call; missing shares make it naked", () => {
  assert.equal(classifyLeg(call(120, -1), { shares: 100 }), KINDS.COVERED_CALL);
  assert.equal(classifyLeg(call(120, -1), { shares: 99 }), KINDS.NAKED_CALL);
  assert.equal(classifyLeg(call(120, -1), { shares: 0 }), KINDS.NAKED_CALL);
});

test("a partially covered holding reports as naked, because the naked part is the story", () => {
  // Ten short calls against 100 shares is one covered and nine uncovered. The
  // nine are what can bankrupt someone.
  assert.equal(classifyLeg(call(120, -10), { shares: 100 }), KINDS.NAKED_CALL);
  assert.equal(classifyLeg(call(120, -10), { shares: 1000 }), KINDS.COVERED_CALL);
});

test("a long leg is a long option whatever else is held", () => {
  assert.equal(classifyLeg(put(100, 2), { cash: 0, shares: 0 }), KINDS.LONG_OPTION);
  assert.equal(classifyLeg(call(120, 1), { shares: 0 }), KINDS.LONG_OPTION);
});

test("a closed-out leg classifies as nothing rather than as a position", () => {
  assert.equal(classifyLeg(put(100, 0), { cash: 1e9 }), null);
});

// --- Risk ------------------------------------------------------------------

test("a naked call has NO risk number — never zero", () => {
  const r = riskOfKind(KINDS.NAKED_CALL, call(120, -1));
  assert.equal(r, null, "unbounded loss must not be reported as a figure");
  assert.notEqual(r, 0);
});

test("a cash-secured put risks the strike less the credit, and ties up the strike", () => {
  const p = put(100, -2, 2);
  assert.equal(riskOfKind(KINDS.CASH_SECURED_PUT, p), 19600, "(100 - 2) * 100 * 2");
  assert.equal(collateralOfKind(KINDS.CASH_SECURED_PUT, p), 20000, "the broker holds the full strike");
});

test("a covered call's risk is the shares' downside, not a spread width", () => {
  // Basis $95, one contract, $2 collected: 95*100 - 2*100.
  const p = { ...call(120, -1, 2), shareBasis: 95 };
  assert.equal(riskOfKind(KINDS.COVERED_CALL, p), 9300);
});

test("a long option risks only its premium", () => {
  assert.equal(riskOfKind(KINDS.LONG_OPTION, put(100, 3, 1.5)), 450);
});

test("shares risk what they COST, on the same convention as every other row", () => {
  // Bought at 95, now 80: the $15 drop is already in unrealized P/L. Reporting
  // market value here would count it twice against the same row.
  assert.equal(riskOfKind(KINDS.SHARES, { shareQty: 100, avgEntryPrice: 95, marketValue: 8000 }), 9500);
  assert.equal(riskOfKind(KINDS.SHARES, { shareQty: 100, shareBasis: 91, avgEntryPrice: 95 }), 9100, "adjusted basis wins when present");
});

test("the adjusted basis lowers a covered call's max loss by exactly the premiums collected", () => {
  const broker = riskOfKind(KINDS.COVERED_CALL, { ...call(120, -1, 2), shareBasis: 95 });
  const adjusted = riskOfKind(KINDS.COVERED_CALL, { ...call(120, -1, 2), shareBasis: 90 });
  assert.equal(broker - adjusted, 500, "$5 of collected premium is $500 less at risk per contract");
});

test("break-even is the number a wheel is run against", () => {
  assert.equal(breakEvenOfKind(KINDS.CASH_SECURED_PUT, put(100, -1, 2)), 98);
  assert.equal(breakEvenOfKind(KINDS.COVERED_CALL, { ...call(120, -1, 2), shareBasis: 95 }), 93, "OIC: stock cost less call premium");
  assert.equal(breakEvenOfKind(KINDS.NAKED_CALL, call(120, -1, 2)), 122);
  assert.equal(breakEvenOfKind(KINDS.SHARES, { avgEntryPrice: 95 }), 95);
});

test("covered calls and shares tie up the shares at what they are worth now", () => {
  assert.equal(collateralOfKind(KINDS.COVERED_CALL, { ...call(120, -2), shareMarketPrice: 110 }), 22000);
  assert.equal(collateralOfKind(KINDS.SHARES, { marketValue: -8000 }), 8000);
  assert.equal(collateralOfKind(KINDS.COVERED_CALL, call(120, -1)), null, "no price, no figure");
});

// --- Totals ----------------------------------------------------------------

test("one undefined risk makes the whole total incomplete", () => {
  const t = totalRisk([
    { ticker: "AMD", maxRisk: 500 },
    { ticker: "TSLA", maxRisk: null }
  ]);
  assert.equal(t.complete, false, "a tidy total that omits an unlimited liability is a lie");
  assert.deepEqual(t.undefinedRisk, ["TSLA"]);
  assert.equal(t.risk, 500, "the known part is still reported, just not as the whole");
});

test("an all-known book totals cleanly", () => {
  const t = totalRisk([{ ticker: "A", maxRisk: 100 }, { ticker: "B", maxRisk: 250.5 }]);
  assert.deepEqual(t, { risk: 350.5, complete: true, undefinedRisk: [] });
});

test("NaN and undefined are treated as unknown, not as zero", () => {
  assert.equal(totalRisk([{ ticker: "A", maxRisk: NaN }]).complete, false);
  assert.equal(totalRisk([{ ticker: "A" }]).complete, false);
  assert.equal(totalRisk([]).complete, true);
});
