import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { SAFE_ACCOUNT_COLUMNS } from "../_shared/accounts.ts";
import { apiKeyHint, encryptSecret } from "../_shared/crypto.ts";

// Creating and editing a manually-keyed trading account. The browser cannot
// write trading_accounts at all after migration 0004, so this is the only path
// for an API key to reach storage — and it encrypts on the way in.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { id, name, apiKey, apiSecret, isPaper, spreadsClientPrefix, wheelClientPrefix } =
      await req.json();

    if (!name || !name.trim()) return jsonResponse({ error: "name is required" }, 400);

    const fields: Record<string, unknown> = {
      name: name.trim(),
      is_paper: !!isPaper,
      spreads_client_prefix: spreadsClientPrefix || null,
      wheel_client_prefix: wheelClientPrefix || null
    };

    // Credentials are optional when editing: the browser no longer holds the
    // existing key, so an empty pair means "leave the stored one alone" and
    // renaming an account never requires re-entering secrets.
    if (apiKey && apiSecret) {
      fields.api_key = await encryptSecret(apiKey);
      fields.api_secret = await encryptSecret(apiSecret);
      fields.api_key_hint = apiKeyHint(apiKey);
    }

    const admin = adminClient();

    if (id) {
      // The admin client bypasses RLS, so matching user_id here is what scopes
      // the update to the caller's own account.
      const { data, error } = await admin
        .from("trading_accounts")
        .update(fields)
        .eq("id", id)
        .eq("user_id", user.id)
        .select(SAFE_ACCOUNT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return jsonResponse({ error: "Trading account not found" }, 404);
      return jsonResponse({ account: data });
    }

    if (!fields.api_key) {
      return jsonResponse({ error: "apiKey and apiSecret are required" }, 400);
    }

    const { data, error } = await admin
      .from("trading_accounts")
      .insert({ ...fields, user_id: user.id })
      .select(SAFE_ACCOUNT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return jsonResponse({ account: data });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
