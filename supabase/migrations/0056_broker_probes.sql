-- What a broker's API actually answered, kept.
--
-- `snaptrade_probes` (0055) was built for one vendor and immediately proved
-- its worth: their documented routes answered 410, their own partner endpoint
-- contradicted it, and having the runs on record is what turned an argument
-- into a support ticket with evidence in it.
--
-- Tradier is the second broker to be evaluated and will not be the last, so
-- this is the same idea without the vendor's name baked into the table. The
-- SnapTrade table is left exactly as it is: it holds real runs, and renaming
-- a table to tidy a pattern is how a record gets lost.

create table if not exists public.broker_probes (
  id uuid primary key default gen_random_uuid(),
  -- 'tradier', 'snaptrade', whoever is next. Not an enum: a new broker to
  -- evaluate should not need a migration before it can be evaluated.
  broker text not null,
  ran_at timestamptz not null default now(),
  -- Every call, its status, its latency and a bounded, redacted sample of the
  -- answer. Never a credential.
  report jsonb not null
);

create index if not exists broker_probes_broker_ran_at_idx
  on public.broker_probes (broker, ran_at desc);

alter table public.broker_probes enable row level security;
-- No policies: nothing client-side reads this. Every read goes through an
-- edge function holding the service role.
revoke all on public.broker_probes from anon, authenticated;
