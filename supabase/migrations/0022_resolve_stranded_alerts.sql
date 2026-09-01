-- Close out the alerts stranded by the dated-resolution bug.
--
-- reconcile() resolved only alerts whose dedupe_key ended in the CURRENT day,
-- so a condition raised on one day and no longer true on the next was never
-- resolved, while that day's run wrote a fresh row under a new key. The open
-- set grew by every standing condition every weekday and the daily report read
-- all of it back — which is how one account's report reached thirteen rows of
-- the same warning.
--
-- The code fix (match on rule + symbol, not the dated key) stops it recurring.
-- This clears what the bug already left behind: anything last seen before today
-- is, by definition, something a later run did not re-raise.
update public.alerts
   set resolved_at = now()
 where resolved_at is null
   and last_seen_at < date_trunc('day', now());
