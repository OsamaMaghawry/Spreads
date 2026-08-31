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
// Every environment this token can actually reach, and — just as important —
// every one it could not.
//
// This used to keep only the successes: `if (res && res.ok)`, with the failure
// branch empty. A live account Alpaca refused (403) was therefore stored as the
// exact same outcome as a token that simply has no live account — nothing. The
// user was told the connection succeeded, only their paper account appeared,
// and no trace of the refusal reached the user, the logs, or the admin panel.
//
// We cannot always tell the two apart: a paper-only authorization also returns
// 403 from the live endpoint, and Alpaca does not say which case it is. So the
// honest report is "not granted", with the broker's own status attached, rather
// than either silence or a false alarm.
async function detectAccounts(accessToken: string) {
  const found: { isPaper: boolean; accountId: string; accountNumber: string | null }[] = [];
  const issues: { environment: string; status: number | null; detail: string }[] = [];

  for (const [isPaper, base] of [
    [false, "https://api.alpaca.markets/v2"],
    [true, "https://paper-api.alpaca.markets/v2"]
  ] as const) {
    const environment = isPaper ? "paper" : "live";
    let res: Response | null = null;
    try {
      res = await fetch(`${base}/account`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (e) {
      issues.push({ environment, status: null, detail: `Could not reach Alpaca: ${e?.message || e}` });
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      issues.push({ environment, status: res.status, detail: body.slice(0, 500) });
      continue;
    }

    const account = await res.json().catch(() => null);
    // An account with no identifier is not stored at all. Previously
    // `account_number` was used unchecked, and when it came back absent the
    // result was a row named "Alpaca Live (null)" whose null identity
    // matched nothing on the next reconnect -- so every reconnect added
    // another one. Skipping is the honest outcome: a connection we cannot
    // name is one we cannot recognise again -- but it is recorded now.
    if (!account?.id) {
      issues.push({
        environment,
        status: res.status,
        detail: "Alpaca returned an account with no id, so it cannot be recognised on reconnect"
      });
      continue;
    }
    found.push({
      isPaper,
      accountId: String(account.id),
      accountNumber: account.account_number ? String(account.account_number) : null
    });
  }
  return { found, issues };
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
    .select("id, trades_synced_at")
    .eq("user_id", userId)
    .eq("is_paper", isPaper)
    .eq("is_oauth", true)
    .is("broker_account_id", null)
    .is("broker_account_number", null);

  if (unidentified?.length !== 1) return null;
  const candidate = unidentified[0];

  // Adoption only takes a row with nothing in it.
  //
  // This was widened once, on the reasoning that a wrong token reconstructs
  // entirely different trade keys and the mass-delete guard refuses before
  // writing. Two things are wrong with that. The guard caps deletions and not
  // in-place rewrites, so it does not cover the path it was invoked to cover;
  // and adoption does not only rebind history. It rewrites the row's access
  // token, and openPosition and closeSpread load their credentials from that
  // row -- so a wrong guess routes live orders to a different brokerage
  // account under a name that still says otherwise. That is not a mistake a
  // history guard can catch.
  //
  // The cost of refusing is a duplicate row for a legacy account whose next
  // reconnect can no longer fill in its identity. That cost was checked rather
  // than argued: every OAuth row in production already carries an account
  // number, so path 2 above matches them and this path is not reached. A
  // duplicate is recoverable in a way a misrouted order is not.
  if (candidate.trades_synced_at) return null;
  const trades = await countRows(admin, "trade_records", candidate.id);
  const lots = await countRows(admin, "stock_lots", candidate.id);
  return trades === 0 && lots === 0 ? { id: candidate.id } : null;
}

// A failed count is not an empty account: null means "unknown", and unknown
// is the answer that refuses.
async function countRows(admin, table, accountId) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);
  return error ? null : (count ?? 0);
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

    const { found: detected, issues } = await detectAccounts(accessToken);

    const admin = adminClient();

    // Recorded before the early return below, so a connection that reached no
    // account at all still leaves the reason behind instead of a bare 502.
    if (issues.length) {
      for (const i of issues) {
        console.error(`alpacaOAuth ${user.id} ${i.environment}: ${i.status ?? "unreachable"} ${i.detail}`);
      }
      const { error: issueErr } = await admin.from("broker_connection_issues").insert(
        issues.map((i) => ({
          user_id: user.id,
          broker: "alpaca",
          environment: i.environment,
          status: i.status,
          detail: i.detail
        }))
      );
      // Never let bookkeeping sink a connection that otherwise worked.
      if (issueErr) console.error(`alpacaOAuth: could not record issues: ${issueErr.message}`);
    }

    if (detected.length === 0) {
      const why = issues
        .map((i) => `${i.environment}: ${i.status ?? "unreachable"}${i.detail ? ` ${i.detail}` : ""}`)
        .join("; ");
      return jsonResponse(
        { error: `Connected to Alpaca, but couldn't read any authorized account${why ? ` — ${why}` : ""}`, issues },
        502
      );
    }
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

    // `account` stays for any caller still reading a single one. `issues` is
    // what the old code threw away: an environment the broker would not grant,
    // reported even though the connection as a whole succeeded, so a user whose
    // live account was refused finds out now rather than wondering where it is.
    return jsonResponse({ accounts: saved, account: saved[0], issues });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
