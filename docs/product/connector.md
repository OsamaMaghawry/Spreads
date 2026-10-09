# DeltaMint connector for Claude

Lets a DeltaMint user ask Claude, in plain English, to read their account and
run the Strategy Scanner. Like OptionClaws, except it knows the user's own
account: what they hold, what covers what, their cost basis.

**Status: phase 1, read-only, on production and staging** (released 9 Oct, at
the owner's word: "Push the MCP as well"). It works on production once the
owner switches on the OAuth server there (below).

## What a user can ask

> "Find cash-secured puts on AAPL and MSFT, 30–45 days out, delta under 0.25,
> at least $1 credit."

> "What's open in my paper account and what's at risk this week?"

> "Show me the TSLA chain for next Friday."

> "How have my covered calls on TSLA done since August, and what's my win rate?"

| Tool | What it does | Built on |
|---|---|---|
| `list_accounts` | The user's connected accounts, paper or live | `trading_accounts` |
| `get_positions` | Open positions grouped as the Dashboard groups them, with credit, max loss, P/L, break-even, balances | `_shared/accountSync.ts` (the Dashboard's `syncAccounts`) |
| `get_trade_history` | Every closed trade, newest first, paged; totals by category as Trade History shows them and the win rate as Analysis counts it | `_shared/tradeSync.ts` `fetchTrades` (Trade History's read), without its broker refresh |
| `find_trades` | The Strategy Scanner on the user's filters: put/call spreads, iron condors, cash-secured puts, covered calls | `_shared/entryScan.ts` (the Scanner's `scanEntries`) |
| `get_option_chain` | One expiry's chain around the money, plus shares held and basis | `_shared/chainRead.ts` (the app's `optionChain`) |

Every tool calls the same code the app calls, so Claude and the app give the same
answer. Nothing was copied: the three functions were moved into `_shared/` and the
app's functions became thin wrappers. A scan from Claude with no filters set asks
the same question as an untouched Scanner (0–5 days, delta 0.12–0.22, $1–$3 wide,
$0.20 minimum credit), at most 5 tickers per call.

## Not advice

`find_trades` returns **matches to the user's filters, ranked by return on risk**,
which is the Scanner's ranking. The server's instructions to Claude say:
- present results as matches, never as "the best trade", a recommendation or a
  signal;
- quote prices with their time;
- report a null figure as unknown, not as an estimate.

`mcpProtocol.test.ts` fails if any tool description or the instructions use
advice-style wording.

## Read-only: three locks, each enough on its own

1. **The tools only read.** There is no order, close, cancel or save tool.
2. **The token can't act anywhere else.** Claude's token is a normal DeltaMint
   login token plus a `client_id` claim. `requireUser` refuses any token carrying
   that claim, and so does marketStream's own check. That covers every function
   that can place, close or change orders, accounts or billing. See
   `_shared/connectorToken.ts`. A test fails if a function checks tokens any
   other way.
3. **The token can't write to the database.** Migration 0058 gives every table
   restrictive `connector_no_insert/update/delete` policies. Verified on staging
   (8 Oct): a connector token could read the user's 4 accounts and delete none,
   while a normal login could delete them (the test was rolled back). A test
   fails the build if a new table lacks the three policies.

## Where it runs

- The `mcp` function answers on the production and staging projects only
  (`SITE_BY_PROJECT`), each paired with its own site; 404 anywhere else.
- Migration 0058 is on both databases. On production it was applied without
  `broker_probes`, `snaptrade_probes` and `snaptrade_users`, which exist only on
  staging (lab broker work). Whoever brings those tables to production adds
  their three policies; the check at the end of this doc lists any table
  without them.

## Where users find it

- **Marketing site:** a "Works with Claude" section on the homepage
  (deltamint.app/#claude) and a setup page at `/connect` with the address to
  copy, the steps, and what Claude can and can't do. Both come from
  `landing/src/connector.js`, which does nothing unless `CONNECTOR_UPSTREAM` is
  set; each wrangler file sets it to its own project's function.
  `landing/src/connector.test.js` holds the two apart.
- **App:** "Use with Claude" in the menu (`/connect-claude`,
  `src/pages/ConnectClaude.jsx`) with the same steps, plus **Connected apps**:
  the list of apps the user approved (`supabase.auth.oauth.listGrants`) and a
  Disconnect button (`revokeGrant`), which ends that app's access at once.
- **Dashboard:** a one-line card pointing to that page
  (`src/components/dashboard/ConnectorNudge.jsx`). Dismissing it is remembered
  in that browser.

## The address

People paste **`https://deltamint.app/mcp`** (staging:
`https://dev-landing.deltamint.app/mcp`). The landing Worker passes `/mcp` and
the two `/.well-known/oauth-protected-resource` paths through to the Supabase
function, adding `X-DeltaMint-Public-Origin`. The function believes that header
only from the site paired with its project, and then names our address in its
sign-in pointers; Claude requires the metadata to name the URL it connected to.

The Supabase address (`…supabase.co/functions/v1/mcp`) still answers, so a
connection made with it keeps working, but nothing shows it any more.

Sign-in is under our name too (9 Oct; the owner: "I don't want any Supabase
name during the process"). Supabase Auth still issues the tokens, but our site
is the authorization server Claude is told about: `/.well-known/oauth-authorization-server`
on our site is Supabase's metadata with our site as issuer and
`<site>/oauth/authorize` as the sign-in step. The phone says "Claude wants to
use deltamint.app to sign in"; the Worker asks Supabase for the authorization
server-side and sends the browser straight to our approval page on the
dashboard (by name, whatever Site URL the project holds). Registration and
token exchange are Claude's servers talking to Supabase's and go direct.

## How sign-in works

```
Claude ──POST deltamint.app/mcp──▶ 401 + "sign in here" (metadata URL)
Claude ──reads metadata──▶ authorization server = deltamint.app (fronting Supabase Auth)
Claude ──registers itself (with Supabase, server to server)
Claude ──opens the browser at deltamint.app/oauth/authorize──▶ dashboard.deltamint.app/oauth/consent
User   ──signs in if needed, sees what Claude can and cannot do──▶ Allow / Deny
Supabase ──issues a token to Claude──▶ Claude calls the tools with it
```

The `mcp` function runs with `verify_jwt = false` (`supabase/config.toml` says
why) and checks the token itself on every request.

## To switch it on (owner, once per project)

Done on staging. For production, the same in the production project:

1. **Supabase dashboard → the project → Authentication → OAuth Server:**
   - turn on the OAuth 2.1 server;
   - set Authorization Path to `/oauth/consent`;
   - turn on dynamic client registration.
2. **Authentication → URL Configuration:** the app's address must be the Site
   URL or one of the Redirect URLs, written exactly, with no trailing slash:
   `https://dashboard.deltamint.app` (staging: `https://dev-dash.deltamint.app`).
   Supabase compares the approval page's Origin header against these two
   settings only (`validateRequestOrigin` in supabase/auth). Missing, the
   approval page shows "unauthorized request origin" (production, 9 Oct).
3. **In Claude:** Settings → Connectors → Add custom connector →
   `https://deltamint.app/mcp`. Sign in with your DeltaMint login and press
   Allow.

If sign-in fails at the token step, the likely cause is the requested scope. The
server asks for `email`, not `openid`, because ID tokens need asymmetric signing
keys. Supabase's logs show which.

## Release list

- **Privacy Policy:** done 9 Oct (section 4, an AI assistant you connect;
  section 5, how to disconnect). PDF regenerated. The copy sent to Alpaca
  earlier predates it.
- **Migration 0058 on production, lab entries removed, function enabled on
  production, landing configured:** done 9 Oct.
- **OAuth server on production:** the owner's step above.
- **Still open, released without at the owner's word:**
  - **Alpaca:** confirm that passing their market data (quotes, chains) to a
    user's AI assistant is allowed under the data agreement. Ask in the
    existing review thread.
  - **Disconnect end to end:** after Disconnect on `/connect-claude`, Claude's
    next call must get 401. Not yet tried by a person.
  - **Pricing:** whether it's a Live-plan feature. Nothing on the site says
    it's free or paid.

## Phase 2 (not built)

Draft orders. Claude saves a setup as a draft in DeltaMint, and the user reviews
and sends it from the app. Claude never sends an order. This needs a deliberate
exception to lock 3 for `saved_orders` only, plus its own review.

## Who uses it

Admin → **AI connector** (`src/components/admin/ConnectorPanel.jsx`): people
connected, by app; in use now (a request in the last 5 minutes); active today,
7 and 30 days; requests per day and by tool; and each person's app, connection
date and last use. Connections come from Supabase Auth's own record of each
approval (`auth.oauth_consents`); usage from `connector_calls`, one row per
tool call written by the `mcp` function, kept 90 days by a daily job. Both are
read through `public.connector_stats()`, which only the service role can run
(migration 0059). Each assistant names itself when it registers, so ChatGPT
or Grok appear under their own names with nothing to change.

## Checks

Tables in the database without the connector policies (should return nothing):

```sql
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity
  and (select count(*) from pg_policies p where p.schemaname = 'public'
       and p.tablename = c.relname and p.policyname like 'connector_no_%') < 3;
```

Calls are logged by the `mcp` function as one JSON line each:
`{"connector":"tools/call","user":…,"client":…,"tool":…,"args":…}`.
