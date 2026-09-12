// The columns of trading_accounts that are safe to return to a browser: every
// column except the three that hold credentials. Column-level grants in
// migration 0004 enforce the same list at the database, so this is the shape a
// client can read, not merely the shape we choose to send.
export const SAFE_ACCOUNT_COLUMNS =
  "id, user_id, name, is_paper, is_oauth, api_key_hint, broker_account_id, broker_account_number, spreads_client_prefix, wheel_client_prefix, created_at";

import { decryptSecret } from "./crypto.ts";
import { selectAllWhere } from "./paging.ts";

/**
 * Every CONNECTED account, credentials decrypted for the length of the request.
 *
 * Lived inside positionWatch, and `syncTrades` needs exactly the same thing —
 * two copies of a credential-decrypting loop is one more than should exist.
 *
 * Paged, which the original was not: an unbounded select is capped at a
 * thousand rows and reports no error, so past a thousand connected accounts the
 * watch would simply have stopped watching the rest, silently, at the moment
 * the product started working.
 *
 * The filter is what makes an account "connected": it holds either an OAuth
 * token or an API key. A row with neither cannot reach a broker, and including
 * it would turn every scheduled run into a list of failures nobody can act on.
 */
export async function loadAllAccounts(admin: any, opts: { paperOnly?: boolean } = {}) {
  const rows = await selectAllWhere(admin, "trading_accounts", "*", "id", (q) => {
    const connected = q.or("oauth_access_token.not.is.null,api_key.not.is.null");
    // PAPER ONLY is applied HERE rather than in each caller, because this is
    // the one door every scheduled job already walks through -- the trade
    // sync, the daily equity series and the position watch all load their work
    // list from this function. A filter in three callers is a filter that
    // eventually exists in two. See PAPER_ONLY in settings.ts.
    //
    // Passed in rather than read here: this module does no I/O of its own
    // beyond the query it was asked for, and a shared loader that silently
    // consults a settings table is one whose behaviour cannot be read off its
    // signature.
    return opts.paperOnly ? connected.eq("is_paper", true) : connected;
  });
  const out: any[] = [];
  for (const a of rows) {
    out.push({
      ...a,
      api_key: await decryptSecret(a.api_key),
      api_secret: await decryptSecret(a.api_secret),
      oauth_access_token: await decryptSecret(a.oauth_access_token)
    });
  }
  return out;
}
