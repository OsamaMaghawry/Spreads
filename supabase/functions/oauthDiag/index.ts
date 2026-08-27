import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/supabaseClients.ts";

// Answers one question: does Alpaca recognise this app's OAuth credentials?
//
// The authorize page cannot answer it. It is a JavaScript app that calls
// api.alpaca.markets with the end user's session, and it reports an
// unrecognised client and an unregistered redirect URI as the same "Client
// authentication failed due to unknown client" screen, naming neither.
//
// The token endpoint can, because it authenticates with the client id and
// secret and needs no user session. Sent a deliberately invalid authorization
// code, it answers in one of two ways:
//
//   invalid_client  — the credentials themselves were rejected. The app is
//                     unknown, disabled, or the id and secret do not belong
//                     together. Nothing about the redirect URI matters yet.
//   invalid_grant   — the credentials were accepted and only the code was bad,
//                     which is the expected result here. The app exists and is
//                     usable, so an "unknown client" error on the authorize
//                     page is about the redirect URI whitelist instead.
//
// Comparing an unknown client id against a real one with a wrong secret gives
// invalid_client both times, so the real secret is what makes this decisive —
// and it stays here, in the function's own environment. The response carries
// the client id (public, it travels in every authorize URL) and never the
// secret.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const clientId = Deno.env.get("ALPACA_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("ALPACA_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return jsonResponse({
        verdict: "not_configured",
        detail:
          `This environment is missing ${!clientId ? "ALPACA_OAUTH_CLIENT_ID" : ""}` +
          `${!clientId && !clientSecret ? " and " : ""}${!clientSecret ? "ALPACA_OAUTH_CLIENT_SECRET" : ""}. ` +
          "Set it with `supabase secrets set` on this project.",
        serverClientId: clientId || null
      });
    }

    const { redirectUri } = await req.json().catch(() => ({}));

    const res = await fetch("https://api.alpaca.markets/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "DIAGNOSTIC-NOT-A-REAL-CODE",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri || "https://example.com/callback"
      })
    });
    const body = await res.text();
    const message = (() => {
      try { return JSON.parse(body).message || body; } catch { return body; }
    })();

    const credentialsRejected = /invalid_client/i.test(message);
    return jsonResponse({
      verdict: credentialsRejected ? "credentials_rejected" : "credentials_accepted",
      detail: credentialsRejected
        ? "Alpaca did not recognise this client id and secret. The app is unknown, disabled, " +
          "or the two do not belong together — check it at app.alpaca.markets/connect."
        : "Alpaca accepted the client id and secret and rejected only the dummy code, which is " +
          "the expected result. The app is live, so an \"unknown client\" error on the authorize " +
          "page points at the redirect URI not being whitelisted.",
      // Public by construction: it is in every authorize URL. Included so the
      // value the server exchanges with can be compared against the one the
      // browser sends — they are separate variables and can drift apart.
      serverClientId: clientId,
      alpacaStatus: res.status,
      alpacaMessage: message
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
