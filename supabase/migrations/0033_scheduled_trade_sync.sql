-- Trade history syncs itself on a schedule, not when somebody opens a page.
--
-- The owner, 11 Sep: *"Everything should be synced automatically whether the
-- user opened the account or not. It's a trading account. It should be always
-- updated as long as it is connected."*
--
-- What existed was pull-when-you-look: `tradeHistory` refreshed its stored copy
-- when a person opened Trade History or Analysis and that copy was older than
-- fifteen minutes. Nothing else ever triggered a sync. The effect was visible
-- on the owner's own live account — staging, which gets opened, was current to
-- 10 Sep; production, which does not, had last synced 31 Aug. The same broker
-- account, twenty-four trades apart, and the only difference was who had
-- clicked.
--
-- Nothing was lost by that: the activity feed is the broker's and a sync
-- rebuilds the whole account from it. But "correct once you look at it" is not
-- a property a trading record should have, and the alerts already ran on a
-- schedule while the record of what was traded waited to be asked.
create or replace function public.trigger_trade_sync(p_max_age_minutes integer default 0)
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
    raise notice 'trade_sync: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/syncTrades',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('maxAgeMinutes', p_max_age_minutes)
  );
end;
$$;

revoke all on function public.trigger_trade_sync(integer) from public, anon, authenticated;

-- TWO JOBS, because two different things go stale.
--
--   Through the session and after the bell, hourly, skipping any account a
--   person has already refreshed in the last 50 minutes. `fetchBrokerData`
--   makes roughly a hundred requests per account, so re-pulling one that was
--   opened two minutes ago is broker traffic spent on nothing.
--
--   Once every morning, unconditionally. Assignments, exercises and expiries
--   settle overnight and over weekends — exactly the events that turn an open
--   wheel position into shares — and they land on days no hourly weekday job
--   is running. Zero max-age so this one never skips.
--
-- 13:00-22:00 UTC covers the 13:30-20:00 US session plus the two hours after
-- the close when fills settle. Mirrors position-watch-session's window.
select cron.unschedule('trade-sync-session') where exists (
  select 1 from cron.job where jobname = 'trade-sync-session'
);
select cron.unschedule('trade-sync-daily') where exists (
  select 1 from cron.job where jobname = 'trade-sync-daily'
);

select cron.schedule(
  'trade-sync-session',
  '0 13-22 * * 1-5',
  $cron$ select public.trigger_trade_sync(50); $cron$
);

select cron.schedule(
  'trade-sync-daily',
  '30 7 * * *',
  $cron$ select public.trigger_trade_sync(0); $cron$
);
