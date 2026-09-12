-- A way to REPAIR the stored daily series, separate from the schedule that
-- maintains it.
--
-- WHY THIS IS NOT A PARAMETER ON `trigger_equity_history`. That function is
-- what the two cron jobs call, and its argument has a default, so adding a
-- second defaulted argument would make `trigger_equity_history(0)` ambiguous
-- and break both jobs at their next firing. A repair is also not a schedule:
-- it runs when someone has found a defect in how the stored rows were
-- computed, it may need to reach one named account, and it may need to reach
-- LIVE accounts that PAPER_ONLY keeps every scheduled job away from.
--
-- That last part is the reason this exists at all. `equityHistory`'s
-- single-account path does not consult PAPER_ONLY -- opening the Analysis page
-- on a live account builds and stores its whole series -- while `rebuildAll`
-- does. So live accounts carry stored rows that no scheduled run can ever
-- correct. On 12 September 2026 a defect was found in the option half of every
-- one of those rows (`options_open` was built from the positions open at the
-- moment of the rebuild and applied to years of history), and "we only write
-- live rows by accident, so we cannot correct them" was not a defensible place
-- to stand.
--
-- `p_include_live` is off by default, so nothing about what the product stores
-- on a schedule changes. Revoked from every client role, as its siblings are:
-- this names accounts and reaches a broker.
create or replace function public.rebuild_equity_history(
  p_include_live boolean default false,
  p_account_id text default null
)
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
    body := jsonb_build_object(
      'scheduled', true,
      -- Zero: a repair rebuilds every account it reaches whatever its freshness
      -- stamp says. A stale-aware repair would skip exactly the accounts that
      -- were rebuilt most recently with the defect in place.
      'maxAgeMinutes', 0,
      'includeLive', p_include_live,
      'accountId', p_account_id,
      'ticket', public.mint_cron_ticket('equity_history')
    )
  );
end;
$$;

revoke all on function public.rebuild_equity_history(boolean, text) from public, anon, authenticated;
