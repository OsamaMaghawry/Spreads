-- The audit trail, and the flag that keeps an untrusted figure off the screen.
--
-- The owner, on finding that one impossible XLY row had left a whole account
-- with no stored trades at all: *"I need to build a more robust way to check
-- this kind of errors... not to block the account. This doesn't work like
-- this. So create a framework to audit. To catch the mistakes, to catch the
-- errors, to catch anything. But at the same time, don't block everything."*
--
-- Two pieces, and the split matters.
--
--   trade_records.integrity_code   on the ROW, because every reader of
--                                  trade_records has to honour it. A reader
--                                  that must join another table to learn
--                                  whether a number can be trusted is a reader
--                                  that will one day forget to. Null means
--                                  clean; that is the whole predicate.
--
--   integrity_findings             the DURABLE record: what was found, when it
--                                  was first seen, when it was last seen, when
--                                  it stopped being true. A row-scoped flag
--                                  cannot answer "has this been happening for
--                                  three weeks", and that question is the
--                                  difference between an audit and a warning
--                                  light.

-- ---------------------------------------------------------------------------
-- The flag
-- ---------------------------------------------------------------------------

alter table public.trade_records
  add column if not exists integrity_code text,
  add column if not exists integrity_detail jsonb;

comment on column public.trade_records.integrity_code is
  'Null when this row''s figures are trustworthy. Non-null names the check that '
  'refused to stand behind them: the trade is still shown, its money is withheld '
  'from every total and statistic, and the screen says so.';

-- Most reads want the trustworthy rows; this keeps that cheap without making
-- the flagged ones harder to find.
create index if not exists trade_records_integrity_idx
  on public.trade_records (account_id)
  where integrity_code is not null;

-- ---------------------------------------------------------------------------
-- The trail
-- ---------------------------------------------------------------------------

create table if not exists public.integrity_findings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The KIND of problem, never prose: 'impossible_loss', 'mass_delete_held',
  -- 'orphaned_stock'. Half of the dedupe key.
  code text not null,
  -- What it is about: a trade_key for a row-scoped finding, or a name like
  -- 'trade records' for an account-scoped one. The other half.
  subject text not null,

  severity text not null check (severity in ('critical', 'warning', 'info')),
  -- The narrowest thing done about it. Deliberately no value that stops a
  -- sync: a defect in one row is not a reason to stop telling a trader what
  -- the other forty-two did.
  action text not null check (action in ('withhold_row', 'keep_deleted', 'note')),

  -- One sentence a person can act on, and the numbers behind it.
  message text not null,
  detail jsonb not null default '{}'::jsonb,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when a later run stops producing it. Findings RESOLVE THEMSELVES: the
  -- alternative is an operator marking things fixed by hand, which is how a
  -- board of stale warnings gets ignored.
  resolved_at timestamptz,
  -- Kept after resolution so "this came back" is visible rather than looking
  -- like a first occurrence.
  seen_count integer not null default 1,

  unique (account_id, code, subject)
);

comment on table public.integrity_findings is
  'What the audit pass found, per account. One row per (account, code, subject), '
  'updated in place: findings resolve themselves when a later run stops producing '
  'them, and seen_count survives resolution so a recurrence is visible as one.';

create index if not exists integrity_findings_open_idx
  on public.integrity_findings (account_id, severity)
  where resolved_at is null;

-- Service role only, like alerts and snapshots. These rows quote our own
-- arithmetic back at us; they are for the desk, not for the browser.
alter table public.integrity_findings enable row level security;
revoke all on public.integrity_findings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recording a pass
-- ---------------------------------------------------------------------------

-- One call per sync, carrying everything that pass found. Upserts what is
-- there, and resolves anything for this account that the pass did NOT find.
--
-- Both halves in one function, and in one statement each, because they have to
-- agree: a finding that is recorded but never resolved, or resolved by a pass
-- that failed before it finished, is worse than no audit at all.
create or replace function public.record_integrity_findings(
  p_account_id uuid,
  p_user_id uuid,
  p_findings jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[];
begin
  -- Upsert everything this pass found.
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
    -- A finding that had resolved and is back counts again, and reopens.
    seen_count = public.integrity_findings.seen_count + 1,
    resolved_at = null;

  -- Resolve what this pass did not find. The key is (code, subject) together:
  -- one impossible row being fixed must not resolve a different impossible row
  -- on the same account.
  select coalesce(array_agg(f->>'code' || E'' || (f->>'subject')), '{}')
    into v_codes
  from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) as f;

  update public.integrity_findings
     set resolved_at = now()
   where account_id = p_account_id
     and resolved_at is null
     and (code || E'' || subject) <> all (v_codes);
end;
$$;

revoke all on function public.record_integrity_findings(uuid, uuid, jsonb)
  from public, anon, authenticated;
