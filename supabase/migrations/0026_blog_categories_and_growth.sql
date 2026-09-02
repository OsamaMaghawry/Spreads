-- Three things the daily loop needs.
--
-- 1. Blog categories. The blog publishes one article a day from a syllabus
--    with six categories; the landing Worker renders a hub page per category
--    and "read next" inside it. Category is constrained to the six so a typo
--    in front matter cannot create a seventh hub.
alter table public.blog_posts
  add column if not exists category text not null default 'managing'
    check (category in ('foundations', 'income', 'hedging', 'investing', 'managing', 'measuring')),
  add column if not exists tags text[] not null default '{}',
  add column if not exists series_order integer;

create index if not exists blog_posts_category_idx
  on public.blog_posts (category, series_order, published_at desc)
  where status = 'published';

-- 2. Where a signup came from. Written once at registration from the URL the
--    user arrived on (?ref= or utm_*), so a blog post can be tied to the
--    signups it produced. Readable by the user (it is their own row) and by
--    the admin function.
alter table public.profiles add column if not exists signup_source text;

-- The app passes the source as sign-up metadata; the trigger that creates the
-- profile copies it across, so no client ever needs an update policy on
-- profiles for it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, signup_source)
  values (new.id, left(new.raw_user_meta_data->>'signup_source', 200));
  return new;
end;
$$;

-- 3. The daily metrics snapshot. One row per day, written by the CI job with
--    the service role: Search Console, GA4 and the product funnel as JSON.
--    Denied to every client role; read through adminData only.
create table if not exists public.growth_metrics (
  day date primary key,
  search jsonb,
  analytics jsonb,
  funnel jsonb,
  created_at timestamptz not null default now()
);
alter table public.growth_metrics enable row level security;
revoke all on public.growth_metrics from anon, authenticated;
