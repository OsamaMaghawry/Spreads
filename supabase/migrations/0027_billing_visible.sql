-- The switch that decides whether the payment surface exists at all.
--
-- Separate from billing_enforced, which 0025 seeds. That one says whether a
-- plan is REQUIRED to open a live position; this one says whether a plan can
-- be BOUGHT. They move at different times: this goes on when the broker
-- approves live trading, that goes on when we decide to start charging.
--
-- False, like every switch in this table: the closed value is the safe one,
-- and the code treats a missing row as off as well. While it is off the
-- Billing entry is not rendered, /billing says plans are not open, and
-- createCheckoutSession and billingPortal both refuse — see
-- supabase/functions/_shared/settings.ts and functions/publicConfig.
insert into public.app_settings (key, value)
values ('billing_visible', 'false'::jsonb)
on conflict (key) do nothing;
