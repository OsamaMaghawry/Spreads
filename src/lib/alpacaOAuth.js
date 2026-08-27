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

const SCOPES = ["account:write", "trading", "data"];

// Built by hand rather than with URLSearchParams, which encodes the scope
// separator as "+" and the colon as "%3A" — giving
// `scope=account%3Awrite+trading+data`. Both are valid form-encoding and a
// strict RFC 6749 server decodes them identically, but a working request
// observed against this same endpoint sends
// `scope=account:write%20trading%20data`, and matching a request that is known
// to be accepted costs nothing while removing a variable from a failure we
// cannot otherwise reproduce.
export function authorizeUrl(state) {
  const query = [
    "response_type=code",
    `client_id=${encodeURIComponent(CLIENT_ID || "")}`,
    `redirect_uri=${encodeRedirectUri(REDIRECT_URI)}`,
    `scope=${SCOPES.join("%20")}`,
    `state=${encodeURIComponent(state)}`
  ].join("&");
  return `https://app.alpaca.markets/oauth/authorize?${query}`;
}

// `:` and `/` are legal unencoded in a query string (RFC 3986 §3.4), and the
// working request sends the redirect URI that way — `redirect_uri=https://…`
// rather than `https%3A%2F%2F…`. Percent-encoding is what RFC 6749 asks for and
// a compliant server decodes before comparing against the registered value, but
// a server comparing raw strings would not match, and that failure is
// indistinguishable from every other cause on Alpaca's error page.
//
// Anything that would genuinely break query parsing is still encoded; a URI
// containing those characters could not be registered as-is anyway.
function encodeRedirectUri(uri) {
  return /[?#&%\s]/.test(uri) ? encodeURIComponent(uri) : uri;
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
