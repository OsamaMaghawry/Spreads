import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { liveAllowedFor, UPGRADE_MESSAGE } from "../_shared/entitlement.ts";
import { demoModeOn, DEMO_MESSAGE } from "../_shared/settings.ts";
import { heldShares } from "../_shared/heldShares.ts";
import { tradingBase, alpacaFetch, loadAccount, parseOCCSymbol } from "../_shared/alpaca.ts";
import { getSpots, spotFromSnapshot, closingSpotFromSnapshot } from "../_shared/marketPrice.ts";
import { sessionPhase } from "../_shared/watchRules.ts";
import {
  sessionWarning, priceWarning, driftWarning, itmShortWarning, adjustedWarning,
  coverWarning, unacknowledged, type OrderWarning
} from "../_shared/orderWarnings.ts";
import { earningsCoverage, refreshEarningsWindow } from "../_shared/earnings.ts";
import { inBackground } from "../_shared/background.ts";

// How far the stock may have moved since the setup was built before the order
// is refused. A scan result is a proposal, not a price: the legs and the credit
// travel unchanged from whenever the scan ran to whenever Submit is pressed.
const MAX_SPOT_DRIFT_PCT = 0.01;

// Re-checks the trade against the market as it is now, rather than as it was
// when the scan ran. Reads the ticker and strikes straight out of the OCC
// symbols, so it needs nothing from the client that the order itself does not
// already carry.
//
// This exists because a spread was once opened on a spot price of $363.54 when
// the stock was at $354.33: the short put looked $8.50 out of the money and was
// in fact through it. Nothing between the scan and the broker looked again.
//
// IT NO LONGER REFUSES. Every finding is a warning the user can accept — see
// `_shared/orderWarnings.ts` for the owner's instruction and the reasoning.
// Looking is still this function's job; deciding is not.
//
// The market's own clock decides how the price is judged. During the session a
// live print is what matters and a long gap in it is news. Outside the session
// there is no live print to want, so the official close IS the price, and the
// one thing worth saying is that the market is shut — which `sessionWarning`
// says once, rather than every stale-price check saying it badly.
async function preflight(
  admin, account, legs, expectedSpot, allowItmShort, qty: number,
  order: { orderType?: string; timeInForce?: string } = {}, now = new Date()
): Promise<OrderWarning[]> {
  const out: OrderWarning[] = [];
  const shut = sessionPhase(now) !== "open";
  const shutNote = sessionWarning(now, order);
  if (shutNote) out.push(shutNote);

  const parsed = legs
    .map((l: any) => ({ ...l, occ: parseOCCSymbol(l.symbol) }))
    .filter((l: any) => l.occ);
  if (parsed.length === 0) return out;

  // An adjusted contract -- AAPL1 rather than AAPL -- no longer delivers 100
  // shares of the underlying at the strike, and the symbol does not say what it
  // delivers instead. Every check below compares its strike against the
  // underlying's spot, which is the wrong comparison, and the credit and the
  // width are wrong in the same way. The scanner never produces these.
  const adjusted = parsed.find((l: any) => l.occ.adjusted);
  if (adjusted) out.push(adjustedWarning(adjusted.symbol, adjusted.occ.underlying));

  const ticker = parsed[0].occ.ticker;
  const spots = await getSpots(account, [ticker], shut ? closingSpotFromSnapshot : spotFromSnapshot);
  const spot = spots[ticker] || spotFromSnapshot(null);

  const priceNote = priceWarning(ticker, spot, now);
  if (priceNote) out.push(priceNote);

  if (spot.price > 0) {
    const drift = driftWarning(ticker, spot.price, Number(expectedSpot) || 0, MAX_SPOT_DRIFT_PCT);
    if (drift) out.push(drift);
    if (!allowItmShort) {
      const itm = itmShortWarning(ticker, parsed, spot.price);
      if (itm) out.push(itm);
    }
  }

  // A LONE short call against shares this account does not hold. Previously a
  // hard 409; now a warning, because an account approved for naked calls may
  // sell one and that is between the user and their broker. The sentence still
  // says exactly what is missing, which a broker rejection would not.
  //
  // `parsed.length === 1` is the whole point. The short call of a CALL SPREAD
  // is covered by the long call above it, not by shares, and raising "this
  // call is not covered" on every vertical would teach the user to click
  // straight through the one time it matters.
  const shortCall =
    parsed.length === 1 && parsed[0].side === "sell" && parsed[0].occ.type === "C" ? parsed[0] : null;
  if (shortCall) {
    const held = await heldShares(admin, account).catch(() => null);
    if (held) {
      const have = held.shares[shortCall.occ.ticker] || 0;
      const note = coverWarning(account.name, shortCall.occ.ticker, have, Number(qty) || 1);
      if (note) out.push(note);
    }
  }

  return out;
}

// Submits the opening multi-leg credit order (sell to open the shorts, buy the wings).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const {
      accountId, legs, qty, orderType = "limit", limitPrice, expectedSpot, allowItmShort = false,
      // Which warning codes the user has already been shown and accepted. An
      // array rather than a boolean ON PURPOSE: a walk resubmits every thirty
      // seconds, and a blanket "they clicked send once" would carry that
      // consent onto a condition that first appeared five minutes later. A
      // code the user has not seen still stops to be seen.
      acknowledged = [],
      // How long the order lives. Alpaca takes `day` and `gtc` on options and
      // nothing else. It was hardcoded to "day" here and offered nowhere on
      // the ticket, so an order placed on a Saturday could only ever be a day
      // order queued for Monday's close -- there was no way to leave one
      // working, which is exactly what somebody planning over a weekend wants.
      timeInForce = "day"
    } = await req.json();
    const tif = timeInForce === "gtc" ? "gtc" : "day";
    if (!accountId || !Array.isArray(legs) || legs.length < 1 || !qty) {
      return jsonResponse({ error: "accountId, legs and qty are required" }, 400);
    }
    if (orderType === "limit" && (limitPrice === undefined || limitPrice === null)) {
      return jsonResponse({ error: "limitPrice is required for limit orders" }, 400);
    }

    const admin = adminClient();

    // Seeds the cache for a position opened without scanning first, so its
    // freshness never depends on which path the trader took. Always behind the
    // response and never awaited — an order must not wait on the calendar.
    const horizon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    earningsCoverage(admin, horizon)
      .then(({ missing, stale }) => {
        if (missing || stale) inBackground(refreshEarningsWindow(admin));
      })
      .catch(() => {});

    const account = await loadAccount(admin, accountId, user.id);

    // DEMO. The whole product works on paper; on a live account it watches,
    // reports and closes, and opens nothing. This is the one refusal in this
    // function that is not a warning the user can accept -- the point of a
    // demo is that no live order leaves it, so there is nothing here for the
    // user to decide. `closeSpread` and `manageOrder` are untouched: a
    // position already open must always be closeable, whatever mode the
    // product is in.
    if (!account.is_paper && (await demoModeOn(admin))) {
      return jsonResponse({ error: DEMO_MESSAGE, demoMode: true }, 403);
    }

    // The one thing a plan gates: opening on a live account. Paper is never
    // gated, and neither is closing, cancelling or quoting anywhere -- a user
    // must always be able to get out of what they hold. 402 rather than 403:
    // the request was allowed, it is the payment that is missing.
    if (!account.is_paper && !(await liveAllowedFor(admin, user.id))) {
      return jsonResponse({ error: UPGRADE_MESSAGE, upgradeRequired: true }, 402);
    }

    // Last look before the money leaves -- and it is a LOOK, not a veto. What
    // it finds comes back once, unsent, for the user to read and accept or
    // walk away from. 409 rather than 400: the request was well formed and
    // nothing was wrong with it; there is simply something the sender should
    // know first.
    const warnings = await preflight(
      admin, account, legs, Number(expectedSpot) || 0, allowItmShort, Number(qty) || 1,
      { orderType, timeInForce: tif }
    );
    const unseen = unacknowledged(warnings, acknowledged);
    if (unseen.length) {
      return jsonResponse({
        error: unseen[0].title,
        warnings: unseen,
        // The client renders these and offers to send anyway. `staleSetup`
        // stays for older clients, which treat it as a stop rather than a
        // retry -- the safe reading either way.
        needsAcknowledgement: true,
        staleSetup: true
      }, 409);
    }

    // One leg is the wheel's half -- a cash-secured put or a covered call. It
    // goes to the broker as a plain option order, not a multi-leg one: no
    // order_class, a positive limit price (the negative-credit convention is
    // multi-leg only), and the wheel prefix so the history files it under the
    // wheel where one is configured.
    if (legs.length === 1) {
      const leg = legs[0];
      // The share-cover check moved into `preflight` as the acknowledgeable
      // `short_call_uncovered` warning. It used to refuse outright, which
      // assumed every account is cash or Reg-T level 2; an account approved
      // for naked calls may legitimately sell one, and that is between the
      // user and their broker. The sentence it shows still names exactly how
      // many shares are missing, which a broker rejection would not.
      const singlePrefix = (account.wheel_client_prefix || account.spreads_client_prefix || "APP_OPEN").trim();
      const single: any = {
        symbol: leg.symbol,
        qty: String(qty),
        side: leg.side,
        type: orderType,
        time_in_force: tif,
        position_intent: leg.side === "sell" ? "sell_to_open" : "buy_to_open",
        client_order_id: `${singlePrefix}_OPEN_${Date.now()}`
      };
      if (orderType === "limit") single.limit_price = String(Math.abs(Math.round(limitPrice * 100) / 100));
      const order = await alpacaFetch(`${tradingBase(account)}/orders`, account, { method: "POST", body: JSON.stringify(single) });
      return jsonResponse({ orderId: order.id, status: order.status });
    }

    const prefix = (account.spreads_client_prefix || "APP_OPEN").trim();

    const body: any = {
      order_class: "mleg",
      qty: String(qty),
      type: orderType,
      time_in_force: tif,
      client_order_id: `${prefix}_OPEN_${Date.now()}`,
      legs: legs.map((l: any) => ({
        symbol: l.symbol,
        ratio_qty: String(l.ratio || 1),
        side: l.side,
        position_intent: l.side === "sell" ? "sell_to_open" : "buy_to_open"
      }))
    };
    if (orderType === "limit") {
      // Alpaca multi-leg: a NEGATIVE limit price is a net credit to be
      // RECEIVED, a positive one a net debit to be PAID.
      //
      // This used to send `-Math.abs(price)` unconditionally, with the comment
      // "opening credit spreads/condors always collect credit". That was true
      // of everything the scanner builds, and stopped being true the moment
      // the option chain let a spread be assembled by hand — a vertical taken
      // the expensive way round, or a diagonal that costs money. On one of
      // those, -|price| told the broker to pay us for an order we are paying
      // for, which never fills at best and is simply wrong at worst.
      //
      // The client sends the net in the product's own convention (positive is
      // a credit taken, negative a debit paid), which is the opposite of
      // Alpaca's, so the sign is carried through by negating it rather than
      // being thrown away.
      body.limit_price = String(-(Math.round(limitPrice * 100) / 100));
    }

    const order = await alpacaFetch(`${tradingBase(account)}/orders`, account, {
      method: "POST",
      body: JSON.stringify(body)
    });

    return jsonResponse({ orderId: order.id, status: order.status });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
