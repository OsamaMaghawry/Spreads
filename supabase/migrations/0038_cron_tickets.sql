-- Single-use tickets, so a scheduled job can prove it is one.
--
-- FOUND ON STAGING while verifying the equity rebuild added in 0037. The new
-- all-accounts endpoint refused its own cron with a 403, and it was right to:
-- the Vault row every scheduled job reads as `service_role_key` does not hold
-- the service-role key. Its JWT payload reads `"role":"anon"`. It is the ANON
-- key — public by design, shipped in the browser bundle.
--
-- So `trigger_trade_sync`, `trigger_position_watch`, `trigger_weekly_digest`
-- and `trigger_equity_history` have all been authenticating to their own edge
-- functions with a credential anybody can read off the front end. It worked
-- because `verify_jwt = true` only asks whether the bearer is a valid JWT, and
-- the anon key is one; the functions then did their work through the real
-- service key in their own environment. The bearer was never authorising
-- anything.
--
-- That is a live exposure, not a tidiness problem: `syncTrades` and
-- `positionWatch` accept an all-accounts job from any caller that clears
-- verify_jwt, and the key that clears it is published.
--
-- THE PROPER REPAIR IS THE OWNER'S: put the real service-role key in that
-- Vault row. It is a password and does not belong in a chat transcript, so it
-- is filed in docs/ops/queue.md rather than done here. This table is what lets
-- the jobs be correct in the meantime, and it needs no secret to change hands.
create table if not exists public.cron_tickets (
  token uuid primary key default gen_random_uuid(),
  purpose text not null,
  created_at timestamptz not null default now(),
  -- Short enough that an intercepted token is worthless before it can be used,
  -- long enough for a job that queues behind a slow request.
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz
);

create index if not exists cron_tickets_expiry_idx on public.cron_tickets (expires_at);

alter table public.cron_tickets enable row level security;
revoke all on public.cron_tickets from anon, authenticated;

-- Minting happens INSIDE the database, where only the scheduler and the
-- service role can reach it. A caller holding the anon key cannot mint one,
-- which is the whole point.
create or replace function public.mint_cron_ticket(p_purpose text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  -- Housekeeping in the same call rather than a job of its own: anything
  -- spent or long expired has no further use, and this table should never
  -- grow.
  delete from public.cron_tickets where expires_at < now() - interval '1 day';
  insert into public.cron_tickets (purpose) values (p_purpose) returning token into v_token;
  return v_token;
end;
$$;

revoke all on function public.mint_cron_ticket(text) from public, anon, authenticated;

-- The equity rebuild now carries one.
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
    -- The bearer is still sent because `verify_jwt` requires SOME valid JWT to
    -- reach the function at all. It is no longer what authorises the work; the
    -- ticket is.
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object(
      'scheduled', true,
      'maxAgeMinutes', p_max_age_minutes,
      'ticket', public.mint_cron_ticket('equity_history')
    )
  );
end;
$$;

revoke all on function public.trigger_equity_history(integer) from public, anon, authenticated;
