-- What a saved ticket showed, not just what it would send.
--
-- `legs` holds the wire payload -- symbol, side, ratio -- because that is what
-- openPosition wants and rebuilding it at send time is where a leg gets
-- dropped. It is exactly right for sending and useless for reading: it carries
-- no strike, no expiry, no delta, no credit and no max risk.
--
-- So reopening a saved ticket rendered a form with nothing in it. Strikes read
-- "—", both deltas read "Δ NaN", the expiry line read the word "Expiry" with no
-- date, and -- the part that matters -- max risk fell to null, which the ticket
-- prints as "No ceiling" above the sentence "Loss not bounded."
--
-- That sentence was not a judgement about the position. It was the absence of
-- one. A 2.50-wide NVDA put spread, whose loss is bounded at $250 a contract by
-- arithmetic no market can change, reopened reading "No ceiling" in the same
-- red as a naked short. Unknown was being rendered as unbounded, which is the
-- one direction a risk figure must never be wrong in: it teaches the trader
-- that the warning means nothing, and the next one will be real.
--
-- `setup` is the display copy. Nothing reads it on the way to the broker --
-- the send path still takes legs -- so a setup that is absent, stale or
-- malformed cannot change what gets traded. Null is expected and handled: a
-- ticket parked from the Orders tab is a resting broker order that never had a
-- setup, and every row written before this migration has none either. The
-- ticket says so plainly rather than inventing a risk figure.
alter table public.saved_orders
  add column if not exists setup jsonb;

comment on column public.saved_orders.setup is
  'Display-only snapshot of the setup the ticket was built from: strikes, expiry, deltas, credit, max risk. Never read on the send path -- legs is the payload. Null when the ticket came from a resting broker order, or predates this column.';
