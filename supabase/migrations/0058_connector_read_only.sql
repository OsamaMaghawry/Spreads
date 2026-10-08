-- The Claude connector reads. It never writes -- not even straight to the database.
--
-- The connector signs in through Supabase Auth's OAuth 2.1 server, and the
-- token it is given is an ordinary signed-in user's token with one extra claim,
-- `client_id`, naming the app the user approved. The edge functions refuse
-- those tokens (see supabase/functions/_shared/connectorToken.ts). But a token
-- also opens the REST API to every table its user can reach, and on this
-- schema a signed-in user can delete their own trading_accounts row (which
-- disconnects their broker), and insert, change or delete trade_records,
-- stock_lots and saved_orders.
--
-- So every table gets three RESTRICTIVE policies: no insert, update or delete
-- while the request carries a client_id. Restrictive policies are ANDed with
-- the permissive ones, so nothing a person signed in to DeltaMint can do
-- changes; the app holding a connector token simply cannot write. Reads are
-- untouched: they are the user's own rows, which the user approved sharing.
--
-- Written out table by table, every table in public with row-level security.
-- No `drop policy if exists` guards: the policies are new, and on Supabase's
-- SQL endpoint a DROP ... IF EXISTS of a policy that is not there stalled the
-- whole request until it timed out (8 October, applying this file to staging).
-- A table added later is not covered by this file: its own migration must add
-- the same three policies. connectorToken.test.ts fails the build until it
-- does, and docs/product/connector.md has the query that lists any table the
-- database holds without them.

create or replace function public.is_connector_session()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'client_id', ''), '') <> ''
$$;

comment on function public.is_connector_session() is
  'True when the request''s token was issued to a third-party app through the OAuth server (it carries client_id). Used by the restrictive connector_no_* policies.';

create policy connector_no_insert on public.account_equity_daily as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.account_equity_daily as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.account_equity_daily as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.alerts as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.alerts as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.alerts as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.app_settings as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.app_settings as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.app_settings as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.blog_posts as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.blog_posts as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.blog_posts as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.broker_connection_issues as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.broker_connection_issues as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.broker_connection_issues as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.broker_feed_dumps as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.broker_feed_dumps as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.broker_feed_dumps as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.broker_probes as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.broker_probes as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.broker_probes as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.cash_flows as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.cash_flows as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.cash_flows as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.cron_tickets as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.cron_tickets as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.cron_tickets as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.digest_sends as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.digest_sends as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.digest_sends as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.earnings_calendar as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.earnings_calendar as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.earnings_calendar as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.growth_metrics as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.growth_metrics as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.growth_metrics as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.history_snapshots as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.history_snapshots as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.history_snapshots as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.integrity_findings as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.integrity_findings as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.integrity_findings as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.order_attempts as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.order_attempts as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.order_attempts as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.profiles as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.profiles as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.profiles as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.saved_orders as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.saved_orders as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.saved_orders as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.scan_last_used as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.scan_last_used as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.scan_last_used as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.scan_presets as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.scan_presets as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.scan_presets as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.snaptrade_probes as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.snaptrade_probes as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.snaptrade_probes as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.snaptrade_users as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.snaptrade_users as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.snaptrade_users as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.stock_lots as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.stock_lots as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.stock_lots as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.subscriptions as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.subscriptions as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.subscriptions as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.trade_records as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.trade_records as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.trade_records as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.trade_records_backup as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.trade_records_backup as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.trade_records_backup as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.trading_accounts as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.trading_accounts as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.trading_accounts as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.user_crm as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.user_crm as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.user_crm as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.user_notes as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.user_notes as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.user_notes as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.watch_settings as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.watch_settings as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.watch_settings as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.weekly_digest_sends as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.weekly_digest_sends as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.weekly_digest_sends as restrictive for delete to authenticated
  using (not public.is_connector_session());
