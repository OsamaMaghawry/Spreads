-- A stable identity for an OAuth-connected brokerage account.
--
-- alpacaOAuthCallback decides between refreshing an existing connection and
-- adding a new one by looking for a row with the same *name* — which worked
-- only while the name was generated ("Alpaca Live (123456789)") and therefore
-- reproducible. Accounts are now renameable, because Alpaca's API does not
-- expose the nickname shown on its own consent screen and the account number
-- alone cannot tell "OS-LIVE" from "HLAL". The moment a name is edited, that
-- lookup misses and reconnecting duplicates the account.
--
-- So the account number is stored in its own column and the match happens on
-- that instead. Purely additive: no existing column changes.

alter table public.trading_accounts
  add column if not exists broker_account_number text;

-- Existing OAuth rows still carry the number inside their generated name, so
-- they can be matched on the first reconnect rather than duplicated. Rows a
-- user has already renamed by hand will not match and stay null; there is
-- nowhere else to recover the number from.
update public.trading_accounts
   set broker_account_number = substring(name from '^Alpaca (?:Live|Paper) \((.+)\)$')
 where broker_account_number is null
   and name ~ '^Alpaca (?:Live|Paper) \(.+\)$';

-- One row per brokerage account per user: the constraint the name match was
-- standing in for. is_paper is part of the key because a single authorization
-- covers a live and a paper account and only the endpoint that answered
-- distinguishes them — if Alpaca ever numbered a pair alike, onboarding would
-- fail on the second insert rather than merge two different accounts.
-- Manually-keyed accounts leave the number null and are unaffected, since nulls
-- do not collide in a unique index.
create unique index if not exists trading_accounts_user_broker_account_number_idx
  on public.trading_accounts (user_id, broker_account_number, is_paper)
  where broker_account_number is not null;

-- Migration 0004 replaced the table-wide select grant with an explicit column
-- list, so a new column is unreadable by the browser until it is named here.
-- The account number is not a credential — it is printed on Alpaca's own
-- screens — and the account list shows it beneath a renamed account.
grant select (broker_account_number) on public.trading_accounts to authenticated;
