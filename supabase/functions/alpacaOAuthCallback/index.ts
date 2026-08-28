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
  const found: { isPaper: boolean; accountNumber: string }[] = [];
  for (const [isPaper, base] of [
    [false, "https://api.alpaca.markets/v2"],
    [true, "https://paper-api.alpaca.markets/v2"]
  ] as const) {
    const res = await fetch(`${base}/account`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => null);
    if (res && res.ok) {
      const account = await res.json();
      found.push({ isPaper, accountNumber: account.account_number });
    }
  }
  return found;
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

    for (const { isPaper, accountNumber } of detected) {
      const name = `Alpaca ${isPaper ? "Paper" : "Live"} (${accountNumber})`;

      // Re-authorizing an account already connected refreshes its token instead
      // of adding a second row for the same brokerage account — which is what
      // reconnecting after an expiry or a scope change does.
      const { data: existing } = await admin
        .from("trading_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();

      const query = existing
        ? admin.from("trading_accounts").update({ oauth_access_token: sealed }).eq("id", existing.id)
        : admin.from("trading_accounts").insert({
            user_id: user.id,
            name,
            is_paper: isPaper,
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
