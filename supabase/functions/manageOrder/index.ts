import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";

// Reads the status of a working order, or cancels it. Used by the client while
// it walks a limit price, to decide whether to reprice or stop.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, orderId, action } = await req.json();
    if (!accountId || !orderId || !action) {
      return jsonResponse({ error: "accountId, orderId and action are required" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const base = tradingBase(account);

    if (action === "cancel") {
      await alpacaFetch(`${base}/orders/${orderId}`, account, { method: "DELETE" });
      return jsonResponse({ canceled: true });
    }

    const order = await alpacaFetch(`${base}/orders/${orderId}`, account);
    return jsonResponse({
      status: order.status,
      filledQty: order.filled_qty,
      filledAvgPrice: order.filled_avg_price
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
