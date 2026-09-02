import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";
import { recordAttempt, updateAttempt } from "../_shared/orderAttempts.ts";
import { replaceBody } from "../_shared/orderReplace.ts";
import { parseOCCSymbol } from "../_shared/occ.ts";

// Reads the status of a working order, cancels it, or replaces its price or
// size. Used by the client while it walks a limit price, to decide whether to
// reprice or stop, and by the ticket and the Orders tab when the user changes a
// resting price by hand.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, orderId, action, limitPrice, qty } = await req.json();
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

    // Replacing at the broker retires this order (its status becomes
    // "replaced") and creates a new one with a new id, which is what the caller
    // must watch from here on. The old attempt row is closed out and the new
    // order gets its own row, so the audit trail shows both prices.
    if (action === "replace") {
      const current = await alpacaFetch(`${base}/orders/${orderId}`, account);
      const patch = replaceBody({ order: current, limitPrice, qty });
      if (!patch) return jsonResponse({ error: "A positive limit price or a whole-number quantity is required to change a limit order" }, 400);
      const replaced = await alpacaFetch(`${base}/orders/${orderId}`, account, { method: "PATCH", body: JSON.stringify(patch) });
      const legs = Array.isArray(current.legs) && current.legs.length
        ? current.legs.map((l: any) => ({ symbol: l.symbol, side: l.side, ratio: Number(l.ratio_qty) || 1 }))
        : [{ symbol: current.symbol, side: current.side, ratio: 1 }];
      await updateAttempt(admin, orderId, "replaced", current.filled_qty, current.filled_avg_price);
      await recordAttempt(admin, {
        userId: user.id,
        accountId,
        intent: "replace",
        ticker: parseOCCSymbol(legs[0]?.symbol)?.ticker || current.symbol || null,
        legs,
        qty: patch.qty ?? current.qty,
        orderType: current.type,
        limitPrice: patch.limit_price !== undefined ? Number(patch.limit_price) : Number(current.limit_price),
        brokerOrderId: replaced.id,
        status: replaced.status
      });
      return jsonResponse({
        orderId: replaced.id,
        status: replaced.status,
        limitPrice: Math.abs(Number(replaced.limit_price ?? patch.limit_price)) || null,
        qty: Number(replaced.qty) || null
      });
    }

    const order = await alpacaFetch(`${base}/orders/${orderId}`, account);
    // Recorded here rather than trusting the browser to report the ending: this
    // is what still captures the outcome when a tab is closed mid-walk.
    await updateAttempt(admin, orderId, order.status, order.filled_qty, order.filled_avg_price);
    return jsonResponse({
      status: order.status,
      filledQty: order.filled_qty,
      filledAvgPrice: order.filled_avg_price
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
