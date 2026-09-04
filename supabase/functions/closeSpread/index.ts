import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";
import { recordAttempt } from "../_shared/orderAttempts.ts";

// Submits the closing order for a position: the whole structure by default, or
// just the legs the caller picked when only one side needs unwinding.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio, callRatio, qty, orderType, limitPrice, legs,
      // Diagnostics only, and never trusted for anything the order depends on:
      // runKey groups one walk, step is its position in it, quote is the market
      // the caller priced against. Without the quote a stored limit price is
      // just a number — with it, "was this ever marketable?" is answerable.
      runKey, step, quote, ticker } = await req.json();
    const customLegs = Array.isArray(legs) && legs.length > 0 ? legs : null;
    if (!accountId || !qty || !orderType || (!customLegs && (!shortSymbol || !longSymbol))) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }
    if (orderType === "limit" && (limitPrice === undefined || limitPrice === null)) {
      return jsonResponse({ error: "limitPrice is required for limit orders" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);

    // Closing a specific subset of legs (or a single leg) rather than the whole structure.
    if (customLegs) {
      const clientId = `APP_CLOSE_${orderType.toUpperCase()}_${Date.now()}`;
      let legBody: any;
      if (customLegs.length === 1 && customLegs[0].assetClass === "equity") {
        // Shares, not a contract. Three things differ from the option branch and
        // each one is a rejection on its own: the quantity is shares rather than
        // contracts times a ratio, the limit price is dollars per share rather
        // than a per-contract net, and `position_intent` is an options concept
        // the equity endpoint does not want. Side alone says what this does --
        // sell what is held long, buy back what is held short.
        const l = customLegs[0];
        const isBuy = (l.action || "sell_to_close") === "buy_to_close";
        legBody = {
          symbol: l.symbol,
          qty: String(qty),
          side: isBuy ? "buy" : "sell",
          type: orderType,
          time_in_force: "day",
          client_order_id: clientId
        };
      } else if (customLegs.length === 1) {
        const l = customLegs[0];
        const isBuy = (l.action || "buy_to_close") === "buy_to_close";
        legBody = {
          symbol: l.symbol,
          qty: String(qty * (l.ratio || 1)),
          side: isBuy ? "buy" : "sell",
          position_intent: isBuy ? "buy_to_close" : "sell_to_close",
          type: orderType,
          time_in_force: "day",
          client_order_id: clientId
        };
      } else {
        legBody = {
          order_class: "mleg",
          qty: String(qty),
          type: orderType,
          time_in_force: "day",
          client_order_id: clientId,
          legs: customLegs.map((l) => {
            const isBuy = (l.action || "buy_to_close") === "buy_to_close";
            return {
              symbol: l.symbol,
              ratio_qty: String(l.ratio || 1),
              side: isBuy ? "buy" : "sell",
              position_intent: isBuy ? "buy_to_close" : "sell_to_close"
            };
          })
        };
      }
      if (orderType === "limit") {
        // Single-leg option orders must carry a positive per-contract limit price
        // (max paid on a buy, min accepted on a sell). Only multi-leg orders use a
        // signed net price where negative means a net credit.
        const price = customLegs.length === 1 ? Math.abs(limitPrice) : limitPrice;
        legBody.limit_price = String(Math.round(price * 100) / 100);
      }
      const attempt = {
        userId: user.id, accountId, runKey, step, ticker, qty,
        legs: customLegs, orderType, limitPrice: orderType === "limit" ? limitPrice : null, quote
      };
      let legOrder;
      try {
        legOrder = await alpacaFetch(`${tradingBase(account)}/orders`, account, {
          method: "POST",
          body: JSON.stringify(legBody)
        });
      } catch (e) {
        // A refusal is the most interesting thing that can happen here, so it
        // is recorded before being re-thrown to the caller.
        await recordAttempt(admin, { ...attempt, error: String(e?.message || e) });
        throw e;
      }
      await recordAttempt(admin, { ...attempt, brokerOrderId: legOrder.id, status: legOrder.status });
      return jsonResponse({ orderId: legOrder.id, status: legOrder.status });
    }

    const body: any = {
      order_class: "mleg",
      qty: String(qty),
      type: orderType,
      time_in_force: "day",
      client_order_id: `APP_CLOSE_${orderType.toUpperCase()}_${Date.now()}`,
      legs: [
        { symbol: shortSymbol, ratio_qty: String(putRatio || 1), side: "buy", position_intent: "buy_to_close" },
        { symbol: longSymbol, ratio_qty: String(putRatio || 1), side: "sell", position_intent: "sell_to_close" }
      ]
    };
    // Iron condor: close the call side in the same multi-leg order.
    // Ratios support unbalanced condors (e.g. 2 put spreads : 1 call spread per unit).
    if (callShortSymbol && callLongSymbol) {
      body.legs.push(
        { symbol: callShortSymbol, ratio_qty: String(callRatio || 1), side: "buy", position_intent: "buy_to_close" },
        { symbol: callLongSymbol, ratio_qty: String(callRatio || 1), side: "sell", position_intent: "sell_to_close" }
      );
    }
    if (orderType === "limit") {
      // Alpaca multi-leg: positive = net debit paid, negative = net credit received.
      // Closing normally pays a debit; keep the sign the caller intends.
      body.limit_price = String(Math.round(limitPrice * 100) / 100);
    }

    const attempt = {
      userId: user.id, accountId, runKey, step,
      ticker: ticker || null, qty, legs: body.legs, orderType,
      limitPrice: orderType === "limit" ? limitPrice : null, quote
    };
    let order;
    try {
      order = await alpacaFetch(`${tradingBase(account)}/orders`, account, {
        method: "POST",
        body: JSON.stringify(body)
      });
    } catch (e) {
      await recordAttempt(admin, { ...attempt, error: String(e?.message || e) });
      throw e;
    }
    await recordAttempt(admin, { ...attempt, brokerOrderId: order.id, status: order.status });

    return jsonResponse({ orderId: order.id, status: order.status });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
