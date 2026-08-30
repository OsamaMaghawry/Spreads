-- The identifier Alpaca actually guarantees, and a refusal to store a row
-- without one.
--
-- 0009 matched a reconnect on `broker_account_number`, parsed out of the
-- generated name for existing rows. Its own comment predicted the hole: a row
-- the user had renamed could not be backfilled and stayed null. Nulls do not
-- collide in a partial unique index, so those rows matched nothing on
-- reconnect and were duplicated instead of refreshed. That is what happened --
-- an account renamed "Alton Live" sat beside a second row for the same
-- brokerage account, and a third row exists named literally
-- "Alpaca Live (null)" because `account.account_number` came back absent and
-- nothing checked before using it in a name, a match and a stored column.
--
-- Two different failures, one cause: the identity was a display string read
-- out of a mutable name, and it was never required to exist.
--
-- `/v2/account` returns `id`, a UUID that is the account's own identifier --
-- immutable, not derived from anything a user can edit, and always present.
-- That becomes the identity; the number stays for display.
alter table public.trading_accounts
  add column if not exists broker_account_id text;

-- One row per brokerage account per user, on the identifier rather than on a
-- name-derived string. is_paper is not part of this key: unlike an account
-- number, the UUID already distinguishes a live account from a paper one, so
-- including it would let the same account be stored twice under two flags.
create unique index if not exists trading_accounts_user_broker_account_id_idx
  on public.trading_accounts (user_id, broker_account_id)
  where broker_account_id is not null;

-- Readable by the browser like the number is: it identifies an account, it is
-- not a credential, and the account list needs it to tell two renamed accounts
-- apart. Migration 0004 replaced the table-wide select grant with an explicit
-- column list, so a new column is invisible until named here.
grant select (broker_account_id) on public.trading_accounts to authenticated;

-- Existing rows cannot be backfilled from anything already stored -- the UUID
-- appears in no name and no other column. They are filled in on the next
-- reconnect: the callback adopts an unidentified row rather than inserting
-- beside it. Deliberately left null rather than guessed at.
