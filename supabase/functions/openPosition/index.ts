import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";

// Submits the opening multi-leg credit order (sell to open the shorts, buy the wings).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, legs, qty, orderType = "limit", limitPrice } = await req.json();
    if (!accountId || !Array.isArray(legs) || legs.length < 2 || !qty) {
      return jsonResponse({ error: "accountId, legs and qty are required" }, 400);
    }
    if (orderType === "limit" && (limitPrice === undefined || limitPrice === null)) {
      return jsonResponse({ error: "limitPrice is required for limit orders" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
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
