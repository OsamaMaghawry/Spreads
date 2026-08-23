import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { apiKeyHint, decryptSecret, encryptSecret, isEncrypted, needsRewrite } from "../_shared/crypto.ts";

// Encrypts credentials that are still stored in plaintext, across every user's
// accounts, without involving those users.
//
// Encryption was introduced after these rows were written, and decryption reads
// pre-encryption values back unchanged, so nothing broke — but a row only got
// encrypted when its owner happened to re-save it. Asking every user to re-enter
// their API keys is not a migration strategy, so this does it server-side.
//
// It also drains a key rotation. When CREDENTIAL_ENCRYPTION_KEY_PREVIOUS is set,
// values that only open under the outgoing key are re-encrypted under the
// current one, so rotating a key never means asking users to re-enter anything.
// Run it until `rotated` reaches zero, then clear the previous-key secret.
//
// Idempotent: rows already under the current key are counted and skipped, so it
// is safe to run repeatedly, and safe to re-run after adding accounts. A failure
// on one row is reported and does not stop the rest.

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
    let rotated = 0;
    let alreadyCurrent = 0;
    const failed: { id: string; error: string }[] = [];

    // Rewrites a value that is plaintext or written under the outgoing key, and
    // reports which of the two it was. decryptSecret handles both cases: it
    // returns plaintext unchanged, and falls back to the previous key otherwise.
    const rewrite = async (value: string | null) => {
      if (!value || !(await needsRewrite(value))) return null;
      const plaintext = await decryptSecret(value);
      if (plaintext === null) return null;
      return { sealed: await encryptSecret(plaintext), plaintext, wasPlaintext: !isEncrypted(value) };
    };

    for (const account of accounts || []) {
      const patch: Record<string, unknown> = {};
      let sawPlaintext = false;
      try {
        const key = await rewrite(account.api_key);
        if (key) {
          patch.api_key = key.sealed;
          sawPlaintext ||= key.wasPlaintext;
          // The hint is derivable only while the plaintext is in hand, so it is
          // backfilled here rather than left blank until the owner next saves.
          if (!account.api_key_hint) patch.api_key_hint = apiKeyHint(key.plaintext);
        }

        const secret = await rewrite(account.api_secret);
        if (secret) {
          patch.api_secret = secret.sealed;
          sawPlaintext ||= secret.wasPlaintext;
        }

        const token = await rewrite(account.oauth_access_token);
        if (token) {
          patch.oauth_access_token = token.sealed;
          sawPlaintext ||= token.wasPlaintext;
        }

        if (Object.keys(patch).length === 0) {
          alreadyCurrent++;
          continue;
        }

        const { error: updateError } = await admin
          .from("trading_accounts")
          .update(patch)
          .eq("id", account.id);
        if (updateError) throw new Error(updateError.message);
        // A row carrying any plaintext counts as an encryption; otherwise every
        // rewritten field came from the outgoing key.
        if (sawPlaintext) encrypted++;
        else rotated++;
      } catch (e) {
        // Identify the row, never its contents.
        failed.push({ id: account.id, error: e.message });
      }
    }

    return jsonResponse({
      scanned: (accounts || []).length,
      encrypted,
      rotated,
      alreadyCurrent,
      failed
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
