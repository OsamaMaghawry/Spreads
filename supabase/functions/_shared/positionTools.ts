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
  if (!(last && last > 0)) return { ok: false, reason: "No last price to check the stop against, so it is not sent." };
  if (long ? stop >= last : stop <= last) {
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

/**
 * A take-profit for a whole position: above the price for a long (it sells
 * there), below for a short. The mirror of stopPlan.
 */
export function targetPlan(position: Position, input: StopInput):
  { ok: true; side: "buy" | "sell"; qty: number; targetPrice: number } | { ok: false; reason: string } {
  const qty = Math.abs(num(position?.qty) || 0);
  if (!(qty > 0)) return { ok: false, reason: "No position to take profit on." };
  const long = position.side !== "short" && position.qty > 0;
  const last = num(position.last);
  const ref = input.from === "entry" ? num(position.avgPrice) : last;
  const value = num(input.value);
  if (value === null || !(value > 0)) return { ok: false, reason: "Set how far the target sits." };
  if (input.mode !== "price" && !(ref && ref > 0)) return { ok: false, reason: "No price to measure the target from." };
  let target: number;
  if (input.mode === "price") target = value;
  else if (input.mode === "pct") target = long ? ref! * (1 + value / 100) : ref! * (1 - value / 100);
  else target = long ? ref! + value : ref! - value;
  target = round(target);
  if (!(target > 0)) return { ok: false, reason: "That target works out at or below zero." };
  if (!(last && last > 0)) return { ok: false, reason: "No last price to check the target against, so it is not sent." };
  if (long ? target <= last : target >= last) {
    return { ok: false, reason: `A target at ${target} is ${long ? "below" : "above"} the last price ${last}: it would fill at once.` };
  }
  return { ok: true, side: long ? "sell" : "buy", qty, targetPrice: target };
}

/**
 * The exit orders already working on a position's closing side: its stop
 * (a stop, stop-limit or trailing stop, or the stop of a one-cancels-other
 * pair), its target (a limit, or the pair's limit), and the orders to cancel
 * to replace them.
 */
/**
 * How much of an order opens or adds to a position; the rest closes what is
 * held (a sale of shares held, a buy back of a short). It was what counted
 * against the live accounts' $5,000 limit per order, removed on 28 Oct.
 */
export function openingQty(side: "buy" | "sell", qty: number, held: number) {
  const q = Math.abs(num(qty) || 0);
  const h = num(held) || 0;
  if (side === "sell") return h > 0 ? Math.max(0, q - h) : q;
  return h < 0 ? Math.max(0, q - Math.abs(h)) : q;
}

/**
 * What an exit does with a symbol's working orders: a market order on the
 * closing side is a sale already on its way, left alone, and what it still
 * has to sell counts as being sold; everything else (a stop, a take profit,
 * an unfilled limit exit) is cancelled to free the shares, a limit exit being
 * sent again at the new price. 26 Oct, CLRO at 9:30: each press of the exit
 * cancelled the market sale the press before had sent, still filling in the
 * first seconds of the open.
 */
export function exitSplit(orders: any[], closingSide: "buy" | "sell") {
  const keep: any[] = [];
  const cancel: any[] = [];
  for (const o of Array.isArray(orders) ? orders : []) {
    (o?.side === closingSide && o?.type === "market" && !o?.legs?.length ? keep : cancel).push(o);
  }
  const selling = keep.reduce((a, o) => a + Math.max(0, (num(o.qty) || 0) - (num(o.filled_qty) || 0)), 0);
  return { keep, cancel, selling };
}

export function existingExits(orders: any[], closingSide: "buy" | "sell") {
  let stop: number | null = null;
  let target: number | null = null;
  const ids: string[] = [];
  for (const o of Array.isArray(orders) ? orders : []) {
    if (o?.side !== closingSide) continue;
    if (o.order_class === "oco") {
      ids.push(o.id);
      target = num(o.limit_price) ?? target;
      const leg = (o.legs || []).find((l: any) => ["stop", "stop_limit"].includes(l?.type));
      stop = num(leg?.stop_price) ?? stop;
      continue;
    }
    if (o.legs?.length) continue; // an entry's bracket: its own business
    if (["stop", "stop_limit", "trailing_stop"].includes(o.type)) { ids.push(o.id); stop = num(o.stop_price) ?? stop; }
    else if (o.type === "limit") { ids.push(o.id); target = num(o.limit_price) ?? target; }
  }
  return { stop, target, ids };
}

/**
 * The one order that carries a position's exits: a stop alone, a target
 * alone (a limit), or both as Alpaca's one-cancels-other pair, so whichever
 * fills first cancels the other and the shares are never sold twice. A coin
 * or part of a share takes one exit order at a time (Alpaca pairs whole
 * shares only).
 */
export function exitBody(symbol: string, side: "buy" | "sell", qty: number, exits: { stop: number | null; target: number | null }, clientId: string, opts: { crypto?: boolean; qtyText?: string } = {}):
  { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const { stop, target } = exits;
  const whole = Number.isInteger(qty);
  const fmt = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(4));
  const amount = opts.qtyText || String(qty);
  if (stop && target) {
    if (opts.crypto) return { ok: false, reason: "A coin takes one exit order at a time at Alpaca: a stop or a target, not both. Clear one first." };
    if (!whole) return { ok: false, reason: "With part of a share, Alpaca takes one exit order at a time: a stop or a target, not both." };
    return {
      ok: true,
      body: { symbol, side, qty: String(qty), type: "limit", time_in_force: "gtc", order_class: "oco", client_order_id: clientId, take_profit: { limit_price: fmt(target) }, stop_loss: { stop_price: fmt(stop) } }
    };
  }
  if (target) {
    return { ok: true, body: { symbol, side, qty: amount, type: "limit", limit_price: fmt(target), time_in_force: opts.crypto || whole ? "gtc" : "day", client_order_id: clientId } };
  }
  return { ok: false, reason: "Nothing to place." };
}

/** The orders on a symbol a new stop replaces: stops of any kind on the closing side. */
export function stopsToReplace(orders: any[], closingSide: "buy" | "sell") {
  return (Array.isArray(orders) ? orders : []).filter((o) => o?.side === closingSide && ["stop", "stop_limit", "trailing_stop"].includes(o?.type) && !o?.legs?.length);
}

/**
 * The size of the trade a position belongs to: the largest it has been since
 * it was last flat, found by walking the account's fills back from now
 * (newest first). A partial exit is a share of this, not of what is left.
 *
 * The owner, 25 Oct 2026: "the partial ... acts on the remaining quantity not
 * the order one. So, the quantity will never finish." Four presses of a 25%
 * exit took 0.106, 0.079, 0.059 and 0.045 of 0.424 ETH, each a quarter of
 * what remained. Measured from the trade, four presses close it.
 */
export function tradeSize(fills: any[], currentQty: number, isSymbol: (s: unknown) => boolean): number {
  let pos = num(currentQty) || 0;
  let base = Math.abs(pos);
  for (const f of Array.isArray(fills) ? fills : []) {
    if (!isSymbol(f?.symbol)) continue;
    const q = Math.abs(num(f.qty) || 0);
    if (!q) continue;
    const before = pos - (f.side === "buy" ? q : -q);
    if (Math.abs(before) < 1e-9 || Math.sign(before) !== Math.sign(pos)) break;
    pos = before;
    base = Math.max(base, Math.abs(pos));
  }
  return base;
}

/**
 * How much a partial exit takes: `percent` of the trade's size, never more
 * than is left. When what would remain is under half a slice (or under the
 * coin's smallest order) it takes everything, so the presses add up to the
 * whole trade rather than leaving a sliver: 33% three times closes it.
 */
export function partialQty(remaining: number, base: number, percent: number, opts: { whole?: boolean; step?: number | null; min?: number | null } = {}) {
  const left = Math.abs(num(remaining) || 0);
  const slice = (Math.max(Math.abs(num(base) || 0), left) * percent) / 100;
  const min = num(opts.min) || 0;
  if (percent >= 100 || left - slice < slice / 2 + 1e-12 || left - slice < min) return { qty: left, all: true };
  const step = opts.whole ? 1 : (num(opts.step) || 1e-9);
  let qty = Math.floor(Number((slice / step).toFixed(6))) * step;
  if (opts.whole) qty = Math.max(1, qty);
  qty = Math.max(qty, min);
  if (qty >= left - 1e-12) return { qty: left, all: true };
  return { qty: Number(qty.toFixed(9)), all: false };
}

// How far a bid (or ask) may sit from the price the broker marks the position
// at and still be taken for the market; and, when none is that close, how far
// through that mark the exit's limit goes. 27 Oct, AIOK on a live account at
// 9:51 before the open: IEX's bid was 7.75 with the stock near 10.80, the exit
// went at 7.75, and Alpaca refused it ("the order is not executed i can't
// sell!!!"). IEX is one exchange of many, thin before the open.
export const EXIT_BAND = 0.03;
export const EXIT_THROUGH = 0.02;

type Side = { bid?: number | null; ask?: number | null };

/**
 * An exit of all or part of a position (`amount`: everything, or a
 * quantity). In the regular session (and always for coins) the broker's own
 * close, at market. Before the open and after the close a market order would
 * wait for the open, so it goes as a limit, for the day, extended hours, in
 * whole shares: at the bid (selling) or ask (buying back), the screen's own
 * (`quote.live`, every exchange where the trader has it) before IEX's; but
 * only one within EXIT_BAND of the broker's mark (`quote.ref`), and failing
 * that EXIT_THROUGH beyond the mark, which still fills at the best price
 * there is. Overnight and at weekends shares cannot trade at all: refused.
 */
export function exitPlan(position: Position, amount: { all: boolean; qty: number }, session: "regular" | "extended" | "closed", quote: Side & { ref?: number | null; live?: Side }, crypto = false):
  { ok: true; how: "close"; all: boolean; qty: number } | { ok: true; how: "limit"; side: "buy" | "sell"; qty: number; limitPrice: number; note: string | null } | { ok: false; reason: string } {
  const held = Math.abs(num(position?.qty) || 0);
  if (!(held > 0)) return { ok: false, reason: "No position to exit." };
  const wanted = amount.all ? held : Math.min(held, Math.abs(num(amount.qty) || 0));
  if (!(wanted > 0)) return { ok: false, reason: "Nothing to exit." };
  if (crypto || session === "regular") return { ok: true, how: "close", all: amount.all || wanted >= held - 1e-12, qty: wanted };
  if (session === "closed") return { ok: false, reason: "The share market is shut now (overnight or weekend); exits can be sent from 4:00 a.m. New York." };
  const long = position.side !== "short" && position.qty > 0;
  const word = long ? "bid" : "ask";
  const seen = [quote.live?.[word], quote[word]].map(num).filter((v): v is number => !!v && v > 0);
  const ref = num(quote.ref);
  const near = ref && ref > 0 ? seen.find((v) => Math.abs(v - ref) / ref <= EXIT_BAND) : null;
  const price = near ?? (ref && ref > 0 ? ref * (long ? 1 - EXIT_THROUGH : 1 + EXIT_THROUGH) : null);
  if (!(price && price > 0)) return { ok: false, reason: `No ${word} to exit against outside regular hours.` };
  const shares = Math.floor(wanted + 1e-9);
  if (shares < 1) return { ok: false, reason: "Outside regular hours only whole shares trade, and this exit is less than one." };
  const notes = [
    near == null && ref ? `limit ${Math.round(EXIT_THROUGH * 100)}% ${long ? "under" : "over"} the last price ${round(ref)}${seen.length ? `; the ${word} seen (${round(seen[0])}) was too far from it to be the market` : ""}` : null,
    shares < wanted - 1e-9 ? `${shares} whole shares (part of a share cannot trade outside regular hours)` : null
  ].filter(Boolean);
  return {
    ok: true, how: "limit", side: long ? "sell" : "buy", qty: shares, limitPrice: round(price),
    note: notes.length ? notes.join("; ") : null
  };
}

// The earlier sells a sell key replaces (28 Oct, the owner: "Replace it"): the
// terminal's own plain sells for the day, a key's (TERM_K_) or the ticket's,
// whatever their label's age (05:22: two sells from before the key label, 80
// and 78 ELPW, still held 158 of 241, and the next key was refused for one
// share). Never a stop, a target (good till cancelled), a leg of a bracket or
// one-cancels-other, or the stop guard's own (TERM_XS_, TERM_R_).
export const replaceable = (o: any) =>
  o?.side === "sell" && /^TERM_(K_)?\d/.test(String(o.client_order_id || "")) && (o.order_class || "simple") === "simple" &&
  (o.type === "limit" || o.type === "market") && o.time_in_force === "day";
