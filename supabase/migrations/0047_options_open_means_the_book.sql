-- `options_open` stopped meaning "still open" on 12 September 2026.
--
-- Migration 0032 added the column and described it as the mark on option legs
-- STILL OPEN that day, which is what the code did: the caller built the list
-- from the broker's positions endpoint -- what is open at the moment of the
-- rebuild -- and the walk applied it to every stored day back to the account's
-- first trade. A leg carried last Friday and closed on Monday contributed
-- nothing to last Friday, and the row recorded 0.00 with an empty `unpriced`,
-- asserting an empty book on days the account was carrying real option risk.
--
-- The closed half is now reconstructed from `trade_records`, so the column is
-- the mark on the whole book that day. Nothing about its shape, its sign or
-- its null rule changes; only what it is a statement about. The comment is
-- corrected here because a column comment is the one piece of documentation
-- that travels with the data rather than with the checkout.
comment on column public.account_equity_daily.options_open is
  'Mark on every option leg that was on the book that day -- legs still open now and legs long since closed alike: qty x 100 x close less cost basis, signed so a short leg''s credit and liability both carry the right sign. Null when a leg could not be valued; 0 when the account held none. A contract is off the book after its own expiry, whatever day the broker settled it.';
