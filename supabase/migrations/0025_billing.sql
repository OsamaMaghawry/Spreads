-- Billing: one row per user saying whether a live plan is active.
--
-- Written only by the Stripe webhook (service role). Readable by the user it
-- belongs to, so the app can show a plan and a renewal date without a second
-- function call. Never written from the browser: a client that could set its
-- own status to 'active' would be a client that never pays.
--
-- What the row gates is exactly one thing -- opening a position on a live
-- account (openPosition). Closing, cancelling, quoting, reading, exporting and
-- everything on paper are never behind a plan; see _shared/entitlement.ts.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  -- 'live' today; a later tier is a new value, not a new table.
  plan text not null default 'live',
  -- Stripe's own vocabulary, stored as Stripe sends it. 'trialing' and
  -- 'active' grant entitlement; 'past_due' grants it until the period ends
  -- (Stripe retries the card meanwhile); the rest do not.
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Set by an administrator for accounts connected before the switch date:
  -- entitlement holds until this moment regardless of Stripe.
  grandfathered_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

-- The user may read their own row. Nobody may write through the API: the
-- webhook and the admin panel both use the service role.
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

create policy "select own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

-- The switch. Off by default and seeded so the row exists to be read; the
-- reading code treats a missing row as off as well -- the default has to be
-- the open-for-everyone one in both places until the owner flips it.
insert into public.app_settings (key, value)
values ('billing_enforced', 'false'::jsonb)
on conflict (key) do nothing;
