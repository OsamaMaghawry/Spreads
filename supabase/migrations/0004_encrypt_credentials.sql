-- Brokerage credentials are encrypted by the edge functions before they are
-- written (AES-256-GCM; see supabase/functions/_shared/crypto.ts), with the key
-- held as a function secret rather than in the database. This migration makes
-- the database enforce the other half of that guarantee.
--
-- Row-level security already scopes *rows* to their owner. What it cannot do is
-- stop a user reading their own credential columns into the browser, which is
-- how api_key, api_secret and oauth_access_token were reaching client code. The
-- grants below scope *columns* as well: the browser can read the account list
-- and delete accounts, and nothing else. All writes go through the saveAccount
-- and alpacaOAuthCallback functions, which encrypt before storing.

-- Non-secret facts the account list needs, so no client has any reason to read
-- a credential column. is_oauth is generated rather than stored by hand, so it
-- can never drift from the column it describes.
alter table public.trading_accounts
  add column if not exists api_key_hint text;

alter table public.trading_accounts
  add column if not exists is_oauth boolean
    generated always as (oauth_access_token is not null) stored;

-- Column-level privileges cannot be carved out of a table-wide grant, so the
-- table-wide grant is withdrawn first and replaced with an explicit column list.
-- service_role is untouched and keeps full access for the edge functions.
revoke all on public.trading_accounts from anon, authenticated;

grant select
  (id, user_id, name, is_paper, is_oauth, api_key_hint,
   spreads_client_prefix, wheel_client_prefix, created_at)
  on public.trading_accounts to authenticated;

grant delete on public.trading_accounts to authenticated;

-- The insert/update policies from 0001 are now unreachable for these roles,
-- since the privileges behind them are gone. Dropping them keeps the policy
-- list honest about what is actually permitted.
drop policy if exists "insert own trading accounts" on public.trading_accounts;
drop policy if exists "update own trading accounts" on public.trading_accounts;
