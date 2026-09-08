-- The feed dump captures activities and nothing else, so when a trader says
-- "the broker shows this position and the app does not", there is no record of
-- what the broker actually returned and the question cannot be settled after
-- the fact. Open positions are never stored anywhere: the dashboard fetches
-- them live on every load and throws them away.
--
-- Reported on a live account holding TSLA options opened outside DeltaMint,
-- which the Positions Monitor did not show. Nothing in the system could say
-- whether the broker sent them, so the same three columns activities already
-- have are added for positions and for the orders that sit beside them.
alter table public.broker_feed_dumps
  add column if not exists positions jsonb,
  add column if not exists position_count integer,
  add column if not exists open_orders jsonb;

comment on column public.broker_feed_dumps.positions is
  'Raw GET /v2/positions payload at capture time. The dashboard never stores this, so it is the only record of what the broker reported holding.';
comment on column public.broker_feed_dumps.open_orders is
  'Raw open orders at capture time — a leg held by a working order is a common reason a position reads differently than expected.';
