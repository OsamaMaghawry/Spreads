// Whether the account still holds what a close order is about to close.
//
// 16 Oct 2026, Alton Live: the owner's INTC 1x99 / 2x100 call ratio closed at
// 16:39:40 and filled at 0.55 within a second. Twelve seconds later the same
// close went out again from the page, which was still showing the position,
// and Alpaca refused it: "position intent mismatch, inferred: buy_to_open,
// specified: buy_to_close". A buy of calls the account is no longer short is,
// to the broker, a buy of new ones. Nothing was harmed, but the owner was
// shown "Not filled" and a raw error for a position that had in fact closed.
//
// So a close is checked against the broker's own book before it is sent: each
// leg must still be held, the right way round, in at least the contracts the
// order closes, and not already spoken for by a close still working. Pure, so
// it can be tested against the book that produced the refusal.

import { parseOCCSymbol } from "./occ.ts";

export type CloseLeg = { symbol: string; action?: string; ratio?: number };
export type CloseProblem = {
  reason: "missing" | "working";
  symbol: string;
  held: number;
  need: number;
};

const n = (v: unknown) => {
  const x = parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

// Alpaca reports a short option as a negative qty with side "short"; either
// alone is enough to read it as short.
function signedQty(p: any) {
  const q = n(p?.qty);
  return p?.side === "short" ? -Math.abs(q) : q;
}

/**
 * The first leg this close cannot honestly be sent for, or null.
 *
 * `units` is the order's quantity, so a leg closes `units x ratio` contracts.
 * A buy_to_close needs that many held short; a sell_to_close that many held
 * long. Contracts a working order already buys (for a short) or sells (for a
 * long) are not available a second time -- the broker holds them for it.
 * Legs that are not option contracts are left to the broker.
 */
export function closeShortfall(legs: CloseLeg[], units: number, positions: any[], openOrders: any[] = []): CloseProblem | null {
  const held: Record<string, number> = {};
  for (const p of Array.isArray(positions) ? positions : []) {
    if (!p?.symbol) continue;
    held[p.symbol] = (held[p.symbol] || 0) + signedQty(p);
  }

  const buying: Record<string, number> = {};
  const selling: Record<string, number> = {};
  for (const o of Array.isArray(openOrders) ? openOrders : []) {
    const left = Math.max(0, n(o?.qty) - n(o?.filled_qty));
    if (!(left > 0)) continue;
    const ls = o?.order_class === "mleg" && Array.isArray(o.legs)
      ? o.legs
      : [{ symbol: o?.symbol, side: o?.side, ratio_qty: 1 }];
    for (const l of ls) {
      if (!l?.symbol) continue;
      const contracts = left * Math.max(1, n(l.ratio_qty) || 1);
      if (l.side === "buy") buying[l.symbol] = (buying[l.symbol] || 0) + contracts;
      else if (l.side === "sell") selling[l.symbol] = (selling[l.symbol] || 0) + contracts;
    }
  }

  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l?.symbol || !parseOCCSymbol(l.symbol)) continue;
    const need = Math.max(1, n(units)) * Math.max(1, n(l.ratio) || 1);
    const buyBack = (l.action || "buy_to_close") === "buy_to_close";
    const have = buyBack ? Math.max(0, -(held[l.symbol] || 0)) : Math.max(0, held[l.symbol] || 0);
    if (have < need) return { reason: "missing", symbol: l.symbol, held: have, need };
    const taken = buyBack ? buying[l.symbol] || 0 : selling[l.symbol] || 0;
    if (have - taken < need) return { reason: "working", symbol: l.symbol, held: have, need };
  }
  return null;
}

/** "the INTC 2026-10-23 100 call", for a sentence. */
function contractName(symbol: string) {
  const o = parseOCCSymbol(symbol);
  if (!o) return symbol;
  return `the ${o.underlying} ${o.expiryFormatted} ${o.strike} ${o.type === "C" ? "call" : "put"}`;
}

/** The refusal, in plain words, for a problem closeShortfall found. */
export function closeRefusal(problem: CloseProblem | null): string | null {
  if (!problem) return null;
  const name = contractName(problem.symbol);
  if (problem.reason === "working") {
    return `An order still working at your broker is already closing ${name}. ` +
      "Change its price or cancel it in the Orders tab first.";
  }
  if (problem.held === 0) {
    return `Nothing left to close: your broker no longer holds ${name}. ` +
      "If you just closed it, that order went through. Refresh the page.";
  }
  return `Your broker holds ${problem.held} of ${name}, and this would close ${problem.need}. Lower the quantity.`;
}
