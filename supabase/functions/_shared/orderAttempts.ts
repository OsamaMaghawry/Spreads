// The record of what the app tried, on whose behalf, at what price.
//
// Written from the edge functions rather than the browser so it cannot be
// skipped, and so the row reflects what was actually sent to the broker.
//
// EVERY function here swallows its own errors. An audit trail that can fail a
// close is worse than no audit trail: the user is trying to get out of a
// position, and nothing about bookkeeping may stand in the way of that. A lost
// row costs us an answer later; a thrown error costs them the trade.

interface AttemptInput {
  userId: string;
  accountId: string;
  runKey?: string | null;
  intent?: string;
  step?: number | null;
  ticker?: string | null;
  legs?: unknown;
  qty?: number | string | null;
  orderType?: string | null;
  limitPrice?: number | null;
  quote?: unknown;
  brokerOrderId?: string | null;
  status?: string | null;
  error?: string | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function recordAttempt(admin: any, a: AttemptInput) {
  try {
    await admin.from("order_attempts").insert({
      user_id: a.userId,
      account_id: a.accountId,
      run_key: a.runKey || null,
      intent: a.intent || "close",
      step: a.step ?? null,
      ticker: a.ticker || null,
      legs: a.legs ?? [],
      qty: num(a.qty),
      order_type: a.orderType || null,
      limit_price: num(a.limitPrice),
      quote: a.quote ?? null,
      broker_order_id: a.brokerOrderId || null,
      status: a.status || null,
      error: a.error || null
    });
  } catch (e) {
    console.error(`order_attempts insert failed: ${e?.message || e}`);
  }
}

// Called on every status poll, which is every couple of seconds while a close
// works. The WHERE clause means an unchanged status writes nothing, so the
// common case costs an indexed lookup rather than a row version.
//
// Updating here rather than trusting the browser to report the ending is what
// captures the truth when a tab is closed mid-walk — which is exactly when
// someone later asks what happened.
export async function updateAttempt(
  admin: any,
  brokerOrderId: string,
  status: string | null,
  filledQty: unknown,
  filledAvgPrice: unknown
) {
  if (!brokerOrderId) return;
  try {
    await admin
      .from("order_attempts")
      .update({
        status: status || null,
        filled_qty: num(filledQty),
        filled_avg_price: num(filledAvgPrice),
        updated_at: new Date().toISOString()
      })
      .eq("broker_order_id", brokerOrderId)
      .or(`status.is.null,status.neq.${status || ""}`);
  } catch (e) {
    console.error(`order_attempts update failed: ${e?.message || e}`);
  }
}
