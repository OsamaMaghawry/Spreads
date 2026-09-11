-- The option legs still open, marked day by day.
--
-- The owner, 11 Sep, reading his own TSLA book on the Analysis page: *"did you
-- add the Put position that is open now? You included only the long position
-- but I don't think the Long Put is in the analysis. Also, make sure the
-- analysis has the open positions too, not only the closed ones."*
--
-- He was right about the gap. `trade_records` rows all carry a `close_date` by
-- construction and `stock_lots` are shares, so an OPTION still open appeared in
-- neither, and nothing on the Analysis page ever counted one. While such legs
-- are open, the page counted the 210 TSLA shares and dropped both the put
-- protecting them and the calls written against them -- not a wheel, a third of
-- one.
--
-- A CORRECTION, recorded because the first version of this comment stated it as
-- fact: the five legs originally listed here were read from the only stored
-- position dump on staging, taken 8 Sep 14:56 UTC, and presented as the book
-- "now". They were not. By 9 Sep all five had CLOSED, and the owner said so.
-- The gap this column fills is real; that illustration of it was three days
-- stale. See openBook.js for the marks beside what they actually realized --
-- one leg marked -$682 and realized -$1,832, which is the reason a mark is
-- labelled unrealized everywhere it appears.
--
-- Marked from `/v1beta1/options/bars`, with each leg's opening date read from
-- the account's own closed orders for those symbols. A leg whose open date
-- cannot be established is named rather than assumed to have existed forever,
-- which would put today's position on days before it was opened.
alter table public.account_equity_daily
  add column if not exists options_open numeric;

comment on column public.account_equity_daily.options_open is
  'Mark on option legs still open that day: qty x 100 x close less cost basis, signed so a short leg''s credit and liability both carry the right sign. Null when a leg could not be valued; 0 when none were held.';
