import test from "node:test";
import assert from "node:assert/strict";
import { pairSpreads } from "./spreadPairing.ts";
import { KINDS } from "./positionKinds.ts";

// An Options Wheel account onboarded with a complete history and a completely
// empty positions screen: pairSpreads returned only what it could pair, and a
// wheel has nothing to pair. The regression guard matters as much as the fix —
// the provenance pairing in this file exists because legs bolted to the wrong
// protective long once produced spreads nobody had traded.

const opt = (sym: string, qty: number, entry = 1, price = 1) =>
  ({ symbol: sym, asset_class: "us_option", qty: String(qty), avg_entry_price: String(entry), current_price: String(price) });
const stock = (sym: string, qty: number, entry = 95, mv = 9600) =>
  ({ symbol: sym, asset_class: "us_equity", qty: String(qty), avg_entry_price: String(entry), current_price: "96", market_value: String(mv) });

// AMD 2026-09-18: 465P / 460P / 470C / 475C
const P465 = "AMD260918P00465000";
const P460 = "AMD260918P00460000";
const C470 = "AMD260918C00470000";
const C475 = "AMD260918C00475000";

test("a real put vertical still pairs exactly as before", () => {
  const out = pairSpreads([opt(P465, -1, 3), opt(P460, 1, 1.5)], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "put_spread");
  assert.equal(out[0].shortSymbol, P465);
  assert.equal(out[0].longSymbol, P460);
  assert.equal(out[0].qty, 1);
});

test("an iron condor from one order still pairs as one condor", () => {
  const order = {
    filled_at: "2026-09-01T14:00:00Z",
    legs: [
      { symbol: P465, side: "sell", filled_qty: "1" },
      { symbol: P460, side: "buy", filled_qty: "1" },
      { symbol: C470, side: "sell", filled_qty: "1" },
      { symbol: C475, side: "buy", filled_qty: "1" }
    ]
  };
  const out = pairSpreads(
    [opt(P465, -1), opt(P460, 1), opt(C470, -1), opt(C475, 1)], [], [order]
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "iron_condor");
});

// --- What used to vanish ---------------------------------------------------

test("a lone short put appears instead of vanishing", () => {
  const out = pairSpreads([opt(P465, -2, 3)], [], [], { cash: 200000 });
  assert.equal(out.length, 1, "today this returns an empty array");
  assert.equal(out[0].type, KINDS.CASH_SECURED_PUT);
  assert.equal(out[0].qty, 2);
  assert.equal(out[0].shortSymbol, P465);
  assert.equal(out[0].maxRisk, (465 - 3) * 100 * 2);
  assert.equal(out[0].collateral, 465 * 100 * 2);
});

test("without the cash to secure it, a short put is not called cash-secured", () => {
  const out = pairSpreads([opt(P465, -1, 3)], [], [], { cash: 100 });
  assert.equal(out[0].type, KINDS.NAKED_PUT);
});

test("shares survive buildLegs and are reported", () => {
  const out = pairSpreads([stock("AMD", 100)], []);
  assert.equal(out.length, 1, "line 23 used to drop every share position");
  assert.equal(out[0].type, KINDS.SHARES);
  assert.equal(out[0].shareQty, 100);
});

test("a short call against shares is covered; the shares are then not double-counted", () => {
  const out = pairSpreads([opt(C470, -1, 2), stock("AMD", 100, 95, 9600)], []);
  assert.equal(out.length, 1, "the covering shares must not also appear as a separate row");
  assert.equal(out[0].type, KINDS.COVERED_CALL);
  assert.equal(out[0].shareBasis, 95);
  assert.equal(out[0].maxRisk, 95 * 100 - 2 * 100);
});

test("a short call with no shares is NAKED and carries no risk number", () => {
  const out = pairSpreads([opt(C470, -1, 2)], []);
  assert.equal(out[0].type, KINDS.NAKED_CALL);
  assert.equal(out[0].maxRisk, null, "unbounded loss must never render as a figure");
});

test("surplus shares beyond the covered calls still show as stock", () => {
  const out = pairSpreads([opt(C470, -1, 2), stock("AMD", 300, 95, 28800)], []);
  const kinds = out.map((o) => o.type).sort();
  assert.deepEqual(kinds, [KINDS.COVERED_CALL, KINDS.SHARES].sort());
  const shares = out.find((o) => o.type === KINDS.SHARES);
  assert.equal(shares.shareQty, 200, "100 of the 300 back the call");
});

test("a whole wheel book renders, where today it renders nothing", () => {
  const out = pairSpreads(
    [opt(P465, -1, 3), opt(C470, -1, 2), stock("AMD", 100, 95, 9600)],
    [], [], { cash: 100000 }
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((o) => o.type).sort(), [KINDS.CASH_SECURED_PUT, KINDS.COVERED_CALL].sort());
});

test("a leftover leg from a half-closed spread is not lost either", () => {
  // The short was assigned away; the long remains. On any account, not just a
  // wheel — this is the same hole.
  const out = pairSpreads([opt(P460, 1, 1.5)], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, KINDS.LONG_OPTION);
  assert.equal(out[0].maxRisk, 150);
});

test("a spread plus an unrelated naked leg yields both", () => {
  const out = pairSpreads([opt(P465, -1, 3), opt(P460, 1, 1.5), opt(C470, -1, 2)], []);
  assert.equal(out.length, 2);
  assert.ok(out.some((o) => o.type === "put_spread"));
  assert.ok(out.some((o) => o.type === KINDS.NAKED_CALL));
});

test("a fully closed leg produces no row", () => {
  assert.deepEqual(pairSpreads([opt(P465, 0)], []), []);
  assert.deepEqual(pairSpreads([], []), []);
});
