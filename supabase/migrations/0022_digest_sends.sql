-- A ledger of digest emails, so the endpoint that sends them can be rate limited.
--
-- The agents that write the weekly reports run without service-role credentials
-- and without MCP tools; the only key they hold is the anon key, which is
-- already in the repo because the browser needs it. That is enough to call the
-- digest function, which is what finally lets a cadence reach the owner without
-- a human merging a branch or pasting a secret.
--
-- The cost of that convenience is that the key is public, so anyone who finds
-- the endpoint could use it. Two things bound the damage: the function ignores
-- any requested recipient and always mails the configured owner, and this table
-- caps how many messages can be sent in a window. The worst case becomes a
-- bounded number of unwanted mails to one address, not an open relay.
create table if not exists public.digest_sends (
  id uuid primary key default gen_random_uuid(),
  subject text,
  created_at timestamptz not null default now()
);

create index if not exists digest_sends_created_idx
  on public.digest_sends (created_at desc);

-- Nothing in the browser needs to read or write this; the edge function uses
-- the service role, which bypasses RLS.
alter table public.digest_sends enable row level security;
revoke all on public.digest_sends from anon, authenticated;
