import { test } from "node:test";
import assert from "node:assert/strict";
import { shareMoves, SHARE_EVENTS } from "./shareMoves.ts";

const at = (s: string) => Date.parse(s);
const sec = (s: string) => Date.parse(s) / 1000;

test("the filter asks only for types Alpaca accepts as filters (no SSP or SSO)", () => {
  const types = SHARE_EVENTS.split(",");
  assert.ok(!types.includes("SSP") && !types.includes("SSO"));
  for (const t of ["OPTRD", "OPASN", "OPEXC", "CFEE", "SPLIT", "SPIN", "ACATS", "JNLS"]) assert.ok(types.includes(t), t);
});

// 19 Nov review, case 2: a short 230 put assigned at Friday 13 Nov's expiry;
// however Alpaca dates the OPTRD, the shares are Friday's, from the start of
// Friday's trading day (Thursday 20:00).
test("an assignment at expiry counts on the expiry's trading day, at the strike", () => {
  const opasn = { activity_type: "OPASN", symbol: "XYZ261113P00230000", qty: "1", date: "2026-11-16", group_id: "g1" };
  for (const date of ["2026-11-13", "2026-11-14", "2026-11-16"]) {
    const optrd = { activity_type: "OPTRD", symbol: "XYZ", qty: "100", net_amount: "-23000", price: "230", date, group_id: "g1" };
    // A week view from Monday 9 Nov: delivered inside it.
    const week = shareMoves([opasn, optrd], [], at("2026-11-07T01:00:00Z"));
    assert.deepEqual(week.deliveries, [{ symbol: "XYZ", side: "buy", qty: 100, price: 230, time: sec("2026-11-13T01:00:00Z"), orderId: null, delivery: true }], date);
    assert.deepEqual(week.heldBack, []);
    // Monday 16 Nov's Today (from Friday 20:00): delivered before, so held from before.
    const monday = shareMoves([opasn, optrd], [], at("2026-11-14T01:00:00Z"));
    assert.deepEqual(monday.deliveries, [], date);
    assert.deepEqual(monday.heldBack, [], date);
  }
});

test("an early assignment counts on its own date; paired by underlying when there is no group", () => {
  const opasn = { activity_type: "OPASN", symbol: "ABC261218C00045000", qty: "1", date: "2026-11-13" };
  const optrd = { activity_type: "OPTRD", symbol: "ABC", qty: "-100", net_amount: "4500", price: "45", date: "2026-11-13" };
  const { deliveries, heldBack } = shareMoves([opasn, optrd], [], at("2026-11-03T01:00:00Z"));
  assert.deepEqual(deliveries.map((d) => [d.side, d.qty, d.price, d.time]), [["sell", 100, 45, sec("2026-11-13T01:00:00Z")]]);
  assert.deepEqual(heldBack, []);
});

test("bought or sold by the cash that moved; held back when the quantity's sign disagrees", () => {
  // A sale with the quantity given as positive: cash in, so sold.
  const sale = { activity_type: "OPTRD", symbol: "ABC", qty: "100", net_amount: "4500", date: "2026-11-13" };
  assert.equal(shareMoves([sale], [], at("2026-11-10T01:00:00Z")).deliveries[0]?.side, undefined);
  assert.deepEqual(shareMoves([sale], [], at("2026-11-10T01:00:00Z")).heldBack, [{ symbol: "ABC", type: "OPTRD", date: "2026-11-13" }]);
  // No cash given: the quantity's sign.
  const noCash = { activity_type: "OPTRD", symbol: "ABC", qty: "-100", price: "45", date: "2026-11-13" };
  assert.equal(shareMoves([noCash], [], at("2026-11-10T01:00:00Z")).deliveries[0].side, "sell");
});

test("a cash-settled index option delivers no shares: nothing held back", () => {
  const spx = { activity_type: "OPASN", symbol: "SPXW261113P05800000", qty: "1", date: "2026-11-13" };
  assert.deepEqual(shareMoves([spx], [], at("2026-11-10T01:00:00Z")).heldBack, []);
});

test("a delivery dated the Monday after, sold that morning: bought first", () => {
  // Assigned early (contract expires in December), the OPTRD dated Monday 16 Nov.
  const optrd = { activity_type: "OPTRD", symbol: "XYZ", qty: "100", net_amount: "-5000", date: "2026-11-16" };
  const [d] = shareMoves([optrd], [], at("2026-11-14T01:00:00Z")).deliveries;
  assert.ok(d.time < sec("2026-11-16T14:45:00Z"));
  assert.equal(d.time, sec("2026-11-14T01:00:00Z"));
});

test("the price comes from the cash moved when Alpaca's price field disagrees", () => {
  // Alpaca's own example: 200 shares, net -30000, "price": "90".
  const optrd = { activity_type: "OPTRD", symbol: "AAPL", qty: "200", net_amount: "-30000", price: "90", date: "2026-11-13" };
  assert.equal(shareMoves([optrd], [], at("2026-11-10T01:00:00Z")).deliveries[0].price, 150);
});

test("a delivery also listed as a fill with no order is counted once", () => {
  const optrd = { activity_type: "OPTRD", symbol: "XYZ", qty: "100", net_amount: "-5500", date: "2026-11-13" };
  const listed = [{ symbol: "XYZ", side: "buy" as const, qty: 100, price: 55, time: sec("2026-11-13T14:30:00Z"), orderId: null }];
  assert.deepEqual(shareMoves([optrd], listed, at("2026-11-10T01:00:00Z")).deliveries, []);
  // The same size bought by an order of its own is a different trade.
  const ordered = [{ ...listed[0], orderId: "o1" }];
  assert.equal(shareMoves([optrd], ordered, at("2026-11-10T01:00:00Z")).deliveries.length, 1);
});

test("held back: a split, a transfer, an assignment whose shares were not found; not before the start", () => {
  const events = [
    { activity_type: "SPLIT", symbol: "SPL", date: "2026-11-16" },
    { activity_type: "ACATS", symbol: "TRF", date: "2026-11-12", qty: "50" },
    { activity_type: "OPEXC", symbol: "QQQ261120C00500000", qty: "-1", date: "2026-11-17" },
    { activity_type: "SPLIT", symbol: "OLD", date: "2026-11-01" },
    { activity_type: "MA", date: "2026-11-12" }
  ];
  const { heldBack } = shareMoves(events, [], at("2026-11-10T01:00:00Z"));
  assert.deepEqual(heldBack, [
    { symbol: "SPL", type: "SPLIT", date: "2026-11-16" },
    { symbol: "TRF", type: "ACATS", date: "2026-11-12" },
    { symbol: "", type: "MA", date: "2026-11-12" },
    { symbol: "QQQ", type: "OPEXC", date: "2026-11-17" }
  ]);
});

test("coin fees: taken in the coin handed on; a fee in dollars is not", () => {
  const events = [
    { activity_type: "CFEE", symbol: "ETHUSD", qty: "-0.000195", price: "1884.5", net_amount: "0", date: "2026-11-12" },
    { activity_type: "CFEE", symbol: "ETHUSD", qty: "0", net_amount: "-1.25", date: "2026-11-12" }
  ];
  const { fees, heldBack } = shareMoves(events, [], at("2026-11-10T01:00:00Z"), (s) => (s === "ETHUSD" ? "ETH/USD" : s));
  assert.deepEqual(fees, [{ symbol: "ETH/USD", qty: 0.000195, time: sec("2026-11-12T23:59:59Z") }]);
  assert.deepEqual(heldBack, []);
});

test("an option's own trade (OPTRD on a contract) is left alone", () => {
  const { deliveries, heldBack } = shareMoves([{ activity_type: "OPTRD", symbol: "XYZ261113P00230000", qty: "1", net_amount: "-150", date: "2026-11-12" }], [], at("2026-11-10T01:00:00Z"));
  assert.deepEqual(deliveries, []);
  assert.deepEqual(heldBack, []);
});
