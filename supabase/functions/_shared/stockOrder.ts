// A share order for the staging trading terminal, checked before it is built.
//
// The owner, 24 Oct 2026: "a full stock trading app, using alpaca prices ...
// to be like tws". The terminal's ticket sends market, limit, stop and
// stop-limit orders, for the day or until cancelled, optionally with a
// take-profit and a stop-loss attached (Alpaca's bracket order). Every rule
// Alpaca would refuse with a code is checked here first and said in words, so
// the ticket can show the sentence before anything is sent.
//
// Pure: the function that sends it (functions/terminal) adds only the I/O.

export type StockOrderInput = {
  symbol: string;
  side: "buy" | "sell";
  qty?: number | string | null;
  // A dollar amount instead of a quantity (24 Oct: "I need to add a dollar
  // value"). Alpaca takes one for a market order for the day only, and fills
  // it in fractions of a share.
  notional?: number | string | null;
  type: "market" | "limit" | "stop" | "stop_limit";
  timeInForce?: "day" | "gtc";
  limitPrice?: number | string | null;
  stopPrice?: number | string | null;
  extendedHours?: boolean;
  takeProfit?: number | string | null;
  stopLoss?: number | string | null;
  // The price the bracket's exits are judged against when the entry is a
  // market order: the current ask for a buy, the bid for a sell.
  reference?: number | string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// Alpaca takes two decimals at a dollar and above, four below.
const price = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(4));

export const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;

/** The order body for POST /v2/orders, or the first reason it cannot be sent. */
export function stockOrderBody(input: StockOrderInput, clientId: string):
  { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const symbol = String(input?.symbol || "").toUpperCase().trim();
  if (!SYMBOL.test(symbol)) return { ok: false, reason: "Choose a stock symbol." };
  if (input.side !== "buy" && input.side !== "sell") return { ok: false, reason: "Choose buy or sell." };

  const type = input.type;
  if (!["market", "limit", "stop", "stop_limit"].includes(type)) return { ok: false, reason: "Choose an order type." };
  const tif = input.timeInForce === "gtc" ? "gtc" : "day";

  const notional = num(input.notional);
  if (notional !== null) {
    if (!(notional >= 1)) return { ok: false, reason: "A dollar amount must be at least $1." };
    if (type !== "market") return { ok: false, reason: "A dollar amount works with a market order; for a limit or stop, enter shares." };
    if (tif !== "day") return { ok: false, reason: "A dollar-amount order is for the day only." };
    if (input.extendedHours) return { ok: false, reason: "A dollar-amount order fills in regular hours only." };
    if (num(input.takeProfit) !== null || num(input.stopLoss) !== null) return { ok: false, reason: "A take-profit and stop-loss need a share quantity, not a dollar amount." };
    return { ok: true, body: { symbol, side: input.side, notional: notional.toFixed(2), type, time_in_force: "day", client_order_id: clientId } };
  }

  const qty = num(input.qty);
  if (qty === null || !(qty > 0)) return { ok: false, reason: "Enter how many shares." };
  if (!Number.isInteger(qty)) return { ok: false, reason: "Whole shares only on this ticket." };

  const limit = num(input.limitPrice);
  const stop = num(input.stopPrice);
  if ((type === "limit" || type === "stop_limit") && !(limit && limit > 0)) return { ok: false, reason: "Enter a limit price." };
  if ((type === "stop" || type === "stop_limit") && !(stop && stop > 0)) return { ok: false, reason: "Enter a stop price." };

  const body: Record<string, unknown> = {
    symbol, side: input.side, qty: String(qty), type, time_in_force: tif, client_order_id: clientId
  };
  if (limit && (type === "limit" || type === "stop_limit")) body.limit_price = price(limit);
  if (stop && (type === "stop" || type === "stop_limit")) body.stop_price = price(stop);

  // Before the open and after the close: a limit order for the day only.
  if (input.extendedHours) {
    if (type !== "limit" || tif !== "day") return { ok: false, reason: "Pre-market and after-hours orders must be limit orders for the day." };
    body.extended_hours = true;
  }

  const tp = num(input.takeProfit);
  const sl = num(input.stopLoss);
  if (tp !== null || sl !== null) {
    if (!(tp && tp > 0) || !(sl && sl > 0)) return { ok: false, reason: "A take-profit and stop-loss go together: enter both, or neither." };
    if (type !== "market" && type !== "limit") return { ok: false, reason: "A take-profit and stop-loss can only follow a market or limit entry." };
    if (input.extendedHours) return { ok: false, reason: "A take-profit and stop-loss are not available outside regular hours." };
    const entry = type === "limit" ? limit : num(input.reference);
    if (!(entry && entry > 0)) return { ok: false, reason: "No current price to check the take-profit and stop-loss against." };
    // A buy exits by selling: profit above the entry, protection below it. A
    // sell (a short) the other way round. Alpaca refuses the order otherwise;
    // said here, with the numbers, before anything goes.
    if (input.side === "buy" && !(tp > entry && sl < entry)) {
      return { ok: false, reason: `For a buy, the take-profit must be above ${price(entry)} and the stop-loss below it.` };
    }
    if (input.side === "sell" && !(tp < entry && sl > entry)) {
      return { ok: false, reason: `For a sell, the take-profit must be below ${price(entry)} and the stop-loss above it.` };
    }
    body.order_class = "bracket";
    body.take_profit = { limit_price: price(tp) };
    body.stop_loss = { stop_price: price(sl) };
  }
  return { ok: true, body };
}

/** What the order would cost or bring in at a price, before commissions (none at Alpaca). */
export function orderValue(input: StockOrderInput, quote: { bid?: number | null; ask?: number | null; last?: number | null }) {
  const qty = num(input.qty) || 0;
  const at = input.type === "limit" || input.type === "stop_limit" ? num(input.limitPrice)
    : input.type === "stop" ? num(input.stopPrice)
    : input.side === "buy" ? num(quote.ask) ?? num(quote.last) : num(quote.bid) ?? num(quote.last);
  return at && qty ? { price: at, value: Math.round(at * qty * 100) / 100 } : null;
}
