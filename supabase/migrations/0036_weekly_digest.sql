-- The weekly email, and the switch that decides who receives it.
--
-- The owner: *"I want to have a weekly email that has the premium paid, the
-- premium earned, anything related to the premium, and the overall portfolio
-- performance, stocks, everything related to their portfolio... But first,
-- send it to me to test for all users, and then we're sending to the users.
-- For me first."*
--
-- So this ships with delivery pointed at the OWNER. Every user's email is
-- built in full and delivered to him, stamped with whose account it is and
-- that it was not sent to them. He reads a real week of real emails before a
-- single one leaves for a customer, and flipping to per-user delivery is one
-- row in app_settings rather than a deploy.
--
-- THE BLOCKER THIS CLEARS. Until now every email this product sends goes to
-- `watch_settings.recipient_email` -- one global address, the owner's. That is
-- recorded in docs/product/features.md as the reason the watch is "not yet
-- sellable": one person receives every user's alerts. A per-user weekly email
-- needs per-user addresses, so this migration is where that routing is made
-- possible and, deliberately, is left switched off.

-- ---------------------------------------------------------------------------
-- Who has asked not to receive it
-- ---------------------------------------------------------------------------
--
-- On `profiles` rather than in a preferences table of its own: it is one
-- boolean, it is read on every send, and a recurring email a person cannot
-- stop is not one this product is willing to send. The default is false
-- because the email reports the account the person connected and is a record
-- of their own money; the moment they say stop, this column is the record of
-- it and nothing re-asks.
alter table public.profiles
  add column if not exists weekly_digest_opt_out boolean not null default false;

comment on column public.profiles.weekly_digest_opt_out is
  'True when this person has asked to stop receiving the weekly summary email. Honoured on every send; never reset by a job.';

-- ---------------------------------------------------------------------------
-- What was sent, to whom, for which week
-- ---------------------------------------------------------------------------
--
-- The unique constraint is the idempotency. A cron that fires twice, a retry
-- after a partial failure, or a manual run on the same week must not put two
-- copies of the same email in somebody's inbox -- so the week is part of the
-- key and a second attempt sees the first.
--
-- `mode` is in the key as well, and on purpose: the owner's review copy of a
-- week and the user's own copy of that same week are two different sends, and
-- having reviewed one must not block the other from going out later.
create table if not exists public.weekly_digest_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The Monday of the trading week the email covers.
  week_start date not null,
  mode text not null check (mode in ('owner', 'user')),
  recipient text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  -- Why it did not go, in the words the provider or the code used. Kept so a
  -- silent non-delivery is impossible to mistake for a quiet week.
  detail text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start, mode)
);

create index if not exists weekly_digest_sends_week_idx
  on public.weekly_digest_sends (week_start desc, created_at desc);

alter table public.weekly_digest_sends enable row level security;
revoke all on public.weekly_digest_sends from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
--
-- Three states, and the closed one is the default, like every other switch in
-- app_settings:
--
--   "off"    nothing is sent at all
--   "owner"  every user's email is built and sent to the owner for review,
--            stamped as a review copy. NOBODY ELSE RECEIVES ANYTHING.
--   "users"  each person receives their own, opt-outs honoured
--
-- A missing row, a failed read or a database restored without this seed all
-- read as "owner" -- which cannot mail a customer.
insert into public.app_settings (key, value)
values ('weekly_digest_delivery', '"owner"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
create or replace function public.trigger_weekly_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'weekly_digest: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/weeklyDigest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.trigger_weekly_digest() from public, anon, authenticated;

-- Saturday 13:00 UTC — 9am ET, the morning after the week closes, when the
-- figures are final and nobody is mid-trade. Not Friday evening: Friday's own
-- closing bars are not all in, and a summary that arrives before the week is
-- valued is a summary of four days.
select cron.schedule(
  'weekly-digest',
  '0 13 * * 6',
  $$select public.trigger_weekly_digest();$$
);
