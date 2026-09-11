-- One writer for account_equity_daily, with the never-null rule in SQL.
--
-- WHY THIS IS A FUNCTION AND NOT AN UPSERT FROM THE CLIENT.
--
-- The bench's second blocker: a caught broker error wrote NULL over `equity`,
-- `profit_loss` and `base_value` for every day back to the account's first
-- trade. The next successful pull only reaches back a year, and Alpaca will not
-- serve the rest again — so an ordinary page load, every thirty minutes, could
-- permanently destroy primary broker-reported facts of which this table is the
-- only copy.
--
-- The first fix was two upserts from the edge function: the derived columns for
-- every day, the broker columns only for days the broker actually reported. It
-- rests on PostgREST generating `ON CONFLICT DO UPDATE SET` for exactly the
-- keys present in the payload and leaving the rest alone. That is the
-- documented behaviour, and it is very probably right — but "very probably
-- right" is not a standard to hold a data-destruction path to, and it puts the
-- guarantee in a library's request encoding rather than in the database.
--
-- So the rule lives here, in SQL that says it outright:
--
--   BROKER-REPORTED COLUMNS use coalesce(excluded, existing). A null arriving
--   for them means "I could not read it", never "it is nothing", so a stored
--   value survives every failed fetch. These are primary facts, and nothing
--   rewrites a user's history unasked.
--
--   DERIVED COLUMNS are overwritten unconditionally. They are a recomputation
--   from records the user can inspect, and keeping superseded arithmetic would
--   be the worse failure — a lot's disposal price or a trade's reconstruction
--   can change after the fact, and a stored series that kept the old answer
--   would disagree with the account for the rest of its life.
--
-- The distinction is the whole point: recomputing our own arithmetic needs
-- nobody's permission; overwriting what the broker said does.
create or replace function public.upsert_account_equity_daily(p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  insert into public.account_equity_daily as t (
    account_id, user_id, day,
    equity, profit_loss, base_value,
    premium_cum, shares_booked, shares_open, shares_cost, shares_value,
    options_open, performance, unpriced, source, captured_at
  )
  select
    (r->>'account_id')::uuid,
    (r->>'user_id')::uuid,
    (r->>'day')::date,
    (r->>'equity')::numeric,
    (r->>'profit_loss')::numeric,
    (r->>'base_value')::numeric,
    (r->>'premium_cum')::numeric,
    (r->>'shares_booked')::numeric,
    (r->>'shares_open')::numeric,
    (r->>'shares_cost')::numeric,
    (r->>'shares_value')::numeric,
    (r->>'options_open')::numeric,
    (r->>'performance')::numeric,
    -- An absent key gives NULL, and jsonb_array_elements_text(NULL) yields no
    -- rows, so array_agg returns NULL — coalesced to an empty array rather than
    -- stored as null, because "nothing was unpriced" is a statement the screen
    -- needs to be able to read.
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(r->'unpriced') x),
      '{}'::text[]
    ),
    coalesce(r->>'source', 'reconstructed'),
    coalesce((r->>'captured_at')::timestamptz, now())
  from jsonb_array_elements(p_rows) r
  on conflict (account_id, day) do update set
    -- The broker's own figures: a null never lands on a stored value.
    equity      = coalesce(excluded.equity, t.equity),
    profit_loss = coalesce(excluded.profit_loss, t.profit_loss),
    base_value  = coalesce(excluded.base_value, t.base_value),
    -- Our recalculation: always the newest answer, nulls included. A null here
    -- means "this day could not be valued", which is a real result and has to
    -- be able to replace a previous number.
    premium_cum   = excluded.premium_cum,
    shares_booked = excluded.shares_booked,
    shares_open   = excluded.shares_open,
    shares_cost   = excluded.shares_cost,
    shares_value  = excluded.shares_value,
    options_open  = excluded.options_open,
    performance   = excluded.performance,
    unpriced      = excluded.unpriced,
    source        = excluded.source,
    captured_at   = excluded.captured_at;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.upsert_account_equity_daily(jsonb) is
  'The only writer for account_equity_daily. Broker-reported columns are coalesced so a failed fetch never nulls a stored fact; derived columns are always rewritten.';

-- The equityHistory function calls this over the service role. No browser has
-- any business writing what an account was worth on a past day.
revoke all on function public.upsert_account_equity_daily(jsonb) from public, anon, authenticated;
