import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { liveAllowedFor, UPGRADE_MESSAGE } from "../_shared/entitlement.ts";
import { heldShares } from "../_shared/heldShares.ts";
import { tradingBase, alpacaFetch, loadAccount, parseOCCSymbol } from "../_shared/alpaca.ts";
import { getSpot } from "../_shared/marketPrice.ts";
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
async function preflight(account, legs, expectedSpot, allowItmShort) {
  const parsed = legs
    .map((l: any) => ({ ...l, occ: parseOCCSymbol(l.symbol) }))
    .filter((l: any) => l.occ);
  if (parsed.length === 0) return null;

  // An adjusted contract -- AAPL1 rather than AAPL -- no longer delivers 100
  // shares of the underlying at the strike, and the symbol does not say what it
  // delivers instead. Every check below compares its strike against the
  // underlying's spot, which is the wrong comparison, and the credit and the
  // width would be wrong in the same way. The scanner never produces these; if
  // one arrives, refusing is the only honest answer.
  const adjusted = parsed.find((l: any) => l.occ.adjusted);
  if (adjusted) {
    // No "place it with your broker": a refusal made on safety grounds should
    // not end by pointing at the exit, and the width and maximum loss still on
    // screen are wrong for this contract.
    return `${adjusted.symbol} is an adjusted contract — a corporate action changed what it ` +
      `delivers, so it is no longer 100 shares of ${adjusted.occ.underlying} at the strike, and the ` +
      `width and maximum loss shown for this trade are not right for it.`;
  }

  const ticker = parsed[0].occ.ticker;
  const spot = await getSpot(account, ticker);
  if (!(spot.price > 0)) return `No live price for ${ticker} — refusing to open a position without one.`;
  if (!spot.trusted) return `Unreliable price for ${ticker}: ${spot.reason} Refusing to open a position on it.`;

  if (expectedSpot > 0) {
    const drift = Math.abs(spot.price - expectedSpot) / expectedSpot;
    if (drift > MAX_SPOT_DRIFT_PCT) {
      return `${ticker} is $${spot.price.toFixed(2)} now, not $${expectedSpot.toFixed(2)} — ` +
        `${(drift * 100).toFixed(1)}% away from the setup. Re-scan before opening.`;
    }
  }

  if (!allowItmShort) {
    const through = parsed.find(
      (l: any) => l.side === "sell" &&
        (l.occ.type === "C" ? l.occ.strike <= spot.price : l.occ.strike >= spot.price)
    );
    if (through) {
      return `Short ${through.occ.type === "C" ? "call" : "put"} $${through.occ.strike} is through ` +
        `${ticker} at $${spot.price.toFixed(2)} — that is not an out-of-the-money credit spread.`;
    }
  }
  return null;
}

// Submits the opening multi-leg credit order (sell to open the shorts, buy the wings).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, legs, qty, orderType = "limit", limitPrice, expectedSpot, allowItmShort = false } = await req.json();
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

    // The one thing a plan gates: opening on a live account. Paper is never
    // gated, and neither is closing, cancelling or quoting anywhere -- a user
    // must always be able to get out of what they hold. 402 rather than 403:
    // the request was allowed, it is the payment that is missing.
    if (!account.is_paper && !(await liveAllowedFor(admin, user.id))) {
      return jsonResponse({ error: UPGRADE_MESSAGE, upgradeRequired: true }, 402);
    }

    // Last look before the money leaves. 409 rather than 400: the request was
    // well formed, the market moved out from under it.
    const stale = await preflight(account, legs, Number(expectedSpot) || 0, allowItmShort);
    if (stale) return jsonResponse({ error: stale, staleSetup: true }, 409);

    // One leg is the wheel's half -- a cash-secured put or a covered call. It
    // goes to the broker as a plain option order, not a multi-leg one: no
    // order_class, a positive limit price (the negative-credit convention is
    // multi-leg only), and the wheel prefix so the history files it under the
    // wheel where one is configured.
    if (legs.length === 1) {
      const leg = legs[0];
      const occ = parseOCCSymbol(leg.symbol);
      if (leg.side === "sell" && occ?.type === "C") {
        // A short call must be covered by shares this account holds, contract
        // for contract. Refusing here says why in one sentence; the broker's
        // rejection would not.
        const held = await heldShares(admin, account);
        const have = held.shares[occ.ticker] || 0;
        if (have < Number(qty) * 100) {
          return jsonResponse({
            error: `${account.name} holds ${have} shares of ${occ.ticker}; ${qty} covered call${Number(qty) > 1 ? "s" : ""} need${Number(qty) > 1 ? "" : "s"} ${Number(qty) * 100}. Nothing was sent.`
          }, 409);
        }
      }
      const singlePrefix = (account.wheel_client_prefix || account.spreads_client_prefix || "APP_OPEN").trim();
      const single: any = {
        symbol: leg.symbol,
        qty: String(qty),
        side: leg.side,
        type: orderType,
        time_in_force: "day",
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
      time_in_force: "day",
      client_order_id: `${prefix}_OPEN_${Date.now()}`,
      legs: legs.map((l: any) => ({
        symbol: l.symbol,
        ratio_qty: String(l.ratio || 1),
        side: l.side,
        position_intent: l.side === "sell" ? "sell_to_open" : "buy_to_open"
      }))
    };
    if (orderType === "limit") {
      // Alpaca multi-leg: a NEGATIVE limit price signifies a net credit to be received.
      // Opening credit spreads/condors always collect credit, so send -|price|.
      body.limit_price = String(-Math.abs(Math.round(limitPrice * 100) / 100));
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
