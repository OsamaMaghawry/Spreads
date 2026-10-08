# DeltaMint connector for Claude

Lets a DeltaMint user ask Claude, in plain English, to read their account and
run the Strategy Scanner. Like OptionClaws, except it knows the user's own
account: what they hold, what covers what, their cost basis.

**Status: phase 1, read-only, staging only** (`wpwaomzgpbozzghohwmf`). Not in
production. Production fails closed in three places (below).

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

## Staging only

- The `mcp` function returns 404 on any project but staging.
- The approval page is a lab module (`LAB_MODULES`). It isn't in the production
  build.
- Production has no OAuth server switched on, so nothing could start a
  connection there.

## Where users find it (staging)

- **Marketing site:** a "Works with Claude" section on the homepage
  (dev-landing.deltamint.app/#claude) and a setup page at `/connect` with the
  address to copy, the steps, and what Claude can and can't do. Both come from
  `landing/src/connector.js`, which does nothing unless `CONNECTOR_MCP_URL` is
  set. Only `landing/wrangler.staging.jsonc` sets it, and production's Worker
  isn't even invoked for `/` or `/connect`. `landing/src/connector.test.js`
  holds both.
- **App:** "Use with Claude" in the menu (`/connect-claude`,
  `src/pages/ConnectClaude.jsx`) with the same steps, plus **Connected apps**:
  the list of apps the user approved (`supabase.auth.oauth.listGrants`) and a
  Disconnect button (`revokeGrant`), which ends that app's access at once.
- **Dashboard:** a one-line card pointing to that page
  (`src/components/dashboard/ConnectorNudge.jsx`). Dismissing it is remembered
  in that browser.
- All three app pieces are lab modules, so the production build has none.

## How sign-in works

```
Claude ──POST /functions/v1/mcp──▶ 401 + "sign in here" (metadata URL)
Claude ──reads metadata──▶ authorization server = Supabase Auth (staging)
Claude ──registers itself, opens the browser──▶ dev-dash.deltamint.app/oauth/consent
User   ──signs in if needed, sees what Claude can and cannot do──▶ Allow / Deny
Supabase ──issues a token to Claude──▶ Claude calls the tools with it
```

The `mcp` function runs with `verify_jwt = false` (`supabase/config.toml` says
why) and checks the token itself on every request.

## To switch it on (owner, staging only)

1. **Supabase dashboard → the staging project → Authentication → OAuth Server:**
   - turn on the OAuth 2.1 server;
   - set Authorization Path to `/oauth/consent`;
   - turn on dynamic client registration.
2. **Authentication → URL Configuration:** check the Site URL is
   `https://dev-dash.deltamint.app`.
3. **In Claude:** Settings → Connectors → Add custom connector →
   `https://wpwaomzgpbozzghohwmf.supabase.co/functions/v1/mcp`. Sign in with your
   staging DeltaMint login and press Allow.

If sign-in fails at the token step, the likely cause is the requested scope. The
server asks for `email`, not `openid`, because ID tokens need asymmetric signing
keys. Supabase's logs show which.

## Before production (phase 1 → customers)

- **Privacy Policy:** say that account data is sent to the AI app the user
  connects, and only when they connect it. Then regenerate the PDFs.
- **Alpaca:** confirm that passing their market data (quotes, chains) to a
  user's AI assistant is allowed under the data agreement. Ask in the existing
  review thread.
- **Revoking access:** built ("Connected apps" on `/connect-claude`). Before
  release, test Disconnect end to end: after it, Claude's next call must get 401.
- **Pricing:** decide whether it's a Live-plan feature.
- **Release:** apply migration 0058 to production, remove the lab entries and the
  staging-ref check, enable the OAuth server on production, and set
  `CONNECTOR_MCP_URL` in `landing/wrangler.jsonc` (and add `/` and `/connect`
  to its `run_worker_first`). The landing test will need its production
  assertions changed on purpose.

## Phase 2 (not built)

Draft orders. Claude saves a setup as a draft in DeltaMint, and the user reviews
and sends it from the app. Claude never sends an order. This needs a deliberate
exception to lock 3 for `saved_orders` only, plus its own review.

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
