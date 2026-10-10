import test from "node:test";
import assert from "node:assert/strict";
import { toEngineActivities, compareTrades, occOf } from "./snaptradeHistory.ts";

// Rows shaped exactly as SnapTrade returned them from the owner's Alpaca paper
// account through SnapTrade on 10 Oct (trimmed to the fields read).
const xopSell = {
  id: "b51c", type: "SELL", price: 0.51, units: -1, trade_date: "2026-10-05T13:39:49.282241Z",
  symbol: { symbol: "XOP", raw_symbol: "XOP" },
  option_symbol: { ticker: "XOP   261009P00177000", option_type: "PUT", strike_price: 177, expiration_date: "2026-10-09" }
};
const expiry = { id: "e1", type: "OPTIONEXPIRATION", units: 1, trade_date: "2026-10-09T00:00:00Z", option_symbol: { ticker: "XOP   261009P00177000" } };
const assignment = { id: "a1", type: "OPTIONASSIGNMENT", units: 1, trade_date: "2026-09-07T00:00:00Z", option_symbol: { ticker: "TSLA  260904P00367500" } };
const shareSale = { id: "s1", type: "SELL", price: 383.6, units: -100, trade_date: "2026-10-09T19:52:33Z", symbol: { symbol: "TSLA", raw_symbol: "TSLA" } };

test("the padded OCC root is closed up", () => {
  assert.equal(occOf("XOP   261009P00177000"), "XOP261009P00177000");
  assert.equal(occOf("TSLA  260904P00367500"), "TSLA260904P00367500");
});

test("option fills, expiries, assignments and share fills become engine rows", () => {
  const { activities, skipped } = toEngineActivities([xopSell, expiry, assignment, shareSale, { type: "FEE", amount: -0.02 }, { type: "OPTRD" }]);
  assert.deepEqual(activities[0], {
    id: "b51c", activity_type: "FILL", symbol: "XOP261009P00177000", side: "sell", qty: 1, price: 0.51,
    transaction_time: "2026-10-05T13:39:49.282241Z", order_id: null
  });
  assert.deepEqual(activities[1], { id: "e1", activity_type: "OPEXP", symbol: "XOP261009P00177000", qty: 1, date: "2026-10-09" });
  assert.equal(activities[2].activity_type, "OPASN");
  assert.equal(activities[2].symbol, "TSLA260904P00367500");
  assert.deepEqual(
    { s: activities[3].symbol, side: activities[3].side, qty: activities[3].qty, price: activities[3].price },
    { s: "TSLA", side: "sell", qty: 100, price: 383.6 }
  );
  assert.deepEqual(skipped, { FEE: 1, OPTRD: 1 });
});

test("an expiry with no contract is set aside, not guessed", () => {
  const { activities, skipped } = toEngineActivities([{ type: "OPTIONEXPIRATION", units: 1, trade_date: "2026-10-09" }]);
  assert.equal(activities.length, 0);
  assert.equal(skipped["OPTIONEXPIRATION without a contract"], 1);
});

test("two readings of one account compare trade by trade", () => {
  const t = (s: string, close: string, reason: string, pl: number, qty = 1) => ({ short_symbol: s, long_symbol: "", close_date: close, close_reason: reason, realized_pl: pl, qty });
  const ours = [t("A", "2026-09-01", "expired", 50), t("B", "2026-09-02", "assigned", 30), t("C", "2026-10-09", "expired", 20)];
  const theirs = [t("A", "2026-09-01", "expired", 50), t("B", "2026-09-02", "assigned", 31)];
  const r = compareTrades(ours, theirs, { to: "2026-10-05" });
  assert.equal(r.matched, 1);
  assert.equal(r.differCount, 1);
  assert.equal(r.onlyOursCount, 0); // C closed after the window
  assert.equal(r.ours.realized, 80);
  assert.equal(r.theirs.realized, 81);
});
