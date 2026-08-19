-- handle_new_user() is a trigger function (references NEW), not meant to be
-- called directly. Postgres/PostgREST auto-expose public-schema functions as
-- RPC endpoints, so revoke execute for anon/authenticated/public explicitly.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
