import test from "node:test";
import assert from "node:assert/strict";
import { toAlpacaPositions, toAlpacaInfo, toAlpacaMultiLegOrders, contractOf, listOf } from "./snaptradeAccount.ts";

// A share row exactly as /positions/all returned it for the owner's paper
// account on 10 Oct.
const amzn = {
  price: "262.43", units: "100", currency: "USD", cost_basis: "226.91",
  instrument: { kind: "stock", symbol: "AMZN", raw_symbol: "AMZN" }
};

test("the list is found wherever the response puts it", () => {
  assert.equal(listOf({ results: [amzn], data_freshness: "x" }).length, 1);
  assert.equal(listOf([amzn]).length, 1);
  assert.equal(listOf(null).length, 0);
});

test("a share row reads as an Alpaca position", () => {
  const [p] = toAlpacaPositions([amzn]);
  assert.equal(p.symbol, "AMZN");
  assert.equal(p.qty, "100");
  assert.equal(p.side, "long");
  assert.equal(p.asset_class, "us_equity");
  assert.equal(p.avg_entry_price, "226.91");
  assert.equal(p.current_price, "262.43");
  assert.equal(Number(p.unrealized_pl).toFixed(2), "3552.00"); // DeltaMint's own native figure for this lot
});

test("an option row is read from wherever the contract is named", () => {
  const short = { units: "-1", price: "0.40", cost_basis: "1.20", instrument: { kind: "option", symbol: "TSLA  261009C00382500" } };
  const [p] = toAlpacaPositions([short]);
  assert.equal(p.symbol, "TSLA261009C00382500");
  assert.equal(p.side, "short");
  assert.equal(p.asset_class, "us_option");
  assert.equal(Number(p.market_value), -40);
  assert.equal(p.priceUnitUnverified, true);
  assert.equal(contractOf({ option_symbol: { ticker: "XOP   261009P00177000" } }), "XOP261009P00177000");
  assert.equal(contractOf(amzn), null);
});

test("empty and unreadable rows are dropped", () => {
  assert.equal(toAlpacaPositions([{ units: "0", instrument: { symbol: "X" } }, { units: "5" }]).length, 0);
});

test("balances read as the account figures", () => {
  const info = toAlpacaInfo({ balance: { total: { amount: 155370.88 } } }, [{ currency: { code: "USD" }, cash: -40131.12, buying_power: 356265.12 }]);
  assert.deepEqual(info, { equity: "155370.88", cash: "-40131.12", buying_power: "356265.12", options_buying_power: "356265.12" });
});

test("legs sharing a group id become one multi-leg order", () => {
  const leg = (sym: string, action: string) => ({
    action, status: "EXECUTED", filled_quantity: "1.0", time_executed: "2026-09-16T19:28:07Z",
    brokerage_group_order_id: "72407a76", option_symbol: { ticker: sym }
  });
  const orders = toAlpacaMultiLegOrders([
    leg("AMD   260918C00527500", "SELL_OPEN"),
    leg("AMD   260918C00530000", "BUY_OPEN"),
    { ...leg("XOP   261009P00177000", "SELL_OPEN"), brokerage_group_order_id: null }
  ]);
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].legs.map((l: any) => [l.symbol, l.side]), [
    ["AMD260918C00527500", "sell"],
    ["AMD260918C00530000", "buy"]
  ]);
});
