-- SnapTrade: one connection layer in front of many brokers, evaluated.
--
-- WHY THIS EXISTS. Today the product speaks to exactly one broker, directly.
-- Every additional broker is another OAuth application, another order schema,
-- another activity feed, another set of quirks about what a leg is. SnapTrade
-- sells the alternative: one API, one connection portal, many brokers.
--
-- Whether that trade is worth making is a question about THEIR capabilities,
-- and the only honest way to answer it is to hold their API against what this
-- product actually needs. So this migration stores two things:
--
--   snaptrade_users   the link between one of our users and their SnapTrade
--                     user. SnapTrade issues a `userSecret` at registration
--                     and never shows it again -- lose it and the connection
--                     is unrecoverable -- so it is stored encrypted, under the
--                     same envelope as every other broker credential
--                     (_shared/crypto.ts, AES-256-GCM, key in a function
--                     secret and never in this database).
--
--   snaptrade_probes  what their API answered, run by run. A capability
--                     evaluation nobody can read back a week later is an
--                     opinion; this makes it a record.
--
-- Nothing here is on the trading path and nothing here is read by the app's
-- own money figures. It is an evaluation, kept at arm's length from the
-- product until it earns its place.

create table if not exists public.snaptrade_users (
  -- One SnapTrade user per DeltaMint user. SnapTrade's own user id must be
  -- unique and immutable, so it is our user's uuid and nothing else.
  user_id uuid primary key references auth.users(id) on delete cascade,
  snaptrade_user_id text not null unique,
  -- "v1:<iv>:<ciphertext>", base64. See _shared/crypto.ts.
  user_secret text not null,
  registered_at timestamptz not null default now(),
  -- Set when the SnapTrade user is deleted on their side. Kept rather than
  -- removed so a later "why did this connection vanish" has an answer.
  deleted_at timestamptz
);

comment on column public.snaptrade_users.user_secret is
  'SnapTrade userSecret, AES-256-GCM encrypted. Issued once at registration and never shown again; losing it costs the user every connection they made.';

alter table public.snaptrade_users enable row level security;
-- No policies on purpose: nothing client-side may read a credential, even its
-- own. Every read goes through an edge function holding the service role.
revoke all on public.snaptrade_users from anon, authenticated;

create table if not exists public.snaptrade_probes (
  id uuid primary key default gen_random_uuid(),
  ran_by uuid references auth.users(id) on delete set null,
  ran_at timestamptz not null default now(),
  -- Every probe: what was asked, the HTTP status, and a bounded sample of the
  -- answer. Never a credential -- see redact() in _shared/snaptradeShape.ts.
  report jsonb not null
);

create index if not exists snaptrade_probes_ran_at_idx
  on public.snaptrade_probes (ran_at desc);

alter table public.snaptrade_probes enable row level security;
revoke all on public.snaptrade_probes from anon, authenticated;
