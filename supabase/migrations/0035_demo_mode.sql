-- Demo mode: paper accounts only, no live order entry, no prices on the site.
--
-- Seeded TRUE, and `readSettings` reads a missing row as true too, so the
-- product is in demo unless somebody has deliberately turned it off. Every
-- other switch in app_settings defaults to off because off is the safe answer
-- there; here the restrictive answer is on, and the two defaults are opposite
-- for the same reason.
--
-- Reversible from the Admin settings panel in one click -- it is a row, not a
-- deploy.
insert into app_settings (key, value, updated_at)
values ('demo_mode', 'true'::jsonb, now())
on conflict (key) do nothing;
