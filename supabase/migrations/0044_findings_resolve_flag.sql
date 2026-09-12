-- A frozen pass must not resolve findings it did not act on.
--
-- `record_integrity_findings` resolves anything for the account the pass did
-- NOT produce -- which is right for an ordinary pass and wrong for a frozen
-- one. When writes are held the row-level withholdings never land, so the
-- flags already on the stored rows are untouched; resolving their findings
-- would close the trail on a withholding that is still in force, and the money
-- would stay off every total with the audit saying it had been fixed. It errs
-- against the user and it errs silently.
--
-- So the resolve half becomes opt-out. The default is unchanged, which keeps
-- every existing caller correct.
create or replace function public.record_integrity_findings(
  p_account_id uuid,
  p_user_id uuid,
  p_findings jsonb,
  p_resolve_missing boolean default true
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
     and not exists (
       select 1
       from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) as f
       where f->>'code' = af.code and f->>'subject' = af.subject
     );
end;
$$;

revoke all on function public.record_integrity_findings(uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
