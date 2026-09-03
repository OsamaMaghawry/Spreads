import { adminClient } from "./supabaseClients.ts";

// Operator switches, read and written through the service role only (see
// migration 0010). Every setting here changes what the product allows, so the
// default when a row is missing is always the closed one — a failed read or a
// database restored without the seed must not silently open something.

export const MANUAL_API_KEYS = "manual_api_keys";
// Whether a live plan is required to open a position on a live account. Off
// until the owner flips it; see _shared/entitlement.ts.
export const BILLING_ENFORCED = "billing_enforced";
// Whether the payment surface exists at all — the nav entry, the billing
// screen and the checkout it starts. Separate from BILLING_ENFORCED, which
// only decides whether a plan is *required*: until the broker approves live
// trading there is nothing to sell, and a page that takes a card for a thing
// that cannot yet be delivered is the wrong page to have up. Off by default,
// like every other switch here.
export const BILLING_VISIBLE = "billing_visible";

// The keys an administrator may set through the panel. An allowlist rather
// than "whatever key was posted", so the settings table cannot be used as a
// general-purpose write target by anything holding an admin session.
export const WRITABLE_SETTINGS = [MANUAL_API_KEYS, BILLING_ENFORCED, BILLING_VISIBLE];

type Admin = ReturnType<typeof adminClient>;

export async function readSettings(admin: Admin) {
  const { data, error } = await admin.from("app_settings").select("key, value");
  if (error) throw new Error(error.message);
  const byKey = new Map((data || []).map((row: any) => [row.key, row.value]));
  return {
    // Named in the shape the browser uses, so no caller has to know the
    // database key. Strict === true: anything else, including a missing row,
    // reads as off.
    manualApiKeys: byKey.get(MANUAL_API_KEYS) === true,
    billingEnforced: byKey.get(BILLING_ENFORCED) === true,
    billingVisible: byKey.get(BILLING_VISIBLE) === true
  };
}

export async function writeSetting(admin: Admin, key: string, value: unknown, userId: string) {
  if (!WRITABLE_SETTINGS.includes(key)) throw new Error(`Unknown setting "${key}"`);
  const { error } = await admin.from("app_settings").upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: userId },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);
}

export async function manualApiKeysEnabled(admin: Admin) {
  return (await readSettings(admin)).manualApiKeys;
}
