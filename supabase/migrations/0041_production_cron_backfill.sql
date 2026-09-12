-- The schedules the earlier production migrations never created.
--
-- The owner, twice: *"Everything should be synced automatically whether the
-- user opened the account or not. It's a trading account. It should be always
-- updated as long as it is connected."* And: *"I said multiple times,
-- everything should be updated from our side always. If something is not,
-- it's our issue."*
--
-- It was our issue. Production carried the trigger FUNCTIONS from migrations
-- 0033, 0036 and 0037 but only two of the five jobs that call them, and the
-- two it had -- the trade sync -- were inactive. So on production nothing
-- rebuilt a series, nothing sent a digest, and trade records only moved when
-- somebody opened a page. That is why account_equity_daily was empty and the
-- first weekly email was a page of dashes: not a defect in the digest, an
-- absent scheduler underneath it.
--
-- Why a separate migration rather than a fix to 0033/0036/0037: those three
-- are already recorded as applied on production, so editing them would change
-- history without changing the database. This states the repair as its own
-- step, and is a no-op everywhere the jobs already exist.
--
-- Schedules and their reasons are taken unchanged from the migrations that
-- define them; this only creates what is missing and switches on what was off.

-- 0037: a connected account's history is current every trading day whether or
-- not anyone looked. 21:30 UTC is after the 20:00 close and late enough for
-- the day's closing bars to have settled.
select cron.schedule(
  'equity-history-daily',
  '30 21 * * 1-5',
  $$select public.trigger_equity_history(0);$$
) where not exists (select 1 from cron.job where jobname = 'equity-history-daily');

-- 0037: so the weekly email at 13:00 cannot read a stale series.
select cron.schedule(
  'equity-history-preweekly',
  '0 12 * * 6',
  $$select public.trigger_equity_history(0);$$
) where not exists (select 1 from cron.job where jobname = 'equity-history-preweekly');

-- 0036: Saturday 13:00 UTC -- 9am ET, the morning after the week closes, when
-- the figures are final and nobody is mid-trade.
select cron.schedule(
  'weekly-digest',
  '0 13 * * 6',
  $$select public.trigger_weekly_digest();$$
) where not exists (select 1 from cron.job where jobname = 'weekly-digest');

-- 0033's two jobs exist on production but were left inactive, which from a
-- reader's point of view is the same as not existing. Through `cron.alter_job`
-- rather than an UPDATE on cron.job, which the migration role cannot write
-- directly. `paper_only` is on, so neither job touches a live account.
select cron.alter_job(jobid, active := true)
from cron.job
where jobname in ('trade-sync-session', 'trade-sync-daily') and not active;
