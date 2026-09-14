-- An order the trader has built but deliberately NOT sent to the market.
--
-- The owner: *"I want to have an option of making the order Private, it's
-- there but not in the market, something as (Save for Later)."*
--
-- WHAT THIS IS NOT. It is not a broker order type. Alpaca has no concept of a
-- parked order, and nothing here is ever visible to the broker: a saved order
-- has no broker id, no queue position, no time priority and cannot fill. It is
-- a ticket the trader wrote down. That distinction has to survive all the way
-- to the screen, because an order a trader believes is working when it is not
-- is the most expensive misunderstanding this product could create -- so the
-- UI badges these SAVED, never "working", and never counts them among the
-- orders that can still cost money.
--
-- WHY IT IS ITS OWN TABLE rather than a flag on a broker order. Every other
-- order in this product is READ from Alpaca; `trading_accounts` holds no order
-- rows at all, and the Orders tab is a view onto the broker's own list. A
-- saved order is the one kind we author, so it is the one kind we store.
--
-- `legs` IS JSONB AND CARRIES ITS OWN SHAPE -- [{symbol, side, ratio}] -- which
-- is exactly what `openPosition` accepts, so sending a saved order later is a
-- straight hand-off with nothing reconstructed and nothing guessed. Storing
-- strikes and expiries as columns would mean rebuilding the ticket at send
-- time, and a rebuild is where a leg gets dropped or a ratio inverted.
--
-- NO PRICE IS IMPLIED BY AGE. `limit_price` is what the trader chose when they
-- saved it, and the screen re-quotes the market beside it rather than pretending
-- the saved number is still the right one. A week-old limit shown alone would
-- read as a live decision.
create table if not exists public.saved_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  ticker text not null,
  -- [{symbol, side, ratio}] -- openPosition's own leg shape.
  legs jsonb not null,
  qty numeric not null check (qty > 0),
  order_type text not null default 'limit' check (order_type in ('limit', 'market')),
  -- Signed the way the ticket meant it: a credit spread saves a positive
  -- credit, a debit a positive debit, and `net_is_credit` says which, so the
  -- sign convention never has to be re-derived from the legs.
  limit_price numeric check (limit_price is null or limit_price >= 0),
  net_is_credit boolean not null default true,
  -- Equity tickets skip the debit/credit language entirely.
  is_equity boolean not null default false,
  -- Why it was parked, in the trader's own words. Optional and never required.
  note text,
  -- Set when a saved order was pulled back from a live broker order, so the
  -- screen can say "this was working until you saved it" rather than implying
  -- it was never sent.
  from_broker_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_orders_account_idx
  on public.saved_orders (account_id, created_at desc);

alter table public.saved_orders enable row level security;

-- Own rows only, all four verbs. Unlike `profiles` -- whose update policy had
-- to be refused because that table carries `role` -- every column here belongs
-- to the trader and none of them grants anything, so a direct policy is the
-- right shape and no security-definer wrapper is needed.
--
-- `with check` is present on insert AND update so a row cannot be created
-- under, or moved to, somebody else's id.
drop policy if exists "read own saved orders" on public.saved_orders;
create policy "read own saved orders" on public.saved_orders
  for select using (auth.uid() = user_id);

drop policy if exists "create own saved orders" on public.saved_orders;
create policy "create own saved orders" on public.saved_orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "change own saved orders" on public.saved_orders;
create policy "change own saved orders" on public.saved_orders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own saved orders" on public.saved_orders;
create policy "delete own saved orders" on public.saved_orders
  for delete using (auth.uid() = user_id);

-- The account must belong to the caller too. RLS on this table alone would let
-- a user save an order against an account id that is not theirs -- harmless
-- while it sits, and not harmless at all when something later reads
-- `account_id` to decide which credentials to send it with.
create or replace function public.saved_orders_account_is_yours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trading_accounts a
     where a.id = new.account_id and a.user_id = new.user_id
  ) then
    raise exception 'that account does not belong to you';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saved_orders_account_check on public.saved_orders;
create trigger saved_orders_account_check
  before insert or update on public.saved_orders
  for each row execute function public.saved_orders_account_is_yours();

comment on table public.saved_orders is
  'Orders the trader built and chose not to send. Never known to the broker: no broker id, no queue position, no time priority, and cannot fill. Sending one hands its legs to openPosition unchanged.';
