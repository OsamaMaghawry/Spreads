-- The symbols with past gamma kept (gex_history, 0066), for the Gamma page's
-- History view (functions/terminal "gexHistory"). Server only.
create or replace function public.gex_history_symbols()
returns table (symbol text, days integer, first_day date, last_day date)
language sql
stable
set search_path = public
as $$
  select symbol, count(*)::integer, min(day), max(day)
  from public.gex_history
  group by symbol
  order by symbol
$$;

revoke all on function public.gex_history_symbols() from public, anon, authenticated;
grant execute on function public.gex_history_symbols() to service_role;
