import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { apiKeyHint, encryptSecret, isEncrypted } from "../_shared/crypto.ts";

// Encrypts credentials that are still stored in plaintext, across every user's
// accounts, without involving those users.
//
// Encryption was introduced after these rows were written, and decryption reads
// pre-encryption values back unchanged, so nothing broke — but a row only got
// encrypted when its owner happened to re-save it. Asking every user to re-enter
// their API keys is not a migration strategy, so this does it server-side.
//
// Idempotent: rows already encrypted are counted and skipped, so it is safe to
// run repeatedly, and safe to re-run after adding accounts. A failure on one row
// is reported and does not stop the rest.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    // This reads and rewrites every user's credentials, so it is restricted to
    // administrators rather than scoped to the caller's own rows.
    const admin = adminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile || profile.role !== "admin") {
      return jsonResponse({ error: "Administrator access is required" }, 403);
    }

    const { data: accounts, error } = await admin
      .from("trading_accounts")
      .select("id, api_key, api_secret, oauth_access_token, api_key_hint");
    if (error) throw new Error(error.message);

    let encrypted = 0;
    let alreadyEncrypted = 0;
    const failed: { id: string; error: string }[] = [];

    for (const account of accounts || []) {
      const patch: Record<string, unknown> = {};
      try {
        if (account.api_key && !isEncrypted(account.api_key)) {
          patch.api_key = await encryptSecret(account.api_key);
          // The hint is derivable only while the plaintext is in hand, so it is
          // backfilled here rather than left blank until the owner next saves.
          patch.api_key_hint = apiKeyHint(account.api_key);
        }
        if (account.api_secret && !isEncrypted(account.api_secret)) {
          patch.api_secret = await encryptSecret(account.api_secret);
        }
        if (account.oauth_access_token && !isEncrypted(account.oauth_access_token)) {
          patch.oauth_access_token = await encryptSecret(account.oauth_access_token);
        }

        if (Object.keys(patch).length === 0) {
          alreadyEncrypted++;
          continue;
        }

        const { error: updateError } = await admin
          .from("trading_accounts")
          .update(patch)
          .eq("id", account.id);
        if (updateError) throw new Error(updateError.message);
        encrypted++;
      } catch (e) {
        // Identify the row, never its contents.
        failed.push({ id: account.id, error: e.message });
      }
    }

    return jsonResponse({
      scanned: (accounts || []).length,
      encrypted,
      alreadyEncrypted,
      failed
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
