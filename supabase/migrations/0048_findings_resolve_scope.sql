-- Two writers, one findings table, and neither may close the other's findings.
--
-- `record_integrity_findings` resolves anything for the account that the pass
-- did not report. That was right while `tradeSync` was the only caller. The
-- daily equity rebuild is now a second one -- it raises `empty_option_book`
-- and `equity_divergence` from `equityHistory` -- and with the resolve half
-- unscoped the two would close each other's findings on every run: the trade
-- sync would resolve a live divergence it knows nothing about, and the rebuild
-- would resolve an impossible-result withholding whose flag is still on a
-- stored row.
--
-- A finding that resolves itself while the condition still holds is worse than
-- one that never resolves, because the audit trail then reads as clean.
--
-- So the resolve half takes the codes the pass is RESPONSIBLE for. Null keeps
-- the old behaviour -- resolve across every code -- so a caller that has not
-- been taught to name its codes is unchanged.
--
-- THE OLD SIGNATURE IS DROPPED, not left beside the new one. Adding a fifth
-- argument with a default creates an OVERLOAD, and every existing four-argument
-- call then matches both candidates and fails with "function is not unique" --
-- which would take the trade sync's whole findings path down at its next run.
drop function if exists public.record_integrity_findings(uuid, uuid, jsonb, boolean);
-- AND 0042's original three-argument form, which 0044 left behind: it used
-- `create or replace` with a NEW argument count, which creates an overload
-- rather than replacing. Nothing calls it, but it is already ambiguous against
-- 0044's defaults and would be ambiguous against these -- a latent
-- "function is not unique" waiting for the first caller who omits an argument.
drop function if exists public.record_integrity_findings(uuid, uuid, jsonb);

create or replace function public.record_integrity_findings(
  p_account_id uuid,
  p_user_id uuid,
  p_findings jsonb,
  p_resolve_missing boolean default true,
  p_codes text[] default null,
  p_exclude_codes text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.integrity_findings
    (account_id, user_id, code, subject, severity, action, message, detail)
  select
    p_account_id, p_user_id,
    f->>'code', f->>'subject', f->>'severity', f->>'action', f->>'message',
    coalesce(f->'detail', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) as f
  on conflict (account_id, code, subject) do update set
    severity = excluded.severity,
    action = excluded.action,
    message = excluded.message,
    detail = excluded.detail,
    last_seen_at = now(),
    seen_count = public.integrity_findings.seen_count + 1,
    resolved_at = null;

  if not p_resolve_missing then
    return;
  end if;

  update public.integrity_findings af
     set resolved_at = now()
   where af.account_id = p_account_id
     and af.resolved_at is null
     -- Only the codes this pass owns. A pass either NAMES them (the equity
     -- rebuild, which raises two) or EXCLUDES the ones it does not own (the
     -- trade sync, which raises many and gains more over time -- an exclusion
     -- keeps a newly added finding resolving itself without anyone having to
     -- remember a list). Both null keeps the old behaviour.
     and (p_codes is null or af.code = any(p_codes))
     and (p_exclude_codes is null or not (af.code = any(p_exclude_codes)))
     and not exists (
       select 1
       from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) as f
       where f->>'code' = af.code and f->>'subject' = af.subject
     );
end;
$$;

revoke all on function public.record_integrity_findings(uuid, uuid, jsonb, boolean, text[], text[])
  from public, anon, authenticated;
