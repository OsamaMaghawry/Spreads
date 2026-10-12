-- The market emails: a brief before the bell, and intraday alerts on what a
-- user holds. See supabase/functions/marketMail/index.ts.
--
-- Delivery starts at "owner": the owner reviews the writing, the news and the
-- design on real mornings before any user receives one. The same three-state
-- switch as the weekly digest: "off", "owner" or "users".

insert into public.app_settings (key, value)
values ('market_mail_delivery', '"owner"'::jsonb)
on conflict (key) do nothing;

-- One row per New York trading day. The brief is built in steps -- research,
-- the market section, then one email per reader -- and each step is stored as
-- it finishes, so a run the runtime stops halfway is resumed by the next one
-- instead of being started again or lost. `locked_until` keeps two runs from
-- building the same morning at once.
create table if not exists public.market_mail_runs (
  day date primary key,
  research text,
  research_urls text[],
  research_at timestamptz,
  market jsonb,
  market_at timestamptz,
  locked_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Every email sent, so none is sent twice: one brief per reader per day, one
-- alert per reader per headline, one big-move alert per reader per stock per
-- day. Previews are logged too, under their own kind, and never block a real
-- send.
create table if not exists public.market_mail_log (
  id bigserial primary key,
  kind text not null check (kind in ('brief', 'news', 'move', 'preview')),
  user_id uuid not null references auth.users (id) on delete cascade,
  ref text not null,
  symbol text,
  subject text,
  sent_at timestamptz not null default now(),
  unique (kind, user_id, ref)
);
create index if not exists market_mail_log_user_day_idx on public.market_mail_log (user_id, sent_at);

-- Headlines already judged during the session, so each is sent to the model
-- once however many runs see it.
create table if not exists public.market_news_seen (
  news_id bigint primary key,
  symbol text,
  major boolean not null default false,
  title text,
  what text,
  seen_at timestamptz not null default now()
);

alter table public.market_mail_runs enable row level security;
alter table public.market_mail_log enable row level security;
alter table public.market_news_seen enable row level security;
revoke all on public.market_mail_runs, public.market_mail_log, public.market_news_seen from anon, authenticated;

-- The same three refusals 0058 gives every RLS table, so a connector token can
-- never write here even if a grant is added later.
create policy connector_no_insert on public.market_mail_runs as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.market_mail_runs as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.market_mail_runs as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.market_mail_log as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.market_mail_log as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.market_mail_log as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.market_news_seen as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.market_news_seen as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.market_news_seen as restrictive for delete to authenticated
  using (not public.is_connector_session());

create or replace function public.trigger_market_mail(p_mode text)
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
    raise notice 'market_mail: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/marketMail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('mode', p_mode, 'ticket', public.mint_cron_ticket('market_mail')),
    -- The brief's research and writing take minutes; pg_net only needs to
    -- hand the request over, the function finishes in the background.
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.trigger_market_mail(text) from public, anon, authenticated;

-- Every 15 minutes across the hours that contain 8:40 to 9:25 New York time in
-- both daylight-saving states; the function itself decides whether it is the
-- moment, so the UTC schedule never needs changing in March or November.
select cron.schedule('market-brief', '*/15 12-14 * * 1-5', $$select public.trigger_market_mail('brief');$$)
where not exists (select 1 from cron.job where jobname = 'market-brief');

-- Every 15 minutes across the hours that contain the session in both states;
-- the function asks Alpaca's clock whether the market is open.
select cron.schedule('market-alerts', '*/15 13-21 * * 1-5', $$select public.trigger_market_mail('alerts');$$)
where not exists (select 1 from cron.job where jobname = 'market-alerts');
