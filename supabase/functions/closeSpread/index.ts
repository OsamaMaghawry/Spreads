import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio, callRatio, qty, orderType, limitPrice } =
      await req.json();
    if (!accountId || !shortSymbol || !longSymbol || !qty || !orderType) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }
    if (orderType === "limit" && (limitPrice === undefined || limitPrice === null)) {
      return jsonResponse({ error: "limitPrice is required for limit orders" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);

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

    const order = await alpacaFetch(`${tradingBase(account)}/orders`, account, {
      method: "POST",
      body: JSON.stringify(body)
    });

    return jsonResponse({ orderId: order.id, status: order.status });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
