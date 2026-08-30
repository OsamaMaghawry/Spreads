-- A row whose result is not final yet.
--
-- When a short option is assigned, the option closes and the record is
-- written as a completed trade: premium kept, dated to the assignment, and --
-- until the shares go -- a full winner. The shares it delivered are still
-- open. When they are eventually sold, their result is attributed back to
-- that same record, under that same close date, and a January win becomes a
-- January loss in April.
--
-- Everything derived from close dates moves with it: the equity curve, win
-- rate, profit factor, expectancy, streaks, best and worst day, the monthly
-- breakdown, and any date range that contained the trade. Nothing on the
-- screen said a closed row could still change, so the bias ran one way --
-- every assignment read as a winner until its shares were disposed of.
--
-- The premium genuinely was realised when the option closed, so the row
-- cannot simply be dated forward. What it can do is say it is not finished.
alter table public.trade_records
  add column if not exists provisional boolean not null default false;

-- Migration 0004 replaced the table-wide select grant with an explicit column
-- list, so a new column is unreadable by the browser until named here.
grant select (provisional) on public.trade_records to authenticated;

create index if not exists trade_records_provisional_idx
  on public.trade_records (account_id) where provisional;
