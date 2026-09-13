-- Let the weekly digest's scheduled run record whether it worked.
--
-- `trigger_weekly_digest` posts with pg_net's DEFAULT timeout, five seconds.
-- Building eight accounts' emails means eight broker round trips, so the run
-- takes far longer than that -- and pg_net gives up waiting long before the
-- function finishes. The function itself completes and the mail goes out; what
-- is lost is the ANSWER. Every scheduled firing lands in `net._http_response`
-- as a null `status_code` with `error_msg = 'Timeout of 5000 ms reached'` and
-- an empty body.
--
-- That was tolerable while the only recipient was the owner, who could tell a
-- run had worked by looking in his inbox. From today this runs unattended for
-- real users every Saturday, and "did this week's digest go out?" has to be
-- answerable from the database rather than from somebody's mail client.
-- `weekly_digest_sends` records the per-account outcome, but only for a run
-- that got far enough to write rows; a run that died early left a timeout and
-- nothing else, which is indistinguishable from a run that worked.
--
-- 120 seconds, matching what the manual invocations of this function have used
-- all along. Nothing about the function's own behaviour changes -- pg_net is
-- asynchronous either way and the cron job never blocks on it. The only
-- difference is that the reply is still being listened for when it arrives.
--
-- The sibling triggers (`trigger_equity_history`, `trigger_position_watch`,
-- `trigger_trade_sync`) carry the same default and the same blind spot. They
-- are left alone here deliberately: this migration ships alongside the switch
-- to real users and should change exactly the job that switch affects.
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
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.trigger_weekly_digest() from public, anon, authenticated;
