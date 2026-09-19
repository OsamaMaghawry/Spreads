import { test } from "node:test";
import assert from "node:assert/strict";
import { setups, splitSetups, setupTotals, byTicker } from "./campaigns.js";

// Alton's TSLA wheel, 7-18 September 2026, verbatim from production. This is
// the position the owner was objecting to: two puts assigned into 200 shares,
// six covered calls written on them, the calls bought back into a rally for
// -$1,674 while the shares were sold into the same rally for +$1,258.91.
const TSLA_LEGS = [
  { id: "p1", ticker: "TSLA", strategy: "cash_secured_put", open_date: "2026-09-03", close_date: "2026-09-07", close_reason: "assigned", chain_id: "TSLA260904P00362500@2026-09-07", realized_pl: 1402.91, premium_pl: 144, early_close_pl: 0, stock_pl: 1258.91 },
  { id: "p2", ticker: "TSLA", strategy: "cash_secured_put", open_date: "2026-09-03", close_date: "2026-09-07", close_reason: "assigned", chain_id: "TSLA260904P00367500@2026-09-07", realized_pl: 160, premium_pl: 160, early_close_pl: 0, stock_pl: 0 },
  { id: "c1", ticker: "TSLA", strategy: "covered_call", open_date: "2026-09-08", close_date: "2026-09-09", close_reason: "closed", chain_id: null, realized_pl: -1832, premium_pl: 1738, early_close_pl: -3570, stock_pl: 0 },
  { id: "c2", ticker: "TSLA", strategy: "covered_call", open_date: "2026-09-08", close_date: "2026-09-09", close_reason: "closed", chain_id: null, realized_pl: -389, premium_pl: 226, early_close_pl: -615, stock_pl: 0 },
  { id: "c3", ticker: "TSLA", strategy: "covered_call", open_date: "2026-09-09", close_date: "2026-09-10", close_reason: "closed", chain_id: null, realized_pl: 181, premium_pl: 210, early_close_pl: -29, stock_pl: 0 },
  { id: "c4", ticker: "TSLA", strategy: "covered_call", open_date: "2026-09-10", close_date: "2026-09-11", close_reason: "expired", chain_id: null, realized_pl: 133, premium_pl: 133, early_close_pl: 0, stock_pl: 0 },
  { id: "c5", ticker: "TSLA", strategy: "covered_call", open_date: "2026-09-14", close_date: "2026-09-16", close_reason: "closed", chain_id: null, realized_pl: 120, premium_pl: 131, early_close_pl: -11, stock_pl: 0 },
  { id: "c6", ticker: "TSLA", strategy: "covered_call", open_date: "2026-09-16", close_date: "2026-09-18", close_reason: "expired", chain_id: null, realized_pl: 113, premium_pl: 113, early_close_pl: 0, stock_pl: 0 }
];
const TSLA_LOTS = [
  { id: "l1", ticker: "TSLA", qty: 10, acquired_date: "2026-09-07", acquired_price: 362.5, disposed_date: "2026-09-09", acquired_chain_id: "TSLA260904P00362500@2026-09-07", disposed_chain_id: null },
  { id: "l2", ticker: "TSLA", qty: 100, acquired_date: "2026-09-07", acquired_price: 367.5, disposed_date: null, acquired_chain_id: "TSLA260904P00367500@2026-09-07", disposed_chain_id: null },
  { id: "l3", ticker: "TSLA", qty: 90, acquired_date: "2026-09-07", acquired_price: 362.5, disposed_date: "2026-09-09", acquired_chain_id: "TSLA260904P00362500@2026-09-07", disposed_chain_id: null }
];

// The two spreads the owner named as real losses. No shares, no chain, nothing
// to group with — and this grouping must leave them exactly as they are.
const SPREADS = [
  { id: "w1", ticker: "WMT", strategy: "spreads", open_date: "2026-08-18", close_date: "2026-08-21", close_reason: "closed", chain_id: null, realized_pl: -1210, premium_pl: 305, early_close_pl: -1515, stock_pl: 0 },
  { id: "a1", ticker: "ARKK", strategy: "spreads", open_date: "2026-08-18", close_date: "2026-08-21", close_reason: "closed", chain_id: null, realized_pl: -2240, premium_pl: 176, early_close_pl: -2416, stock_pl: 0 }
];

const find = (list, ticker) => list.filter((s) => s.ticker === ticker);

test("the TSLA wheel is one setup, not eight trades in three strategy buckets", () => {
  const list = setups(TSLA_LEGS, TSLA_LOTS);
  assert.equal(list.length, 1);
  const s = list[0];
  assert.equal(s.ticker, "TSLA");
  assert.equal(s.legs.length, 8);
  assert.equal(s.lots.length, 3);
  assert.equal(s.from, "2026-09-03");
  assert.equal(s.to, "2026-09-18");
});

test("the setup's booked result is -$111.09, not the -$1,674 the covered-call row shows", () => {
  const [s] = setups(TSLA_LEGS, TSLA_LOTS);
  // 1402.91 + 160 - 1832 - 389 + 181 + 133 + 120 + 113
  assert.equal(Math.round(s.booked * 100) / 100, -111.09);
  // And the calls on their own really are -$1,674 — the strategy row is not
  // wrong about its own arithmetic, it is wrong about what it is describing.
  const calls = s.legs.filter((t) => t.strategy === "covered_call");
  assert.equal(calls.reduce((a, t) => a + t.realized_pl, 0), -1674);
});

test("the setup is still running, so its result is money so far and it says so", () => {
  const [s] = setups(TSLA_LEGS, TSLA_LOTS);
  assert.equal(s.open, true);
  assert.equal(s.sharesOpen, 100);
  assert.equal(s.sharesCost, 36750);
});

test("the setup names the strategies it was split across", () => {
  const [s] = setups(TSLA_LEGS, TSLA_LOTS);
  assert.deepEqual(s.split.slice().sort(), ["cash_secured_put", "covered_call"]);
  assert.equal(splitSetups(setups(TSLA_LEGS, TSLA_LOTS)).length, 1);
});

test("the share result stays on the row that owns it and is not double counted", () => {
  const [s] = setups(TSLA_LEGS, TSLA_LOTS);
  assert.equal(s.sharePL, 1258.91);
  assert.equal(Math.round((s.optionPL + s.sharePL) * 100) / 100, Math.round(s.booked * 100) / 100);
});

test("a spread with no shares behind it stands alone and keeps its loss", () => {
  const list = setups(SPREADS, []);
  assert.equal(list.length, 2);
  assert.deepEqual(find(list, "WMT")[0].booked, -1210);
  assert.deepEqual(find(list, "ARKK")[0].booked, -2240);
  assert.deepEqual(find(list, "WMT")[0].split, []);
  assert.equal(find(list, "ARKK")[0].open, false);
});

test("a covered call that never overlapped the shares is not swept into the setup", () => {
  const stray = { id: "c9", ticker: "TSLA", strategy: "covered_call", open_date: "2026-08-01", close_date: "2026-08-05", close_reason: "closed", chain_id: null, realized_pl: -500, premium_pl: 100, early_close_pl: -600, stock_pl: 0 };
  const list = setups([...TSLA_LEGS, stray], TSLA_LOTS);
  assert.equal(list.length, 2);
  const alone = list.find((s) => s.legs.length === 1);
  assert.equal(alone.legs[0].id, "c9");
  assert.equal(alone.booked, -500);
});

test("a covered call on another ticker is never linked to these shares", () => {
  const other = { id: "n1", ticker: "NVDA", strategy: "covered_call", open_date: "2026-09-08", close_date: "2026-09-09", close_reason: "closed", chain_id: null, realized_pl: -300, premium_pl: 50, early_close_pl: -350, stock_pl: 0 };
  const list = setups([...TSLA_LEGS, other], TSLA_LOTS);
  assert.equal(list.length, 2);
  assert.equal(find(list, "NVDA")[0].legs.length, 1);
});

test("a cash-secured put opened while shares are held is the next turn, not this one", () => {
  // Secured by cash, not by the shares — linking it would move its result onto
  // a position it was never part of.
  const nextTurn = { id: "p9", ticker: "TSLA", strategy: "cash_secured_put", open_date: "2026-09-16", close_date: "2026-09-18", close_reason: "expired", chain_id: null, realized_pl: 83, premium_pl: 83, early_close_pl: 0, stock_pl: 0 };
  const list = setups([...TSLA_LEGS, nextTurn], TSLA_LOTS);
  assert.equal(list.length, 2);
  assert.equal(list.find((s) => s.legs.length === 1).legs[0].id, "p9");
});

test("a long put alongside the shares is left standing alone", () => {
  const hedge = { id: "lp1", ticker: "TSLA", strategy: "long_put", open_date: "2026-09-08", close_date: "2026-09-09", close_reason: "closed", chain_id: null, realized_pl: -249, premium_pl: -882, early_close_pl: 633, stock_pl: 0 };
  const list = setups([...TSLA_LEGS, hedge], TSLA_LOTS);
  assert.equal(list.length, 2);
  assert.equal(list.find((s) => s.legs.length === 1).legs[0].id, "lp1");
});

test("a call assigned away closes the setup through the disposal chain", () => {
  const legs = [
    { id: "cspx", ticker: "XLI", strategy: "cash_secured_put", open_date: "2026-08-17", close_date: "2026-08-20", close_reason: "assigned", chain_id: "XLI-IN", realized_pl: -650, premium_pl: 150, early_close_pl: 0, stock_pl: -800 },
    { id: "ccx", ticker: "XLI", strategy: "covered_call", open_date: "2026-08-20", close_date: "2026-08-21", close_reason: "assigned", chain_id: "XLI-OUT", realized_pl: 60, premium_pl: 60, early_close_pl: 0, stock_pl: 0 }
  ];
  const lots = [{ id: "lx", ticker: "XLI", qty: 200, acquired_date: "2026-08-20", acquired_price: 186, disposed_date: "2026-08-21", acquired_chain_id: "XLI-IN", disposed_chain_id: "XLI-OUT" }];
  const list = setups(legs, lots);
  assert.equal(list.length, 1);
  assert.equal(list[0].legs.length, 2);
  assert.equal(list[0].open, false);
  assert.equal(list[0].booked, -590);
});

test("shares with no legs in the window do not invent a setup", () => {
  const list = setups(SPREADS, TSLA_LOTS);
  assert.equal(list.length, 2);
  assert.equal(list.every((s) => s.ticker !== "TSLA"), true);
});

test("the totals count only setups that finished, which is the figure he asked for", () => {
  const t = setupTotals(setups([...TSLA_LEGS, ...SPREADS], TSLA_LOTS));
  assert.equal(t.setups, 3);
  assert.equal(t.stillOpen, 1);
  // WMT and ARKK, and nothing else. The TSLA wheel is still running, so it is
  // not counted as a loss it has not taken.
  assert.equal(t.settledLossCount, 2);
  assert.equal(t.settledLosses, -3450);
  assert.equal(Math.round(t.booked * 100) / 100, -3561.09);
});

test("setups come back newest first", () => {
  const list = setups([...TSLA_LEGS, ...SPREADS], TSLA_LOTS);
  assert.deepEqual(list.map((s) => s.ticker), ["TSLA", "WMT", "ARKK"]);
});

test("an empty window is empty, not a setup of nothing", () => {
  assert.deepEqual(setups([], TSLA_LOTS), []);
  assert.deepEqual(setups(null, null), []);
});

test("a withheld row taints the setup it sits in", () => {
  const legs = TSLA_LEGS.map((t) => (t.id === "c1" ? { ...t, integrity_code: "impossible_loss" } : t));
  assert.equal(setups(legs, TSLA_LOTS)[0].withheld, 1);
});

// ---------------------------------------------------------------------------
// The roll-up must not lose a position.
//
// The first version of the panel filtered to multi-leg setups in JSX and showed
// six of this account's 135 positions under a heading that claimed to be all of
// them. These are the assertions that would have caught it.
// ---------------------------------------------------------------------------

// Twelve NVDA cash-secured puts that expired worthless — no shares, no second
// leg, nothing to group. Every one is a complete position and must be counted.
const NVDA_PUTS = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`, ticker: "NVDA", strategy: "cash_secured_put",
  open_date: `2026-07-${String(6 + i).padStart(2, "0")}`,
  close_date: `2026-07-${String(10 + i).padStart(2, "0")}`,
  close_reason: "expired", chain_id: null,
  realized_pl: 50 + i, premium_pl: 50 + i, early_close_pl: 0, stock_pl: 0
}));

test("a put that expired worthless is a setup of one, not a row to drop", () => {
  const list = setups(NVDA_PUTS, []);
  assert.equal(list.length, 12);
  assert.equal(list.every((s) => s.legs.length === 1 && s.lots.length === 0), true);
});

test("the ticker roll-up carries every setup, not just the grouped ones", () => {
  const list = setups([...NVDA_PUTS, ...TSLA_LEGS, ...SPREADS], TSLA_LOTS);
  const rolled = byTicker(list);
  // Nothing is filtered away between the grouping and the table.
  assert.equal(rolled.reduce((a, b) => a + b.setups.length, 0), list.length);
  const nvda = rolled.find((b) => b.ticker === "NVDA");
  assert.equal(nvda.setups.length, 12);
  assert.equal(nvda.legs, 12);
  assert.equal(nvda.booked, NVDA_PUTS.reduce((a, t) => a + t.realized_pl, 0));
  // And no setup is counted twice.
  const seen = rolled.flatMap((b) => b.setups.map((s) => s.key));
  assert.equal(new Set(seen).size, seen.length);
});

test("the ticker totals sum to the account's own booked total", () => {
  const list = setups([...NVDA_PUTS, ...TSLA_LEGS, ...SPREADS], TSLA_LOTS);
  const rolled = byTicker(list);
  const legs = [...NVDA_PUTS, ...TSLA_LEGS, ...SPREADS].reduce((a, t) => a + t.realized_pl, 0);
  assert.equal(
    Math.round(rolled.reduce((a, b) => a + b.booked, 0) * 100) / 100,
    Math.round(legs * 100) / 100
  );
});

test("the roll-up flags only the tickers that actually needed grouping", () => {
  const rolled = byTicker(setups([...NVDA_PUTS, ...TSLA_LEGS, ...SPREADS], TSLA_LOTS));
  assert.equal(rolled.find((b) => b.ticker === "NVDA").split, 0);
  assert.equal(rolled.find((b) => b.ticker === "NVDA").open, 0);
  assert.equal(rolled.find((b) => b.ticker === "TSLA").split, 1);
  assert.equal(rolled.find((b) => b.ticker === "TSLA").open, 1);
});

test("the busiest ticker leads, and an empty account rolls up to nothing", () => {
  const rolled = byTicker(setups([...NVDA_PUTS, ...TSLA_LEGS, ...SPREADS], TSLA_LOTS));
  assert.equal(rolled[0].ticker, "NVDA");
  assert.deepEqual(byTicker([]), []);
  assert.deepEqual(byTicker(null), []);
});
