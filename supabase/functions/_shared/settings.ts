import { adminClient } from "./supabaseClients.ts";

// Operator switches, read and written through the service role only (see
// migration 0010). Every setting here changes what the product allows, so the
// default when a row is missing is always the closed one — a failed read or a
// database restored without the seed must not silently open something.

export const MANUAL_API_KEYS = "manual_api_keys";

// The keys an administrator may set through the panel. An allowlist rather
// than "whatever key was posted", so the settings table cannot be used as a
// general-purpose write target by anything holding an admin session.
export const WRITABLE_SETTINGS = [MANUAL_API_KEYS];

type Admin = ReturnType<typeof adminClient>;

export async function readSettings(admin: Admin) {
  const { data, error } = await admin.from("app_settings").select("key, value");
  if (error) throw new Error(error.message);
  const byKey = new Map((data || []).map((row: any) => [row.key, row.value]));
  return {
    // Named in the shape the browser uses, so no caller has to know the
    // database key. Strict === true: anything else, including a missing row,
    // reads as off.
    manualApiKeys: byKey.get(MANUAL_API_KEYS) === true
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
