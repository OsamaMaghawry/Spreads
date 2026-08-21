// Alpaca OAuth (Connect) redirect flow. The client secret never touches the
// browser — the callback page exchanges the code for a token server-side via
// the alpacaOAuthCallback edge function.

const CLIENT_ID = import.meta.env.VITE_ALPACA_OAUTH_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/oauth/callback`;

export function startAlpacaOAuth(isPaper) {
  const state = crypto.randomUUID();
  sessionStorage.setItem("alpaca_oauth_state", state);
  sessionStorage.setItem("alpaca_oauth_is_paper", String(isPaper));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: "account:write trading data",
    env: isPaper ? "paper" : "live"
  });
  window.location.href = `https://app.alpaca.markets/oauth/authorize?${params.toString()}`;
}

export function getOAuthRedirectUri() {
  return REDIRECT_URI;
}
