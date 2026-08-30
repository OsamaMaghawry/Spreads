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

// Which brokerage account a key pair actually belongs to.
//
// A manually keyed account used to be stored with no broker identity of any
// kind: not the id, not the number. So removing an account and adding it again
// produced a second row for the same brokerage account, holding a second copy
// of its history, indistinguishable from the first except by name — which is
// how two rows called "Alton Live" came to exist with the same key hint.
//
// Asking Alpaca who the keys belong to fixes that and validates the keys in
// the same call: a pair that cannot read its own account is a pair that was
// never going to work, and finding out at save time beats finding out on the
// first sync.
async function resolveBrokerIdentity(apiKey: string, apiSecret: string, isPaper: boolean) {
  const base = isPaper
    ? "https://paper-api.alpaca.markets/v2"
    : "https://api.alpaca.markets/v2";
  const res = await fetch(`${base}/account`, {
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Content-Type": "application/json"
    }
  }).catch(() => null);

  if (!res || !res.ok) {
    throw new Error(
      `Those keys could not read the ${isPaper ? "paper" : "live"} account at Alpaca` +
        (res ? ` (${res.status})` : "") +
        ". Check the key, the secret, and whether this is a paper or live account."
    );
  }
  const account = await res.json();
  if (!account?.id) throw new Error("Alpaca did not return an account id for those keys.");
  return {
    brokerAccountId: String(account.id),
    brokerAccountNumber: account.account_number ? String(account.account_number) : null
  };
}

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
      // Resolved before anything is written, so a bad key pair fails the save
      // instead of creating a row that cannot talk to the broker.
      const identity = await resolveBrokerIdentity(apiKey, apiSecret, !!isPaper);
      fields.broker_account_id = identity.brokerAccountId;
      if (identity.brokerAccountNumber) {
        fields.broker_account_number = identity.brokerAccountNumber;
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
        .select("oauth_access_token, broker_account_id, broker_account_number")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing?.oauth_access_token) delete fields.is_paper;

      // Re-keying a row to a different brokerage account.
      //
      // The unique index catches the case where the other account is also
      // connected here. It cannot catch this one: the row keeps its id, its
      // name and every trade under it, and the next sync rebuilds that history
      // from a different broker -- so one account's P/L is silently replaced by
      // another's, under a name that still says otherwise. Rotated keys for the
      // same account resolve to the same broker id and pass; a different
      // account is a different account, and belongs in its own row.
      const mismatch =
        (existing?.broker_account_id &&
          fields.broker_account_id &&
          existing.broker_account_id !== fields.broker_account_id) ||
        (existing?.broker_account_number &&
          fields.broker_account_number &&
          existing.broker_account_number !== fields.broker_account_number);
      if (mismatch) {
        return jsonResponse(
          {
            error:
              "Those keys are for a different brokerage account than this one. " +
              "Add it as a new account — re-keying this one would replace its history with the other account's."
          },
          409
        );
      }

      // The admin client bypasses RLS, so matching user_id here is what scopes
      // the update to the caller's own account.
      const { data, error } = await admin
        .from("trading_accounts")
        .update(fields)
        .eq("id", id)
        .eq("user_id", user.id)
        .select(SAFE_ACCOUNT_COLUMNS)
        .maybeSingle();
      if (error) {
        // The unique index on (user_id, broker_account_id) refusing to let two
        // rows claim one brokerage account. That is the constraint doing its
        // job, but "duplicate key value violates unique constraint" tells the
        // person nothing about what they did.
        if (error.code === "23505") {
          return jsonResponse(
            {
              error:
                "Those keys belong to a brokerage account you have already connected. " +
                "Update that account instead, or remove it first."
            },
            409
          );
        }
        throw new Error(error.message);
      }
      if (!data) return jsonResponse({ error: "Trading account not found" }, 404);
      return jsonResponse({ account: data });
    }

    if (!fields.api_key) {
      return jsonResponse({ error: "apiKey and apiSecret are required" }, 400);
    }

    // Adding an account this user already has -- the common case being one
    // removed and added back -- re-keys the row that is already there instead
    // of standing a second one beside it. The old row keeps its history and
    // its name; only the credentials and the identity are refreshed.
    const { data: already } = await admin
      .from("trading_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("broker_account_id", fields.broker_account_id)
      .maybeSingle();

    if (already) {
      const { data, error } = await admin
        .from("trading_accounts")
        .update(fields)
        .eq("id", already.id)
        .select(SAFE_ACCOUNT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return jsonResponse({ account: data, reconnected: true });
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
