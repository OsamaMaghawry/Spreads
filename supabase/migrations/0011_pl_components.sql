-- What a position was worth, in the three parts it is actually made of.
--
-- `realized_pl` was one number: (net_credit - close_debit) * qty * 100. Premium
-- taken at open and the cost of buying the position back were fused before
-- anything could read them, and the result of shares delivered on assignment
-- was not in it at all -- that lived in stock_lots, on a different screen. So
-- there was no way to answer "how much of this came from premium", which is the
-- first question anyone asks of a credit strategy.
--
--   premium_pl     =  net_credit  * qty * 100   credit at open; negative on a net debit
--   early_close_pl = -close_debit * qty * 100   zero unless the position was bought back
--   stock_pl       =  the share lots this option acquired or disposed of
--   realized_pl    =  the sum of the three, and now the honest total
--
-- The parts sum to the whole, so every row can be checked by addition.

alter table public.trade_records add column if not exists premium_pl numeric;
alter table public.trade_records add column if not exists early_close_pl numeric;
alter table public.trade_records add column if not exists stock_pl numeric;

-- A cash-secured put and a covered call were both 'wheel'. They are the two
-- halves of a wheel cycle -- one takes delivery of shares, the other gives them
-- away -- so adding them together hides the only distinction that matters when
-- reading the cycle back.
--
-- 'wheel' survives in the constraint but nothing writes it: rows created before
-- this release must not be rejected while they wait for a rebuild.
alter table public.trade_records
  drop constraint if exists trade_records_strategy_check;

alter table public.trade_records
  add constraint trade_records_strategy_check
  check (strategy in ('spreads', 'cash_secured_put', 'covered_call', 'wheel', 'unknown'));

-- Existing wheel rows split by what the option was. In an OCC symbol the type
-- is the character before the eight-digit strike, so it is the ninth from the
-- end -- read from the symbol rather than guessed from the strategy.
update public.trade_records
   set strategy = case
         when substr(short_symbol, length(short_symbol) - 8, 1) = 'C' then 'covered_call'
         else 'cash_secured_put'
       end
 where strategy = 'wheel'
   and short_symbol is not null
   and length(short_symbol) > 9;

-- Which option a share lot belongs to, and it is two different options.
--
-- A wheel cycle acquires shares through an assigned put and disposes of them
-- through an assigned call. One chain_id column can name only one of those, so
-- the ledger could not express the sentence "the put bought them, the call sold
-- them" -- and attributing the result needs exactly that sentence. The share
-- P/L is credited to whichever option *disposed* of the lot, falling back to
-- the one that acquired it when the shares were sold on the open market.
alter table public.stock_lots add column if not exists acquired_chain_id text;
alter table public.stock_lots add column if not exists disposed_chain_id text;

-- Existing rows carry the collapsed value, which was the acquisition when there
-- was one. Nothing is invented for the disposal side; a rebuild fills it in.
update public.stock_lots
   set acquired_chain_id = chain_id
 where acquired_chain_id is null
   and chain_id is not null
   and acquired_date is not null;

create index if not exists stock_lots_disposed_chain_id_idx
  on public.stock_lots (disposed_chain_id);
create index if not exists stock_lots_acquired_chain_id_idx
  on public.stock_lots (acquired_chain_id);
