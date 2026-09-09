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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Alpaca refuses to replace an order once it reaches `accepted` status:
//
//   422 {"code":42210000,"message":"cannot replace order in accepted status"}
//
// We knew this about EQUITY orders -- CloseDialog hides the Update button for
// shares because of it -- and assumed options were exempt. They are not. A
// resting TSLA put hit exactly this on a live account, and the ticket showed
// the broker's raw JSON with no way forward.
//
// So a refused replace becomes cancel-and-resubmit, which is what a person
// would do by hand. It is NOT equivalent to a replace and the difference
// matters: it is two steps, and between them the order does not exist.
const CANNOT_REPLACE = /cannot replace order|42210000/i;

// Cancel, and confirm it before anything else is sent.
//
// The same rule the close walk follows. A cancel that cannot be confirmed is
// the one case where resubmitting is how a position gets closed twice, so an
// unknown outcome refuses rather than guesses.
async function ensureCanceled(base: string, account: any, orderId: string) {
  await alpacaFetch(`${base}/orders/${orderId}`, account, { method: "DELETE" }).catch(() => {});
  for (let i = 0; i < 10; i++) {
    const st = await alpacaFetch(`${base}/orders/${orderId}`, account).catch(() => null);
    if (st) {
      if (st.status === "filled") return { outcome: "filled", order: st };
      if (["canceled", "rejected", "expired", "done_for_day"].includes(st.status)) {
        return { outcome: "canceled", order: st };
      }
    }
    await sleep(1000);
  }
  return { outcome: "unknown", order: null as any };
}

// The same order again at a new price, for whatever is still open.
//
// Only the remainder: an order that filled 2 of 5 before the cancel landed
// must be resubmitted for 3, or the replace closes more than is held.
function resubmitBody(current: any, patch: any, filled: number) {
  const asked = Number(patch.qty ?? current.qty) || 0;
  const remaining = asked - filled;
  if (!(remaining > 0)) return null;
  const price = patch.limit_price !== undefined ? Number(patch.limit_price) : Number(current.limit_price);
  const base: any = {
    qty: String(remaining),
    type: current.type,
    time_in_force: current.time_in_force || "day",
    client_order_id: `APP_REPRICE_${Date.now()}`
  };
  if (current.type === "limit") base.limit_price = String(Math.round(price * 100) / 100);
  if (Array.isArray(current.legs) && current.legs.length) {
    return {
      ...base,
      order_class: "mleg",
      legs: current.legs.map((l: any) => ({
        symbol: l.symbol,
        ratio_qty: String(l.ratio_qty),
        side: l.side,
        ...(l.position_intent ? { position_intent: l.position_intent } : {})
      }))
    };
  }
  return {
    ...base,
    symbol: current.symbol,
    side: current.side,
    ...(current.position_intent ? { position_intent: current.position_intent } : {})
  };
}

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
      let replaced: any;
      try {
        replaced = await alpacaFetch(`${base}/orders/${orderId}`, account, { method: "PATCH", body: JSON.stringify(patch) });
      } catch (e) {
        // Anything other than the accepted-status refusal is a real error.
        if (!CANNOT_REPLACE.test(String(e?.message || e))) throw e;

        const cancel = await ensureCanceled(base, account, orderId);
        if (cancel.outcome === "filled") {
          await updateAttempt(admin, orderId, "filled", cancel.order.filled_qty, cancel.order.filled_avg_price);
          return jsonResponse({
            orderId,
            status: "filled",
            filled: true,
            note: "This order filled before the price could be changed, so nothing was resubmitted."
          }, 200);
        }
        if (cancel.outcome === "unknown") {
          return jsonResponse({
            error:
              "The broker would not change the price and the cancel could not be confirmed. Nothing new was sent — check the Orders tab before placing another order."
          }, 409);
        }
        const filled = Number(cancel.order?.filled_qty) || 0;
        const body = resubmitBody(current, patch, filled);
        if (!body) {
          await updateAttempt(admin, orderId, "filled", cancel.order?.filled_qty, cancel.order?.filled_avg_price);
          return jsonResponse({
            orderId,
            status: "filled",
            filled: true,
            note: "The whole order filled while it was being canceled, so nothing was resubmitted."
          }, 200);
        }
        replaced = await alpacaFetch(`${base}/orders`, account, { method: "POST", body: JSON.stringify(body) });
        replaced.__viaCancel = true;
        replaced.__partial = filled;
      }
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
        qty: Number(replaced.qty) || null,
        // The broker refused the replace and this went out as a cancel plus a
        // new order. Reported rather than hidden: it is a different act, and
        // if part of the original filled first the new order is smaller.
        viaCancel: !!replaced.__viaCancel,
        filledBefore: Number(replaced.__partial) || 0
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
