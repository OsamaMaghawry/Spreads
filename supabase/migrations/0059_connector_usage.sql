-- Who uses the AI connector, and how.
--
-- The owner, 9 Oct: "How do I know how many users using the MCP for Claude?
-- ... if someone is using it right now, if I can have some statistics."
-- Until now the answer was nowhere: who connected lived in Supabase Auth's
-- own tables, and what they asked went to the function's log, which Supabase
-- keeps for days, not months.
--
-- connector_calls is one row per tool call the mcp function answers. The
-- function writes it with the service role; no client role can read or write
-- it (RLS on, no policies), and the connector's own token is refused too
-- (the three connector_no_* policies every RLS table carries, migration
-- 0058). Kept 90 days by the daily job at the end of this file.
--
-- client_id is the OAuth client the token was issued to, as text: it joins to
-- auth.oauth_clients.id, whose client_name is how Claude, ChatGPT or Grok name
-- themselves when they register. A new assistant shows up under its own name
-- with nothing to change here.

create table public.connector_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text,
  tool text not null,
  ok boolean not null,
  ms integer,
  -- The filters and tickers asked for, so the admin can see what people use
  -- it for. Capped in the function; never credentials.
  args jsonb
);

create index connector_calls_at_idx on public.connector_calls (at desc);
create index connector_calls_user_idx on public.connector_calls (user_id, at desc);

alter table public.connector_calls enable row level security;

create policy connector_no_insert on public.connector_calls as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.connector_calls as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.connector_calls as restrictive for delete to authenticated
  using (not public.is_connector_session());

-- Everything the Admin "AI connector" tab shows, in one call. Security
-- definer because it reads auth.oauth_consents and auth.oauth_clients, which
-- no API role can see; executable by the service role only (adminData, after
-- its own admin check).
create or replace function public.connector_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with consents as (
    select s.user_id, s.client_id::text as client_id, coalesce(c.client_name, 'Unknown app') as app,
           s.granted_at, s.revoked_at
    from auth.oauth_consents s
    left join auth.oauth_clients c on c.id = s.client_id
  ),
  calls as (
    select k.*, coalesce(c.client_name, 'Unknown app') as app
    from public.connector_calls k
    left join auth.oauth_clients c on c.id::text = k.client_id
    where k.at > now() - interval '30 days'
  ),
  people as (
    select u.id, u.email,
      (select string_agg(distinct x.app, ', ') from consents x where x.user_id = u.id and x.revoked_at is null) as apps,
      (select min(x.granted_at) from consents x where x.user_id = u.id) as connected_at,
      (select bool_and(x.revoked_at is not null) from consents x where x.user_id = u.id) as disconnected,
      (select max(k.at) from public.connector_calls k where k.user_id = u.id) as last_used,
      (select count(*) from calls k where k.user_id = u.id) as calls_30d
    from auth.users u
    where exists (select 1 from consents x where x.user_id = u.id)
       or exists (select 1 from public.connector_calls k where k.user_id = u.id)
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'connected', (select count(distinct user_id) from consents where revoked_at is null),
    'disconnected', (select count(*) from people where disconnected),
    'inUseNow', (select count(distinct user_id) from public.connector_calls where at > now() - interval '5 minutes'),
    'active1d', (select count(distinct user_id) from calls where at > now() - interval '1 day'),
    'active7d', (select count(distinct user_id) from calls where at > now() - interval '7 days'),
    'active30d', (select count(distinct user_id) from calls),
    'calls30d', (select count(*) from calls),
    'errors30d', (select count(*) from calls where not ok),
    'apps', (select coalesce(jsonb_agg(jsonb_build_object('app', a.app, 'connected', a.connected, 'disconnected', a.gone, 'calls30d', a.n) order by a.connected desc, a.app), '[]'::jsonb)
             from (select app,
                          count(distinct user_id) filter (where revoked_at is null) as connected,
                          count(distinct user_id) filter (where revoked_at is not null) as gone,
                          (select count(*) from calls k where k.app = c.app) as n
                   from consents c group by app) a),
    'tools', (select coalesce(jsonb_agg(jsonb_build_object('tool', t.tool, 'calls', t.n, 'errors', t.e) order by t.n desc), '[]'::jsonb)
              from (select tool, count(*) as n, count(*) filter (where not ok) as e from calls group by tool) t),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'calls', d.n, 'people', d.p) order by d.day), '[]'::jsonb)
             from (select (at at time zone 'UTC')::date as day, count(*) as n, count(distinct user_id) as p from calls group by 1) d),
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
                 'email', p.email, 'apps', p.apps, 'connectedAt', p.connected_at, 'disconnected', coalesce(p.disconnected, false),
                 'lastUsed', p.last_used, 'calls30d', p.calls_30d) order by p.last_used desc nulls last, p.connected_at desc), '[]'::jsonb)
               from (select * from people limit 500) p)
  );
$$;

revoke all on function public.connector_stats() from public, anon, authenticated;
grant execute on function public.connector_stats() to service_role;

-- 90 days of calls, deleted daily. Enough for a monthly view with a margin;
-- who connected stays in Supabase Auth regardless.
select cron.unschedule('connector-calls-retention') where exists (
  select 1 from cron.job where jobname = 'connector-calls-retention'
);
select cron.schedule(
  'connector-calls-retention',
  '17 4 * * *',
  $cron$ delete from public.connector_calls where at < now() - interval '90 days'; $cron$
);
