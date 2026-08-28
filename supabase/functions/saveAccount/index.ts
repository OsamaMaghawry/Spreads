import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { isAdminUser } from "../_shared/admin.ts";
import { manualApiKeysEnabled } from "../_shared/settings.ts";
import { SAFE_ACCOUNT_COLUMNS } from "../_shared/accounts.ts";
import { apiKeyHint, encryptSecret } from "../_shared/crypto.ts";

// Creating and editing a trading account. The browser cannot write
// trading_accounts at all after migration 0004, so this is the only path for an
// API key to reach storage — and it encrypts on the way in.
//
// Storing a raw key and secret is now an administrator-only, switched-off-by-
// default capability. Customers connect through Alpaca's OAuth flow; asking
// them to paste brokerage credentials into a third-party form is not something
// to offer, and the switch exists so the path stays available for testing
// against accounts the OAuth app cannot reach. Renaming is unaffected — this
// gate is about credentials only, so a customer with an account keyed before
// the change can still manage it.

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
      is_paper: !!isPaper
    };

    // The strategy prefixes have no form behind them any more; they are only
    // written when a caller actually sends them. Defaulting an absent field to
    // null instead would have every rename quietly wipe the stored prefixes,
    // and the orders they claim would stop being attributed to their strategy.
    if (spreadsClientPrefix !== undefined) {
      fields.spreads_client_prefix = spreadsClientPrefix || null;
    }
    if (wheelClientPrefix !== undefined) {
      fields.wheel_client_prefix = wheelClientPrefix || null;
    }

    const admin = adminClient();

    // Credentials are optional when editing: the browser no longer holds the
    // existing key, so an empty pair means "leave the stored one alone" and
    // renaming an account never requires re-entering secrets.
    //
    // The gate is on either field being present rather than both, so a partial
    // payload gets the real reason back instead of a confusing 400 about a
    // missing secret.
    if (apiKey || apiSecret) {
      const { isAdmin } = await isAdminUser(user, admin);
      if (!isAdmin) {
        // Same answer whether or not the switch happens to be on: manual entry
        // is never a customer-facing feature.
        return jsonResponse(
          { error: "Manual API keys aren't available. Connect your account through Alpaca instead." },
          403
        );
      }
      if (!(await manualApiKeysEnabled(admin))) {
        return jsonResponse(
          { error: "Manual API key entry is switched off. Turn it on in Admin → Settings first." },
          403
        );
      }
      if (!apiKey || !apiSecret) {
        return jsonResponse({ error: "apiKey and apiSecret are required together" }, 400);
      }
      fields.api_key = await encryptSecret(apiKey);
      fields.api_secret = await encryptSecret(apiSecret);
      fields.api_key_hint = apiKeyHint(apiKey);
    }

    if (id) {
      // An OAuth account's live/paper nature is a fact about the token, not a
      // preference: it was established by which trading API answered during the
      // callback. Flipping it would point a live account at the paper endpoint
      // and quietly stop it working, so the field is dropped here rather than
      // merely hidden in the form — the browser is not where that is enforced.
      const { data: existing } = await admin
        .from("trading_accounts")
        .select("oauth_access_token")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing?.oauth_access_token) delete fields.is_paper;

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
