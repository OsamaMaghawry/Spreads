import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";

// The user picks which account (live or paper) to authorize on Alpaca's own
// consent page, so we don't know which one we got back — probe both trading
// API bases with the token and see which one accepts it.
async function detectAccount(accessToken: string) {
  for (const [isPaper, base] of [
    [false, "https://api.alpaca.markets/v2"],
    [true, "https://paper-api.alpaca.markets/v2"]
  ] as const) {
    const res = await fetch(`${base}/account`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => null);
    if (res && res.ok) {
      const account = await res.json();
      return { isPaper, accountNumber: account.account_number };
    }
  }
  return null;
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

    const detected = await detectAccount(accessToken);
    if (!detected) {
      return jsonResponse({ error: "Connected to Alpaca, but couldn't read the authorized account" }, 502);
    }

    const admin = adminClient();
    const { data, error } = await admin
      .from("trading_accounts")
      .insert({
        user_id: user.id,
        name: `Alpaca ${detected.isPaper ? "Paper" : "Live"} (${detected.accountNumber})`,
        is_paper: detected.isPaper,
        oauth_access_token: accessToken
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return jsonResponse({ account: data });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
