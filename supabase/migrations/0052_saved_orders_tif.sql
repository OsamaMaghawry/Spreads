-- A parked GTC order came back as a day order.
--
-- `saved_orders` stored no time in force, so `OpenPositionDialog` reseeded its
-- own default when the ticket was reopened. A trader who deliberately set
-- "good til canceled" -- the natural choice for an order they are parking --
-- got "day" back. Nothing warned them; the field simply was not carried.
--
-- Nullable with no default on purpose: a row written before this column
-- existed has no answer, and "day" asserted on it would be a guess presented
-- as the trader's own choice. The ticket falls back to the dialog's default
-- and says nothing, which is the honest version of not knowing.
alter table public.saved_orders
  add column if not exists time_in_force text
  check (time_in_force is null or time_in_force in ('day', 'gtc'));

comment on column public.saved_orders.time_in_force is
  'The trader''s own choice when they parked it. Null on rows saved before this column existed -- the ticket then uses its default rather than inventing one.';
