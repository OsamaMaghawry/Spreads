import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { SAFE_ACCOUNT_COLUMNS } from "../_shared/accounts.ts";
import { encryptSecret } from "../_shared/crypto.ts";

// One token, two endpoints.
//
// Alpaca's consent screen lets the user tick a live account and a paper account
// in the same authorization, and returns a *single* access token carrying both.
// There is no field naming what it covers: the only way to find out is to
// present it to each trading API in turn and see which answer.
//
// This used to stop at the first endpoint that responded. Live is probed first,
// so a token covering both stored the live account and silently dropped the
// paper one — the account appeared on the consent screen, could be ticked, and
// then never showed up. Both are collected now.
async function detectAccounts(accessToken: string) {
  const found: { isPaper: boolean; accountId: string; accountNumber: string | null }[] = [];
  for (const [isPaper, base] of [
    [false, "https://api.alpaca.markets/v2"],
    [true, "https://paper-api.alpaca.markets/v2"]
  ] as const) {
    const res = await fetch(`${base}/account`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => null);
    if (res && res.ok) {
      const account = await res.json();
      // An account with no identifier is not stored at all. Previously
      // `account_number` was used unchecked, and when it came back absent the
      // result was a row named "Alpaca Live (null)" whose null identity
      // matched nothing on the next reconnect -- so every reconnect added
      // another one. Skipping is the honest outcome: a connection we cannot
      // name is one we cannot recognise again.
      if (!account?.id) continue;
      found.push({
        isPaper,
        accountId: String(account.id),
        accountNumber: account.account_number ? String(account.account_number) : null
      });
    }
  }
  return found;
}

// Which stored row, if any, is this brokerage account — tried in descending
// order of certainty.
//
//  1. The broker's own account id. Immutable, and the only one of the three
//     that cannot be wrong.
//  2. The account number, for rows connected before the id was stored.
//  3. Adoption: one unidentified OAuth row of the same kind. Rows predating
//     the id column carry no identity at all, so without this every one of
//     them would be duplicated on its next reconnect — which is exactly what
//     happened when 0009 could not backfill a renamed account.
//
// Adoption refuses when it is not certain: two unidentified live rows could
// be two different brokerage accounts, and attaching a token to the wrong
// one would show a user another account's positions. Ambiguity inserts a new
// row instead, which is recoverable; a wrong match is not.
async function findExisting(admin, userId, { accountId, accountNumber, isPaper }) {
  const byId = await admin
    .from("trading_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("broker_account_id", accountId)
    .maybeSingle();
  if (byId.data) return byId.data;

  if (accountNumber) {
    const byNumber = await admin
      .from("trading_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("broker_account_number", accountNumber)
      .eq("is_paper", isPaper)
      .is("broker_account_id", null)
      .maybeSingle();
    if (byNumber.data) return byNumber.data;
  }

  const { data: unidentified } = await admin
    .from("trading_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_paper", isPaper)
    .eq("is_oauth", true)
    .is("broker_account_id", null)
    .is("broker_account_number", null);

  return unidentified?.length === 1 ? unidentified[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { code, redirectUri } = await req.json();
    if (!code || !redirectUri) {
      return jsonResponse({ error: "code and redirectUri are required" }, 400);
    }

    const clientId = Deno.env.get("ALPACA_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("ALPACA_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return jsonResponse({ error: "Alpaca OAuth is not configured on the server" }, 500);
    }

    const tokenRes = await fetch("https://api.alpaca.markets/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      })
    });
    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      return jsonResponse({ error: `Alpaca token exchange failed: ${tokenText}` }, 502);
    }
    const tokenData = JSON.parse(tokenText);
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return jsonResponse({ error: "No access_token in Alpaca response" }, 502);
    }

    const detected = await detectAccounts(accessToken);
    if (detected.length === 0) {
      return jsonResponse({ error: "Connected to Alpaca, but couldn't read any authorized account" }, 502);
    }

    const admin = adminClient();
    // Encrypted once and shared: it is the same token for every account it
    // covers, and each call would otherwise produce a different ciphertext for
    // an identical secret.
    const sealed = await encryptSecret(accessToken);
    const saved = [];

    for (const { isPaper, accountId, accountNumber } of detected) {
      // Re-authorizing an account already connected refreshes its token instead
      // of adding a second row for the same brokerage account — which is what
      // reconnecting after an expiry or a scope change does.
      //
      // Three ways to recognise it, in descending order of trust. The name is
      // not among them: names are the user's to edit, since Alpaca's API does
      // not return the nickname its own consent screen shows.
      const existing = await findExisting(admin, user.id, { accountId, accountNumber, isPaper });

      const query = existing
        ? admin
            .from("trading_accounts")
            .update({
              oauth_access_token: sealed,
              // Adopting an unidentified row: give it the identity it never
              // had, so this is the last reconnect that has to guess. The
              // user's own name is left alone.
              broker_account_id: accountId,
              ...(accountNumber ? { broker_account_number: accountNumber } : {})
            })
            .eq("id", existing.id)
        : admin.from("trading_accounts").insert({
            user_id: user.id,
            // A placeholder until it is renamed. The number is what Alpaca
            // prints on its own screens, so it is what a person recognises;
            // the id is what the software matches on.
            name: `Alpaca ${isPaper ? "Paper" : "Live"} (${accountNumber || accountId.slice(0, 8)})`,
            is_paper: isPaper,
            broker_account_id: accountId,
            broker_account_number: accountNumber,
            oauth_access_token: sealed
          });

      const { data, error } = await query.select(SAFE_ACCOUNT_COLUMNS).single();
      if (error) throw new Error(error.message);
      saved.push(data);
    }

    // `account` stays for any caller still reading a single one.
    return jsonResponse({ accounts: saved, account: saved[0] });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
