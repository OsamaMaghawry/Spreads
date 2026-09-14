import { supabase } from "@/lib/supabaseClient";
import { legsAreEquity } from "@/lib/orderNet";

// Orders the trader built and chose not to send.
//
// Reads and writes go straight through PostgREST because `saved_orders` is
// own-rows under RLS and carries nothing that grants anything -- there is no
// reason to spend an edge function on it. The one thing RLS cannot express,
// that the account is also yours, is enforced by a trigger (migration 0051).
//
// NOTHING HERE TOUCHES THE BROKER. Sending a saved order is `openPosition`,
// called by the caller with these legs; this module's whole job is to keep the
// ticket intact until then.

/** Every saved order for one account, newest first. */
export async function listSavedOrders(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("saved_orders")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Park a ticket.
 *
 * `legs` is stored exactly as `openPosition` wants it, so sending it later
 * hands the same array over with nothing rebuilt. A rebuild at send time is
 * where a leg gets dropped or a ratio inverted.
 */
export async function saveOrder({
  accountId,
  ticker,
  legs,
  qty,
  limitPrice = null,
  orderType = "limit",
  netIsCredit = true,
  timeInForce = null,
  note = null,
  fromBrokerOrderId = null,
  setup = null
}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("You are not signed in.");
  const row = {
    user_id: userId,
    account_id: accountId,
    ticker,
    legs,
    qty,
    order_type: orderType,
    limit_price: limitPrice === null || limitPrice === undefined ? null : Math.abs(Number(limitPrice)),
    net_is_credit: Boolean(netIsCredit),
    time_in_force: timeInForce === "gtc" || timeInForce === "day" ? timeInForce : null,
    is_equity: legsAreEquity(legs),
    note,
    from_broker_order_id: fromBrokerOrderId,
    // Display only. `legs` above is what reaches the broker; this is what the
    // ticket needs to READ -- strikes, expiry, deltas, credit, max risk -- and
    // without it a reopened ticket rendered dashes, "Delta NaN", and a max
    // risk of null that the preview printed as "No ceiling" on positions whose
    // loss was strictly bounded. Null is a legitimate value: a ticket parked
    // from the Orders tab is a resting broker order that never had a setup.
    setup: setup || null
  };
  const { data, error } = await supabase.from("saved_orders").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSavedOrder(id, patch) {
  const { data, error } = await supabase
    .from("saved_orders")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSavedOrder(id) {
  const { error } = await supabase.from("saved_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
