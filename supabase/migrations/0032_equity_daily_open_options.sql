-- The option legs still open, marked day by day.
--
-- The owner, 11 Sep, reading his own TSLA book on the Analysis page: *"did you
-- add the Put position that is open now? You included only the long position
-- but I don't think the Long Put is in the analysis. Also, make sure the
-- analysis has the open positions too, not only the closed ones."*
--
-- He was right, and it was not one position. `trade_records` rows all carry a
-- `close_date` by construction and `stock_lots` are shares, so an OPTION still
-- open appeared in neither — and on that account that is five legs:
--
--   TSLA 365P   long 1    paid $435    worth $420     -$15   <- the one he saw
--   TSLA 352.5C long 1    paid $1,357  worth $1,785   +$428
--   TSLA 375C   short 1   took $226    costs $299     -$73
--   TSLA 362.5C short 2   took $1,738  costs $2,420   -$682
--   NVDA 222.5P short 3   took $123    costs $171     -$48
--
-- Net -$390 of live P/L in no figure on the page, on a book whose headline
-- called itself "the wheel as one strategy" while counting the 210 TSLA shares
-- and dropping both the put protecting them and the calls written against
-- them. That is not a wheel; it is a third of one.
--
-- Marked from `/v1beta1/options/bars`, with each leg's opening date read from
-- the account's own closed orders for those symbols. A leg whose open date
-- cannot be established is named rather than assumed to have existed forever,
-- which would put today's position on days before it was opened.
alter table public.account_equity_daily
  add column if not exists options_open numeric;

comment on column public.account_equity_daily.options_open is
  'Mark on option legs still open that day: qty x 100 x close less cost basis, signed so a short leg''s credit and liability both carry the right sign. Null when a leg could not be valued; 0 when none were held.';
