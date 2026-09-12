// What the account HOLDS, as opposed to what it traded.
//
// THE DEFECT THIS EXISTS FOR. The first weekly email was built entirely from
// `trade_records` and `account_equity_daily`. On production the second of
// those is empty, so the owner received an email whose every portfolio figure
// was a dash and whose only content was last week's premium:
//
//   *"I still see the weekly all about last week premiums, not the shares not
//   the account snapshot. Nothing. Poorer than before. Waste of time."*
//
// He had already said what the email is for, twice:
//
//   *"Even no trades this week, an account snapshot in general should be sent.
//   It's not about trades, it's about the account itself. If someone trades
//   LEAPS, and have equities, they should receive email too. As long as the
//   account is connected, they should receive a weekly digest email."*
//   *"With the open trades as well and current position and if any open
//   orders."*
//
// And the answer was in front of us: none of that needs the stored series.
// The broker knows what the account holds, what it is worth and what is
// working, right now, and every other screen in this product already asks it.
// The digest simply never did. So it asks.
//
// WHAT THIS CHANGES ABOUT THE DESIGN, stated rather than slipped in. The
// digest's header used to say it talks to no broker, so that a Saturday job
// could not fail across thirty broker connections. That reasoning is still
// sound for the WEEK'S ARITHMETIC, which stays on stored rows. It was not a
// reason to have no snapshot — it was a reason to make the snapshot's failure
// cheap. So every call here is allowed to fail on its own, one account's
// broker outage costs that account's snapshot and nothing else, and an email
// still goes out saying plainly which part could not be read.
//
// Nothing in this file derives, pairs or classifies. `brokerView` already
// passes the broker's own quantities, marks and unrealised P/L through
// untouched, and that is deliberately the floor this stands on: if our
// grouping is wrong somewhere else, these rows are still right.

import { brokerView } from "./brokerView.ts";
import { pairSpreads } from "./spreadPairing.ts";
import { bookRiskByTicker, bookRiskTotal } from "./bookRisk.ts";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type OpenOrderRow = {
  symbol: string;
  side: string;
  qty: number | null;
  type: string;
  limitPrice: number | null;
  submittedAt: string | null;
  legs: number;
};

export type Snapshot = ReturnType<typeof snapshotOf>;

/**
 * One account's current state, from the broker's own answers.
 *
 * @param account   { equity, cash, last_equity } as the broker reports them
 * @param positions raw /v2/positions
 * @param orders    raw /v2/orders?status=open&nested=true
 * @param failed    which of the three calls did not answer, so the email can
 *                  say which part is missing rather than showing an empty
 *                  section that reads as "you hold nothing"
 */
export function snapshotOf(
  account: any | null,
  positions: any[] | null,
  orders: any[] | null,
  failed: string[] = []
) {
  // `brokerView` is the floor: one row per line the broker reports, its
  // numbers, no arithmetic of ours.
  const rows = positions ? brokerView(positions) : [];
  const options = rows.filter((r: any) => r.assetClass === "option");
  const shares = rows.filter((r: any) => r.assetClass === "equity");

  const sum = (list: any[], key: string) =>
    list.reduce((s, r) => s + (num(r[key]) ?? 0), 0);

  // A working order can be multi-leg, in which case the broker nests the legs
  // and the parent carries the strategy. One row per ORDER, not per leg: the
  // reader placed one order and is owed one line about it.
  const working: OpenOrderRow[] = (orders || []).map((o: any) => ({
    symbol: o.symbol || (Array.isArray(o.legs) && o.legs.length ? o.legs.map((l: any) => l.symbol).join(" / ") : "—"),
    side: o.side || (Array.isArray(o.legs) && o.legs[0]?.side) || "",
    qty: num(o.qty),
    type: o.type || o.order_type || "",
    limitPrice: num(o.limit_price),
    submittedAt: o.submitted_at || o.created_at || null,
    legs: Array.isArray(o.legs) ? o.legs.length : 1
  }));

  // WHAT IS COMMITTED, AND WHAT IS AT RISK -- the same two functions the
  // dashboard totals, on the same positions, so the email and the screen
  // cannot quote different numbers for one account.
  //
  // `pairSpreads` is given no activities and no filled orders, and that is a
  // real if narrow degradation: without the orders that filled them, legs are
  // paired by the vertical heuristic rather than proven, and a share lot's
  // basis is the broker's rather than the wheel-adjusted one. Neither moves
  // COLLATERAL or RISK, which are functions of strikes and quantities. It
  // would move a basis figure, and this does not print one.
  const paired = positions ? pairSpreads(positions, [], [], { cash: account ? num(account.cash) : null }) : null;
  const books = paired ? bookRiskByTicker(paired) : null;
  const risk = books ? bookRiskTotal(books) : null;

  return {
    // --- what the broker says the account is worth -------------------------
    // Null when the call failed, never zero: an account worth nothing and an
    // account we could not read are not the same statement.
    equity: account ? num(account.equity) : null,
    cash: account ? num(account.cash) : null,
    // The broker's own answer, not ours. `options_buying_power` is the figure
    // that decides what can be opened on Monday; `buying_power` is the
    // fallback for an account type that does not report the options one.
    optionsBuyingPower: account
      ? num(account.options_buying_power) ?? num(account.buying_power)
      : null,

    // --- what is committed and what is exposed -----------------------------
    // Collateral is what the broker is HOLDING: the full strike on a
    // cash-secured put, the width on a spread, the shares behind a covered
    // call. Risk is what could be LOST. They are different numbers and a
    // trader needs both -- a cash-secured put ties up the whole strike while
    // risking the strike less the credit.
    collateral: paired
      ? Math.round(paired.reduce((a: number, r: any) => a + (num(r.collateral) ?? 0), 0) * 100) / 100
      : null,
    risk: risk ? risk.risk : null,
    // False the moment one ticker cannot be sized. The email withholds rather
    // than printing a total that is short by an unknown amount.
    riskComplete: risk ? risk.complete : false,
    riskUnbounded: risk ? risk.unbounded : [],
    // The broker's own previous close, so "today's move" is its arithmetic
    // rather than ours.
    lastEquity: account ? num(account.last_equity) : null,

    // --- what it holds -----------------------------------------------------
    options,
    shares,
    optionCount: options.length,
    shareCount: shares.length,
    // Market value as the broker reports it. A short option's market value is
    // negative, which is correct and is left that way: it is a liability.
    optionsValue: positions ? sum(options, "marketValue") : null,
    sharesValue: positions ? sum(shares, "marketValue") : null,
    optionsUnrealized: positions ? sum(options, "unrealizedPL") : null,
    sharesUnrealized: positions ? sum(shares, "unrealizedPL") : null,

    // --- what is working ---------------------------------------------------
    openOrders: working,
    openOrderCount: orders ? working.length : null,

    // --- what could not be read -------------------------------------------
    failed,
    // True when the broker answered at all. An account that answered and holds
    // nothing is a real, reportable state; one that did not answer is not.
    read: Boolean(account || positions || orders),
    // An account is only EMPTY if the broker answered and reported nothing.
    empty: Boolean(positions) && rows.length === 0 && (!orders || working.length === 0)
  };
}
