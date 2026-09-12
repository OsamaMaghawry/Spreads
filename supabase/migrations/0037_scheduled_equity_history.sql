-- The daily portfolio series rebuilds itself, for every connected account.
--
-- The owner, on being shown that five of eight accounts had trade records and
-- no stored day-by-day history: *"I said multiple times, everything should be
-- updated from our side always. If something is not, it's our issue."*
--
-- He had said it before. Migration 0033 quotes him — *"Everything should be
-- synced automatically whether the user opened the account or not. It's a
-- trading account. It should be always updated as long as it is connected."* —
-- and put TRADE RECORDS on a cron. The daily equity series was left on
-- pull-when-you-look: `equityHistory` built it the first time somebody opened
-- Analysis for that account, and never otherwise.
--
-- So the same defect survived in the other half of the same screen. The
-- symptom this time was the weekly email having nothing to report for a user
-- with 128 trades, because nobody had ever opened his account's history. That
-- is ours to fix, not something to explain to him in the email.
create or replace function public.trigger_equity_history(p_max_age_minutes integer default 0)
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
    raise notice 'equity_history: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/equityHistory',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    -- `scheduled` selects the all-accounts path, which the function gates on
    -- the service-role key rather than on merely being signed in.
    body := jsonb_build_object('scheduled', true, 'maxAgeMinutes', p_max_age_minutes)
  );
end;
$$;

revoke all on function public.trigger_equity_history(integer) from public, anon, authenticated;

-- TWO JOBS, for two different reasons.
--
-- The weekday run is the product's own promise: a connected account's history
-- is current every trading day whether or not anyone looked. 21:30 UTC is
-- after the 20:00 close and late enough for the day's closing bars to have
-- settled — earlier and the last point of every series is a partial day.
select cron.schedule(
  'equity-history-daily',
  '30 21 * * 1-5',
  $$select public.trigger_equity_history(0);$$
);

-- The Saturday run exists so the weekly email at 13:00 cannot read a stale
-- series. An hour is ample for a sequential rebuild of every account, and a
-- failure here costs a refresh rather than the email: the digest reads what is
-- stored either way.
select cron.schedule(
  'equity-history-preweekly',
  '0 12 * * 6',
  $$select public.trigger_equity_history(0);$$
);
