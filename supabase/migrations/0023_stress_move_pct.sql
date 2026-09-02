-- The adverse move used to size stock-like risk in the account total.
--
-- Stock-to-zero is the textbook max loss for one cash-secured put or covered
-- call, and it is meaningless summed across a book: by that logic the whole
-- market's max risk is its market cap. Clearing and every portfolio-margin
-- engine instead shock the underlying by a defined move and take the loss
-- there -- the OCC TIMS baseline for single stocks is fifteen percent. That is
-- the figure that rolls into Risk / Equity for wheel positions. Tunable here,
-- like every other threshold, never a literal in the function.
alter table public.watch_settings
  add column if not exists stress_move_pct numeric not null default 0.15;
