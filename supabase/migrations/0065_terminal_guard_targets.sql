-- Take profits outside regular hours, as stops (0064).
--
-- The owner, 27 Oct 2026, AIOK on two paper accounts before the open: "Orders
-- for TP and SL still don't get executed". Alpaca works a take profit, like a
-- stop, from 9:30 only. The terminal's guard now fires a take profit too when
-- a trade reaches it outside those hours: `kind` says which exit fired, and a
-- take profit placed on its own has no stop price.
alter table public.terminal_stop_fires alter column stop_price drop not null;
alter table public.terminal_stop_fires add column if not exists kind text not null default 'stop';
alter table public.terminal_stop_fires drop constraint if exists terminal_stop_fires_kind_check;
alter table public.terminal_stop_fires add constraint terminal_stop_fires_kind_check check (kind in ('stop', 'target'));
