-- Spread Deck schema: trading accounts, reconstructed trade history, and a
-- minimal user profile (role) table. Replaces the Base44 entity store.

create table public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  api_key text not null,
  api_secret text not null,
  is_paper boolean not null default false,
  spreads_client_prefix text,
  wheel_client_prefix text,
  created_at timestamptz not null default now()
);

create table public.trade_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  strategy text not null default 'unknown' check (strategy in ('spreads', 'wheel', 'unknown')),
  trade_key text not null,
  ticker text not null,
  expiry text,
  short_symbol text not null,
  long_symbol text default '',
  short_strike numeric,
  long_strike numeric,
  qty numeric,
  open_date date,
  close_date date,
  short_entry numeric,
  long_entry numeric,
  net_credit numeric,
  short_exit numeric,
  long_exit numeric,
  close_debit numeric,
  realized_pl numeric,
  close_reason text check (close_reason in ('closed', 'expired')),
  created_at timestamptz not null default now(),
  unique (account_id, trade_key)
);

create index trade_records_account_id_idx on public.trade_records (account_id);
create index trade_records_user_id_idx on public.trade_records (user_id);
create index trading_accounts_user_id_idx on public.trading_accounts (user_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.trading_accounts enable row level security;
alter table public.trade_records enable row level security;
alter table public.profiles enable row level security;

create policy "select own trading accounts" on public.trading_accounts
  for select using (auth.uid() = user_id);
create policy "insert own trading accounts" on public.trading_accounts
  for insert with check (auth.uid() = user_id);
create policy "update own trading accounts" on public.trading_accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own trading accounts" on public.trading_accounts
  for delete using (auth.uid() = user_id);

-- Trade records are written by the tradeHistory edge function (service role,
-- bypasses RLS); these policies only govern direct client reads (e.g. BackupButton).
create policy "select own trade records" on public.trade_records
  for select using (auth.uid() = user_id);
create policy "insert own trade records" on public.trade_records
  for insert with check (auth.uid() = user_id);
create policy "update own trade records" on public.trade_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own trade records" on public.trade_records
  for delete using (auth.uid() = user_id);

create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);
