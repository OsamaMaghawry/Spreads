// Alpaca OAuth (Connect) redirect flow. The client secret never touches the
// browser — the callback page exchanges the code for a token server-side via
// the alpacaOAuthCallback edge function.
//
// Account selection (which of the user's live/paper accounts to authorize)
// happens on Alpaca's own hosted consent page, not here — we don't ask the
// user paper-vs-live up front.

const CLIENT_ID = import.meta.env.VITE_ALPACA_OAUTH_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/oauth/callback`;

export function startAlpacaOAuth() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("alpaca_oauth_state", state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: "account:write trading data"
  });
  window.location.href = `https://app.alpaca.markets/oauth/authorize?${params.toString()}`;
}

export function getOAuthRedirectUri() {
  return REDIRECT_URI;
}
