-- Drop the hourly position watch.
--
-- The owner's instruction: watch every 15 minutes *during* the session, and
-- send one report after the session ends — nothing hourly, overnight or at the
-- weekend. The 15-minute session job and the once-after-close daily report stay;
-- only the standing hourly job goes.
--
-- unschedule is a no-op-safe delete: if the job is already gone (a fresh env
-- that never had it) this raises, so guard it.
do $$
begin
  perform cron.unschedule('position-watch-hourly');
exception when others then
  raise notice 'position-watch-hourly not scheduled; nothing to unschedule';
end $$;
