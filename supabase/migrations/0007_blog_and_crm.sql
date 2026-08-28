-- Blog posts and the internal customer record behind the admin panel.
--
-- Two separate concerns that happen to arrive together: public content that
-- must be readable by anonymous crawlers, and internal notes that must never
-- be readable by the person they are about.

-- Public content. Read by the landing Worker with the anon key on every blog
-- request, so the RLS policy below is the only thing standing between a draft
-- and the open internet — it is written to fail closed.
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  -- Markdown. Rendered to HTML by the landing Worker at request time.
  body text not null default '',
  author text not null,
  -- Falls back to excerpt when empty; kept separate because a good meta
  -- description is written for search results, not for the page.
  meta_description text,
  og_image text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The listing query: published posts, newest first.
create index blog_posts_published_idx
  on public.blog_posts (published_at desc)
  where status = 'published';

create table public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Nullable so deleting an admin account doesn't delete the notes they wrote.
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index user_notes_user_id_idx on public.user_notes (user_id, created_at desc);

-- CRM fields live here rather than as columns on `profiles` deliberately.
-- `profiles` carries a "select own profile" policy, so a status or tag added
-- there would be readable by the customer it describes. This table has RLS on
-- and no policies at all, which denies every client role; only the service
-- role inside an admin edge function can reach it.
create table public.user_crm (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.blog_posts enable row level security;
alter table public.user_notes enable row level security;
alter table public.user_crm enable row level security;

-- The only public read path in this migration. Three conditions, each load
-- bearing: status gates the draft, `published_at is not null` stops a post
-- marked published before a date was set from leaking, and the time comparison
-- makes scheduling work — a future date stays invisible until it arrives.
--
-- Applies to anon and authenticated alike; the service role bypasses RLS, so
-- the admin panel still sees drafts through its edge function.
create policy "read published blog posts" on public.blog_posts
  for select using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
  );

-- user_notes and user_crm intentionally have no policies: writes and reads go
-- through admin edge functions on the service role. Adding a policy here would
-- widen access beyond that path.
