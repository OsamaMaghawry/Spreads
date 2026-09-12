-- Live accounts are not touched while the product runs on paper.
--
-- The owner: *"Differentiate between production as an environment and the
-- live account. I don't want live accounts. I want the paper accounts inside
-- the production."*
--
-- He is right that these were being conflated, including by me. Production is
-- the ENVIRONMENT -- the real database, the real users, deltamint.app. Live is
-- what kind of money a connected brokerage account holds. A PAPER account
-- inside PRODUCTION is the ordinary, wanted case, and it is what the product
-- runs on until the broker approves live trading.
--
-- `demo_mode` already stops a new ORDER reaching a live account. It never
-- stopped us SYNCING one, storing its trades, watching it, or emailing its
-- results -- so on production a real-money account's history was being written
-- and mailed while the product was nominally a demo. Four of the eight
-- accounts on production are live, and one of them carries 128 real trades.
--
-- While this is on, a live account stays connected, stays visible on the
-- dashboard, and can always be closed out of. What it is excluded from is
-- everything that reads it on a schedule or stores it: syncTrades,
-- equityHistory, positionWatch and weeklyDigest.
--
-- Seeded ON, like demo_mode and for the same reason: the restrictive answer is
-- the safe one, so a missing row or a database restored without this seed
-- leaves the product not touching real money.
insert into public.app_settings (key, value)
values ('paper_only', 'true'::jsonb)
on conflict (key) do nothing;
