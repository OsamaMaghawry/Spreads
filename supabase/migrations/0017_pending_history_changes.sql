-- What a sync wanted to change and did not.
--
-- A sync recomputes an account from the whole broker feed, and until now it
-- wrote whatever it computed: rows a user had already been shown, already
-- reasoned about, possibly already filed, rewritten on a page load because the
-- reconstruction had learned something new. The snapshot made that reversible
-- and a runbook made it repairable, but neither made it asked for.
--
-- New rows still land on their own -- that is the product working, and a first
-- sync into an empty account is nothing but new rows. Rewriting or removing a
-- row that is already stored now waits for the person whose money it is. This
-- column holds what is waiting, so the account can say so on every page load
-- without re-reading the broker feed to find out.
--
--   { "removed": 2, "changed": 5, "removedLots": 0, "changedLots": 3,
--     "at": "2026-08-30T09:12:44.000Z" }
--
-- Null means nothing is waiting.
alter table public.trading_accounts
  add column if not exists trades_pending_review jsonb;

-- Readable by the account's owner: it is the banner on their own history page.
-- Column-level, because 0004 replaced the table-wide select grant with an
-- explicit list and a new column is invisible until it is named here.
grant select (trades_pending_review) on public.trading_accounts to authenticated;
