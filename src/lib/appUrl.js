// Where this build lives, for links that leave the app and come back.
//
// `window.location.origin` is the wrong default for an emailed link: it sends
// the user back to whatever host they happened to be on when they signed up.
// The Cloudflare worker answers on its own workers.dev subdomain as well as the
// real domain, and those are different origins — different storage, different
// session — so a confirmation link resolved that way lands somebody on a page
// where they are not logged in and their accounts are not there.
//
// The configured value wins; the origin is only a development fallback.
export const APP_URL = (
  import.meta.env.VITE_APP_URL ||
  (typeof window === "undefined" ? "" : window.location.origin)
).replace(/\/$/, "");

export const appUrl = (path = "/") => `${APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
