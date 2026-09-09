import test from "node:test";
import assert from "node:assert/strict";
import { closePlan, deriveUnit, closeAction, MAX_MLEG_LEGS } from "./closePlan.js";

const opt = (symbol, side, qty) => ({ symbol, side, qty, assetClass: "us_option" });
const stk = (symbol, side, qty) => ({ symbol, side, qty, assetClass: "equity" });

test("closing a short is a buy-back; closing a long is a sale", () => {
  assert.equal(closeAction(opt("A", "short", 1)), "buy_to_close");
  assert.equal(closeAction(opt("A", "long", 1)), "sell_to_close");
  assert.equal(closeAction(stk("TSLA", "long", 210)), "sell_to_close");
  assert.equal(closeAction(stk("TSLA", "short", 210)), "buy_to_close");
});

test("the unit is the GCD, not the raw quantities", () => {
  // 1 long and 2 short is ONE unit of a 1:2.
  const a = deriveUnit([opt("A", "long", 1), opt("B", "short", 2)]);
  assert.equal(a.qty, 1);
  assert.deepEqual(a.legs.map((l) => l.ratio), [1, 2]);

  // 2 and 4 is TWO units of a 1:2 — not one unit of a 2:4, which the broker
  // rejects for having a common factor.
  const b = deriveUnit([opt("A", "long", 2), opt("B", "short", 4)]);
  assert.equal(b.qty, 2);
  assert.deepEqual(b.legs.map((l) => l.ratio), [1, 2]);

  // And the totals are preserved either way.
  assert.equal(b.qty * b.legs[0].ratio, 2);
  assert.equal(b.qty * b.legs[1].ratio, 4);
});

test("a zero or missing quantity has no unit", () => {
  assert.equal(deriveUnit([]), null);
  assert.equal(deriveUnit([opt("A", "long", 0)]), null);
});

test("two option legs go as one atomic order", () => {
  const plan = closePlan([opt("A", "short", 1), opt("B", "long", 1)]);
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.atomic, true);
  assert.deepEqual(plan.warnings, [], "nothing to warn about when there is no intermediate state");
});

test("BUY-BACKS FIRST, SALES LAST — the whole point", () => {
  // Deliberately handed in the dangerous order: the sale first.
  const plan = closePlan([
    opt("LONG_CALL", "long", 1),
    opt("SHORT_CALL_A", "short", 2),
    opt("SHORT_CALL_B", "short", 1),
    opt("LONG_PUT", "long", 1),
    opt("SHORT_PUT", "short", 1)
  ]);
  const actions = plan.orders.flatMap((o) => o.legs.map((l) => l.action));
  const lastBuy = actions.lastIndexOf("buy_to_close");
  const firstSell = actions.indexOf("sell_to_close");
  assert.ok(lastBuy < firstSell, "every buy-back must precede every sale");
});

test("five option legs cannot be one order, and the plan says so", () => {
  const legs = [1, 2, 3, 4, 5].map((i) => opt(`S${i}`, "short", 1));
  const plan = closePlan(legs);
  assert.equal(plan.atomic, false);
  assert.equal(plan.orders.length, 2);
  assert.ok(plan.orders.every((o) => o.legs.length <= MAX_MLEG_LEGS));
  assert.match(plan.warnings[0], /at most 4 option legs/);
});

test("shares never share an order with contracts, and go last", () => {
  const plan = closePlan([stk("TSLA", "long", 210), opt("C", "short", 2)]);
  assert.equal(plan.orders.length, 2);
  assert.equal(plan.orders[0].kind, "options", "the buy-back goes first");
  assert.equal(plan.orders[1].kind, "equity", "the share sale — which removes the cover — goes last");
  assert.equal(plan.orders[1].qty, 210);
});

test("the owner's TSLA book: six option legs and 210 shares", () => {
  // 2 long + 4 short contracts + the share lot, as the panel shows them.
  const plan = closePlan([
    stk("TSLA", "long", 210),
    opt("C352.50", "long", 1),
    opt("C362.50", "short", 2),
    opt("P365", "long", 1),
    opt("P352.50", "short", 1),
    opt("C375", "short", 1)
  ]);
  assert.equal(plan.atomic, false);
  // Buy-backs: 3 short option legs -> one order. Sales: 2 long option legs ->
  // one order. Shares -> one order. Three in total, in that order.
  assert.deepEqual(plan.orders.map((o) => o.kind), ["options", "options", "equity"]);
  assert.deepEqual(plan.orders[0].legs.map((l) => l.action), ["buy_to_close", "buy_to_close", "buy_to_close"]);
  assert.deepEqual(plan.orders[1].legs.map((l) => l.action), ["sell_to_close", "sell_to_close"]);
  assert.equal(plan.orders[2].legs[0].action, "sell_to_close");
  // The share sale is last, so the calls written against those shares are
  // already bought back by the time the cover goes.
  assert.equal(plan.orders.at(-1).kind, "equity");
  assert.equal(plan.warnings.length, 2);
});

test("a selection of only buy-backs warns about splitting but not about cover", () => {
  const legs = [1, 2, 3, 4, 5].map((i) => opt(`S${i}`, "short", 1));
  const plan = closePlan(legs);
  assert.equal(plan.warnings.length, 1, "nothing is being sold, so no cover can be removed");
});

test("empty and junk selections produce no orders", () => {
  assert.deepEqual(closePlan([]).orders, []);
  assert.deepEqual(closePlan(null).orders, []);
  assert.deepEqual(closePlan([{ symbol: null, qty: 1 }]).orders, []);
  assert.deepEqual(closePlan([opt("A", "short", 0)]).orders, []);
});

test("a four-leg condor stays atomic, mixed directions and all", () => {
  // The case the first version of this got wrong: it split by risk direction
  // unconditionally, turning an ordinary spread into two orders and giving up
  // the net price that is the reason to close a spread as a spread.
  const plan = closePlan([
    opt("PUT_SHORT", "short", 1),
    opt("PUT_LONG", "long", 1),
    opt("CALL_SHORT", "short", 1),
    opt("CALL_LONG", "long", 1)
  ]);
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.atomic, true);
  assert.equal(plan.orders[0].legs.length, 4);
  assert.deepEqual(plan.warnings, []);
});
