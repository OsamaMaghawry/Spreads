// The terminal's one-key actions on a position: a protective stop, and a full
// or partial exit. The owner, 25 Oct 2026: "exiting full position has a key.
// Partial exit has a key with its default percentage of position ... I want
// to add stop loss order in general; with keys initially."
//
// A key press has no review step, so every rule is decided here, in words,
// before anything is sent: which side, how many, at what price, and what
// happens to the orders already working on the symbol. Pure; functions/terminal
// does the requests.

export type Position = { qty: number; qtyText?: string; side: "long" | "short"; avgPrice: number | null; last: number | null };
export type StopInput = { mode: "pct" | "usd" | "price"; value: number; from?: "last" | "entry" };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (v: number) => (v >= 1 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000);

/** Where the US share market is at a moment: the regular session, before or after it, or shut. */
export function usSession(ms: number): "regular" | "extended" | "closed" {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return "closed";
  const m = Number(p.hour) * 60 + Number(p.minute);
  if (m >= 570 && m < 960) return "regular";
  if (m >= 240 && m < 1200) return "extended";
  return "closed";
}

/**
 * A protective stop for a whole position: below the price for a long (it
 * sells), above for a short (it buys back). Measured from the last price or
 * the average entry, by a percentage, by dollars, or at a price given. A stop
 * on the wrong side of the market would trigger at once, and is refused.
 */
export function stopPlan(position: Position, input: StopInput, crypto = false):
  { ok: true; side: "buy" | "sell"; qty: number; qtyText: string; stopPrice: number; limitPrice: number | null; type: string; timeInForce: string; note: string | null } | { ok: false; reason: string } {
  const qty = Math.abs(num(position?.qty) || 0);
  if (!(qty > 0)) return { ok: false, reason: "No position to protect." };
  const long = position.side !== "short" && position.qty > 0;
  const last = num(position.last);
  const ref = input.from === "entry" ? num(position.avgPrice) : last;
  const value = num(input.value);
  if (value === null || !(value > 0)) return { ok: false, reason: "Set how far the stop sits." };
  if (input.mode !== "price" && !(ref && ref > 0)) return { ok: false, reason: "No price to measure the stop from." };
  let stop: number;
  if (input.mode === "price") stop = value;
  else if (input.mode === "pct") {
    if (!(value < 100)) return { ok: false, reason: "A stop more than 100% away is not a stop." };
    stop = long ? ref! * (1 - value / 100) : ref! * (1 + value / 100);
  } else stop = long ? ref! - value : ref! + value;
  stop = round(stop);
  if (!(stop > 0)) return { ok: false, reason: "That stop works out at or below zero." };
  if (last && (long ? stop >= last : stop <= last)) {
    return { ok: false, reason: `A stop at ${stop} is ${long ? "above" : "below"} the last price ${last}: it would ${long ? "sell" : "buy"} at once.` };
  }
  const side = long ? "sell" : "buy";
  if (crypto) {
    // Coins take stop-limit orders only: the limit 1% past the stop, so a fast
    // move still fills.
    const limit = round(long ? stop * 0.99 : stop * 1.01);
    return { ok: true, side, qty, qtyText: position.qtyText || String(qty), stopPrice: stop, limitPrice: limit, type: "stop_limit", timeInForce: "gtc", note: `limit ${limit}, 1% past the stop` };
  }
  // Part of a share can be ordered for the day only.
  const whole = Number.isInteger(qty);
  return {
    ok: true, side, qty, qtyText: String(qty), stopPrice: stop, limitPrice: null, type: "stop", timeInForce: whole ? "gtc" : "day",
    note: whole ? null : "a position with part of a share: the stop lasts for today only"
  };
}

/** The orders on a symbol a new stop replaces: stops of any kind on the closing side. */
export function stopsToReplace(orders: any[], closingSide: "buy" | "sell") {
  return (Array.isArray(orders) ? orders : []).filter((o) => o?.side === closingSide && ["stop", "stop_limit", "trailing_stop"].includes(o?.type) && !o?.legs?.length);
}

/**
 * An exit of all or part of a position. In the regular session (and always
 * for coins) the broker's own close, at market. Before the open and after the
 * close a market order would wait for the open, so it goes as a limit at the
 * bid (selling) or ask (buying back), for the day, extended hours, in whole
 * shares. Overnight and at weekends shares cannot trade at all: refused.
 */
export function exitPlan(position: Position, percent: number, session: "regular" | "extended" | "closed", quote: { bid?: number | null; ask?: number | null }, crypto = false):
  { ok: true; how: "close"; percent: number } | { ok: true; how: "limit"; side: "buy" | "sell"; qty: number; limitPrice: number; note: string | null } | { ok: false; reason: string } {
  const qty = Math.abs(num(position?.qty) || 0);
  if (!(qty > 0)) return { ok: false, reason: "No position to exit." };
  const pct = num(percent);
  if (pct === null || !(pct > 0 && pct <= 100)) return { ok: false, reason: "Exit between 1% and 100% of the position." };
  if (crypto || session === "regular") return { ok: true, how: "close", percent: Math.round(pct * 100) / 100 };
  if (session === "closed") return { ok: false, reason: "The share market is shut now (overnight or weekend); exits can be sent from 4:00 a.m. New York." };
  const long = position.side !== "short" && position.qty > 0;
  const price = num(long ? quote.bid : quote.ask);
  if (!(price && price > 0)) return { ok: false, reason: `No ${long ? "bid" : "ask"} to exit against outside regular hours.` };
  const wanted = (qty * pct) / 100;
  const shares = Math.floor(wanted + 1e-9);
  if (shares < 1) return { ok: false, reason: "Outside regular hours only whole shares trade, and this exit is less than one." };
  return {
    ok: true, how: "limit", side: long ? "sell" : "buy", qty: shares, limitPrice: round(price),
    note: shares < wanted - 1e-9 ? `${shares} whole shares (part of a share cannot trade outside regular hours)` : null
  };
}
