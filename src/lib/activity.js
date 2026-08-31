// "Last seen" has to be recorded, not inferred.
//
// `auth.users.last_sign_in_at` only moves when someone actually authenticates.
// A user who signed in once and kept the session can use the product every day
// for a month and still read as last seen on the day they typed their password
// — which is exactly how an active user came to look dormant in the admin
// panel. So the app stamps its own mark of use.
//
// The write goes through the `touch_last_active` SECURITY DEFINER function
// rather than an RLS update policy on `profiles`: that table also carries
// `role`, and any policy letting a user update their own row is a policy
// letting them make themselves an admin. The function can touch one column of
// one row — the caller's.

import { supabase } from "@/lib/supabaseClient";

const KEY = "dm:lastActiveStamp";
const INTERVAL_MS = 5 * 60 * 1000;

// Returns whether a write was actually attempted, which is what the tests read.
// Never throws: an unrecorded visit is a smaller problem than a broken page.
export async function touchLastActive({ force = false, now = Date.now } = {}) {
  const t = now();
  try {
    const last = Number(localStorage.getItem(KEY) || 0);
    if (!force && t - last < INTERVAL_MS) return false;
    // Claim the slot before awaiting, so several tabs waking together write
    // once between them rather than once each.
    localStorage.setItem(KEY, String(t));
  } catch {
    // Private mode, disabled storage: fall through and just write.
  }
  try {
    await supabase.rpc("touch_last_active");
    return true;
  } catch {
    return false;
  }
}
