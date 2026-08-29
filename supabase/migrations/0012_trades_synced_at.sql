-- When this account's trade history was last rebuilt from the broker feed.
--
-- Trade history was the only screen that made syncing the user's job: two
-- buttons on one page and a third on another, while the dashboard and account
-- pages had been refreshing themselves every sixty seconds all along. The
-- reason was cost -- a sync is dozens of paged requests to Alpaca -- not
-- anything the user should have had to know.
--
-- With a timestamp to compare against, the page can serve what is stored
-- immediately and refresh itself only when that is old, which is what every
-- other screen already does.
alter table public.trading_accounts
  add column if not exists trades_synced_at timestamptz;
