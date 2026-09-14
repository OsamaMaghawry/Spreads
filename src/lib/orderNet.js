import { parseOCC } from "./occ.js";

// How an order's net price is NAMED. Pure: no client, no fetch, no alias
// imports, so it runs under bare `node --test` exactly as it runs in the app.
//
// Split out of `savedOrders.js` because that module talks to PostgREST and a
// unit test has no business loading a network client to ask whether a short
// put is a credit.

/**
 * Is this ticket about shares rather than contracts?
 *
 * Every option symbol parses as OCC; a plain ticker does not. The same test
 * `OrderGroup` uses, lifted here so the card, the dialogs and the stored row
 * cannot disagree about what kind of order this is -- which is what decides
 * whether "debit" and "credit" are the right words at all.
 */
export function legsAreEquity(legs) {
  const symbols = (legs || []).map((l) => l?.symbol).filter(Boolean);
  return symbols.length > 0 && symbols.every((s) => !parseOCC(s));
}

/**
 * Debit or credit, in one place.
 *
 * The owner: *"I want to show up if the order is Debit or Credit (Options
 * only). For stocks, no need."*
 *
 * THE SIGN IS THE FACT AND IT IS NOT OBVIOUS. `spreadQuote` answers in DEBITS,
 * so a credit spread quotes NEGATIVE. Alpaca's own multi-leg limit follows the
 * same convention. A share order quotes as a negative debit when you sell,
 * which is not a credit in the sense a trader means -- it is a sale -- and
 * that is exactly why equity returns null here instead of "credit".
 *
 * @param net      the net price in the debit convention: negative is money in
 * @param isEquity shares rather than contracts
 * @returns {{ kind: "debit"|"credit", label: string, amount: number }|null}
 */
export function netKind(net, isEquity) {
  if (isEquity) return null;
  const n = Number(net);
  if (net === null || net === undefined || !Number.isFinite(n) || n === 0) return null;
  return n < 0
    ? { kind: "credit", label: "Credit", amount: Math.abs(n) }
    : { kind: "debit", label: "Debit", amount: n };
}

/**
 * Debit or credit for a WHOLE ORDER, which is not the same question as for a
 * quoted net -- and getting it wrong mislabels real money on screen.
 *
 * Alpaca signs a MULTI-LEG limit: negative is a credit. It does NOT sign a
 * SINGLE-LEG one. A plain option order carries a positive limit whichever way
 * you trade it, so reading the sign on a lone short put -- the most common
 * ticket this product writes -- would label the credit a debit. On one leg the
 * SIDE is the fact: selling to open takes money in, buying pays it out.
 *
 * @param order { legs, limitPrice, type } as the Orders tab holds it
 * @param isEquity shares rather than contracts
 */
export function orderNetKind(order, isEquity) {
  if (isEquity) return null;
  const legs = order?.legs || [];
  if (!legs.length) return null;
  // A market order has no net to name until it fills.
  if (order?.limitPrice === null || order?.limitPrice === undefined) return null;
  const amount = Math.abs(Number(order.limitPrice));
  if (!Number.isFinite(amount) || amount === 0) return null;

  if (legs.length > 1) return netKind(Number(order.limitPrice), false);

  const side = String(legs[0]?.side || "");
  if (side.startsWith("sell")) return { kind: "credit", label: "Credit", amount };
  if (side.startsWith("buy")) return { kind: "debit", label: "Debit", amount };
  return null;
}
