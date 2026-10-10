-- Accounts read through SnapTrade, beside the ones DeltaMint trades through
-- Alpaca.
--
-- The any-broker plan (10 Oct): a user connects Schwab, Fidelity, IBKR or
-- Robinhood read-only through SnapTrade, and DeltaMint shows positions,
-- history, Analysis and Claude for it with the same engine. Proven first on
-- the owner's Alpaca paper account read both ways: 53 of 53 trades matched
-- to the cent.
--
-- A SnapTrade account is an ordinary trading_accounts row with no Alpaca
-- credentials. That alone keeps every scheduled Alpaca job away from it --
-- loadAllAccounts selects only rows holding a key or token -- and
-- loadAccount refuses it by `provider`, so no order path can reach it.
--
-- Additive and defaulted: every existing row is 'alpaca', and code that does
-- not read the column is unaffected. Production needs this before any
-- release that does read it.

alter table public.trading_accounts
  add column if not exists provider text not null default 'alpaca';

alter table public.trading_accounts
  drop constraint if exists trading_accounts_provider_check;
alter table public.trading_accounts
  add constraint trading_accounts_provider_check check (provider in ('alpaca', 'snaptrade'));

-- SnapTrade's own id for the account, the key every SnapTrade read takes.
alter table public.trading_accounts
  add column if not exists snaptrade_account_id text;

-- One DeltaMint row per SnapTrade account per user, so importing twice adds
-- nothing.
create unique index if not exists trading_accounts_snaptrade_account_uidx
  on public.trading_accounts (user_id, snaptrade_account_id)
  where snaptrade_account_id is not null;

-- The browser reads trading_accounts column by column (migration 0004 revoked
-- the table-wide grant to keep credentials out of it), so a new column is
-- invisible until granted. The Accounts page needs `provider` to mark a row
-- read-only; SnapTrade's own account id stays server-side.
grant select (provider) on public.trading_accounts to authenticated;
