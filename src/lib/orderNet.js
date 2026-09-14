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

/**
 * Is this ticket closing something rather than opening it?
 *
 * `syncAccounts` keeps `position_intent` per leg precisely because SIDE CANNOT
 * CARRY THIS: buy_to_close and buy_to_open are both "buy". Everything that
 * routes a saved ticket depends on getting this right — an exit sent through
 * the opening path becomes a new position on top of the one it was closing.
 */
export function isClosingTicket(legs) {
  return (legs || []).some((l) => String(l?.intent || "").endsWith("_to_close"));
}

/**
 * Why this order cannot be parked, or null when it can.
 *
 * PURE AND TESTED because of how this failed in the owner's hands: the button
 * was live on an order that could not be parked, the confirmation asked him to
 * commit, and only the click that meant YES came back with a refusal. Deciding
 * it here means the card can ask before it draws the control.
 *
 * A CLOSING ORDER IS NO LONGER REFUSED. It was, briefly, and that was my
 * limitation rather than the idea's: saved tickets were reopened through the
 * OPEN dialog, and `openPosition` stamps every leg `*_to_open`, so an exit
 * would have come back as a new position. The owner's answer was the right
 * one — *"I need anything to be saved for later"* — so the route was fixed
 * instead of the feature narrowed: a closing ticket now reopens in the CLOSE
 * dialog, against the position it belongs to.
 *
 * One refusal survives, and it is arithmetic rather than plumbing: a PARTLY
 * FILLED order cannot be parked, because the saved ticket carries the ORIGINAL
 * quantity and sending it would re-open what already filled. Saving "the
 * remainder" is a different feature with its own sums.
 */
export function saveRefusalFor(order) {
  const filled = Number(order?.filledQty) || 0;
  if (filled > 0) {
    return `${filled} of ${order?.qty} has already filled, so this cannot be saved for later — the saved ticket would carry the whole quantity and re-open what filled.`;
  }
  return null;
}

/**
 * The open position a saved CLOSING ticket belongs to, or null.
 *
 * Matched on the SET OF SYMBOLS, because that is the one thing that cannot
 * drift: quantities change as a position is partly closed, prices move, and
 * the broker's own ids are not carried on a saved row. Two positions on the
 * same account never hold the same set of contracts — if they did they would
 * be one position.
 *
 * Null is a real answer and the caller must handle it: the trader may have
 * closed the position by other means since parking the exit, and a ticket to
 * close something you no longer hold must not be sent.
 *
 * @param savedLegs the saved ticket's legs
 * @param spreads   the account's open positions
 * @param legsOf    `spreadLegs`, injected so this module stays free of imports
 */
export function matchPositionForTicket(savedLegs, spreads, legsOf) {
  const want = new Set((savedLegs || []).map((l) => l?.symbol).filter(Boolean));
  if (!want.size) return null;
  for (const spread of spreads || []) {
    let have;
    try {
      have = new Set((legsOf(spread) || []).map((l) => l?.symbol).filter(Boolean));
    } catch {
      continue;
    }
    if (have.size !== want.size) continue;
    let all = true;
    for (const sym of want) if (!have.has(sym)) { all = false; break; }
    if (all) return spread;
  }
  return null;
}
