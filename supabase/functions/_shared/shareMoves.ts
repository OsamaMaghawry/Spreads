// Shares that moved without a fill, for the terminal's share and coin P/L
// (functions/terminal accountFills, lib/demoTrades.js). What was held at a
// period's start is the holding now less every share movement since, so
// these count as much as the fills do (19 Nov reviews: an assignment after a
// custom period ended showed as a holding carried into it).
//
// From Alpaca's non-trade activities (docs: "Non-Trade Activities for Option
// Events"):
// - An assignment or exercise is two entries: OPASN or OPEXC on the
//   contract, and OPTRD on the underlying, the shares delivered at the
//   strike, with a date and no moment. The shares count as a fill at the
//   start of the trading day (20:00 New York the weekday before) of the
//   contract's expiry when that is before the OPTRD's date (an assignment at
//   Friday's expiry is Friday's, however the entry is dated), else of the
//   OPTRD's date: before any trade in them that day, so selling them the
//   morning they arrive is not read as a short. Bought or sold by the cash
//   that moved (out: bought), held back if the quantity's sign disagrees.
//   Paired by `group_id`, else by the underlying and the expiry. One also
//   listed as a fill with no order of its own is counted once. A cash-settled
//   index option (SPX, XSP, ...) delivers no shares.
// - A coin fee taken in the coin (CFEE, no cash moved) is handed on; the book
//   takes it off that day's buy.
// - A split, spin-off, merger, name or symbol change, reorganisation,
//   transfer or other corporate action cannot be read as a fill: that symbol
//   is held back, with the reason. So is an assignment or exercise whose
//   shares were not found.

import { nyMoment } from "./screenHistory.ts";

/** The types asked for. SSP and SSO are returned for old entries but refused as filters (Alpaca, 6 Nov 2026). */
export const SHARE_EVENTS = "OPTRD,OPASN,OPEXC,CFEE,SPLIT,SPIN,MA,NC,SC,REO,REORG,ACATS,JNLS,OPCA,FOPT,VOF,EXTRD,DVF";
/** Asked for instead if Alpaca refuses the longer list: the ones its documents show. */
export const SHARE_EVENTS_CORE = "OPTRD,OPASN,OPEXC,CFEE,SPLIT,SPIN,MA,NC,SC,ACATS,JNLS";

const OCC = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})[CP]\d{8}$/;
const CASH_SETTLED = new Set(["SPX", "SPXW", "XSP", "NDX", "NDXP", "XND", "RUT", "RUTW", "VIX", "VIXW", "DJX", "OEX", "XEO", "MXEF", "MXEA"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nyDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekend = (date: string) => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
/** When a date's trading day starts, in ms: 20:00 New York on the weekday before (a weekend's is Monday's), as lib/demoTrades.js dayStart. */
export function tradingDayStart(date: string) {
  let d = date;
  while (weekend(d)) d = addDays(d, 1);
  do { d = addDays(d, -1); } while (weekend(d));
  return nyMoment(d, "20:00");
}

export type Fill = { symbol: string; side: "buy" | "sell"; qty: number; price: number; time: number; orderId: string | null; delivery?: boolean };
export type HeldBack = { symbol: string; type: string; date: string };
export type Fee = { symbol: string; qty: number; time: number };

/**
 * The share movements in `events` (Alpaca non-trade activities, read from a
 * little before `start`, in ms): the deliveries since `start` as fills, the
 * coin fees, and the symbols to hold back. `fills`: the account's own fills
 * since then, to count a delivery also listed as one only once. `symbolOf`
 * turns Alpaca's symbol into the one the fills use.
 */
export function shareMoves(events: any[], fills: Fill[], start: number, symbolOf: (s: string) => string = (s) => s) {
  const startDate = nyDay(start);
  const options: { underlying: string; date: string; type: string; expiry: string; group: string | null; matched: boolean }[] = [];
  const trades: { symbol: string; date: string; side: "buy" | "sell"; qty: number; price: number; group: string | null }[] = [];
  const fees: Fee[] = [];
  const heldBack: HeldBack[] = [];
  for (const a of events || []) {
    const type = String(a?.activity_type || "");
    const sym = String(a?.symbol || "");
    const date = String(a?.date || "").slice(0, 10);
    if (!DAY.test(date)) continue;
    const group = a?.group_id ? String(a.group_id) : null;
    if (type === "OPTRD") {
      // An option's own trade is left out with the other option fills.
      if (!sym || OCC.test(sym)) continue;
      const qty = Number(a.qty);
      const cash = Number(a.net_amount) || 0;
      const price = Math.abs(cash / qty) || Number(a.price);
      const side = cash ? (cash < 0 ? "buy" : "sell") : qty > 0 ? "buy" : "sell";
      const agrees = !cash || !qty || (side === "buy") === (qty > 0);
      if (qty && price > 0 && agrees) trades.push({ symbol: symbolOf(sym), date, side, qty: Math.abs(qty), price, group });
      else if (date >= startDate) heldBack.push({ symbol: symbolOf(sym), type, date });
    } else if (type === "OPASN" || type === "OPEXC") {
      const m = sym.match(OCC);
      if (m && !CASH_SETTLED.has(m[1])) options.push({ underlying: m[1], date, type, expiry: `20${m[2]}-${m[3]}-${m[4]}`, group, matched: false });
    } else if (type === "CFEE") {
      // In the coin when no cash moved (a buy's fee); a sell's fee is in dollars.
      const qty = Math.abs(Number(a.qty));
      if (sym && qty > 0 && !Number(a.net_amount)) fees.push({ symbol: symbolOf(sym), qty, time: Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000) });
    } else if (date >= startDate) {
      heldBack.push({ symbol: sym ? symbolOf(sym) : "", type, date });
    }
  }
  const deliveries: Fill[] = [];
  for (const t of trades) {
    const opt = (t.group && options.find((o) => !o.matched && o.group === t.group)) ||
      options.find((o) => !o.matched && o.underlying === t.symbol && (o.date === t.date || (o.expiry <= t.date && o.expiry >= addDays(t.date, -4))));
    if (opt) opt.matched = true;
    const day = opt && opt.expiry < t.date ? opt.expiry : t.date;
    const time = Math.floor(tradingDayStart(day) / 1000);
    // Delivered before the start: already in what was held then.
    if (time * 1000 < start) continue;
    const { side, qty } = t;
    const listed = fills.some((f) => !f.orderId && f.symbol === t.symbol && f.side === side && Math.abs(f.qty - qty) < 1e-9 &&
      Math.abs(f.price - t.price) < 1e-6 && Math.abs(f.time - time) < 5 * 86400);
    if (!listed) deliveries.push({ symbol: t.symbol, side, qty, price: t.price, time, orderId: null, delivery: true });
  }
  for (const o of options) if (!o.matched && o.date >= startDate) heldBack.push({ symbol: o.underlying, type: o.type, date: o.date });
  return { deliveries, fees, heldBack };
}
