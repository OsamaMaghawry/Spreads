// Alpaca OAuth (Connect) redirect flow. The client secret never touches the
// browser — the callback page exchanges the code for a token server-side via
// the alpacaOAuthCallback edge function.
//
// Account selection (which of the user's live/paper accounts to authorize)
// happens on Alpaca's own hosted consent page, not here — we don't ask the
// user paper-vs-live up front. The DDQ disclosure shown before the redirect is
// a separate requirement; see AlpacaConnectConsent.jsx.

const CLIENT_ID = import.meta.env.VITE_ALPACA_OAUTH_CLIENT_ID;

// The redirect URI must byte-for-byte match one registered on the OAuth app at
// app.alpaca.markets/connect. It is therefore configuration, not something to
// infer from wherever the bundle happens to be served.
//
// This used to be `${window.location.origin}/oauth/callback`, which silently
// produced a different URI per environment — dashboard.deltamint.app,
// dev-dash.deltamint.app, localhost, any preview deploy — so every origin that
// was never registered failed at Alpaca with a generic error page and nothing
// on our side to point at. The fallback stays for local development only.
const REDIRECT_URI =
  import.meta.env.VITE_ALPACA_OAUTH_REDIRECT_URI || `${window.location.origin}/oauth/callback`;

export function getOAuthRedirectUri() {
  return REDIRECT_URI;
}

const SCOPE = "account:write trading data";

// Standard form encoding, which is what RFC 6749 asks for and what a working
// request against this endpoint actually sends:
//
//   redirect_uri=https%3A%2F%2Fhost%2Fpath   scope=account%3Awrite+trading+data
//
// This briefly emitted `https://host/path` and `account:write%20trading%20data`
// instead, on the theory that Alpaca might compare raw strings — read off a
// browser address bar, which displays a decoded URL and is not evidence of what
// was sent. The encoding was never the problem, so there is nothing here to
// tune: an "unknown client" response is about the client id or the registered
// redirect URI, not this.
// `env` is deliberately not sent. Alpaca's parameter narrows the consent screen
// to only a live or only a paper account; omitting it lists every account the
// user has — live and paper — and lets them tick the ones they want. That
// choice is theirs to make at the moment of connecting, not ours to pin at
// build time, and it is the only way to authorize more than one account.
export function authorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID || "",
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state
  });
  return `https://app.alpaca.markets/oauth/authorize?${params.toString()}`;
}

// Alpaca's authorize page reports a bad client_id or an unregistered redirect
// URI as one generic "Client authentication failed due to unknown client"
// screen, on their domain, with no indication of which value it objected to.
// So state what we are about to send before sending it — a mismatch is then
// readable here instead of guessed at there.
export function describeOAuthConfig() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const configured = Boolean(import.meta.env.VITE_ALPACA_OAUTH_REDIRECT_URI);
  return {
    clientId: CLIENT_ID || null,
    redirectUri: REDIRECT_URI,
    origin,
    configured,
    // Alpaca will not redirect back to a different origin than the one that
    // started the flow, so this combination cannot work even if registered.
    originMismatch: Boolean(origin) && !REDIRECT_URI.startsWith(`${origin}/`),
    // The exact URL the button navigates to, so it can be read and compared
    // before the browser leaves for a page that explains nothing.
    authorizeUrl: authorizeUrl("EXAMPLE-STATE")
  };
}

export function startAlpacaOAuth() {
  // Without this the URLSearchParams below stringifies an undefined CLIENT_ID to
  // the literal "undefined", and the failure only surfaces on Alpaca's side as a
  // generic invalid-client error.
  if (!CLIENT_ID) {
    throw new Error(
      'Missing VITE_ALPACA_OAUTH_CLIENT_ID at build time. Set it in the environment that runs ' +
      '`vite build` — locally in .env.local, on Cloudflare under Settings → Build → Variables ' +
      'and secrets — then rebuild.'
    );
  }

  const { originMismatch, origin } = describeOAuthConfig();
  if (originMismatch) {
    throw new Error(
      `This build is configured to send the redirect URI ${REDIRECT_URI}, but the app is running ` +
      `on ${origin}. Alpaca would refuse the round trip. Set VITE_ALPACA_OAUTH_REDIRECT_URI for ` +
      `this environment to a URI registered on the OAuth app at app.alpaca.markets/connect.`
    );
  }

  const state = crypto.randomUUID();
  sessionStorage.setItem("alpaca_oauth_state", state);
  window.location.href = authorizeUrl(state);
}
