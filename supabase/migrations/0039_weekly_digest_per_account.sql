-- One email per account, so the sends table is keyed on the account.
--
-- The owner, on the first review copy: *"Each account should have the premium
-- and stocks moves [...] most probably will be only one live and the rest
-- demo. So no point of summing them all. [...] Each account should be in a
-- separate email. I need exactly to see things as if it's real."*
--
-- The idempotency key moves with it. Keyed per USER, a person with four
-- accounts would have had one of their four emails recorded and the other
-- three refused as duplicates of it.
alter table public.weekly_digest_sends
  add column if not exists account_id uuid references public.trading_accounts(id) on delete cascade;

-- The old per-user rows cannot be mapped onto an account and describe a shape
-- of email that no longer exists. Deleted rather than migrated: the only thing
-- they could do now is suppress a send that should happen.
delete from public.weekly_digest_sends where account_id is null;

alter table public.weekly_digest_sends
  alter column account_id set not null;

alter table public.weekly_digest_sends
  drop constraint if exists weekly_digest_sends_user_id_week_start_mode_key;

alter table public.weekly_digest_sends
  add constraint weekly_digest_sends_account_week_mode_key
  unique (account_id, week_start, mode);
