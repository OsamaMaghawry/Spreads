// Reading every row, when PostgREST will only ever hand back a thousand.
//
// An unbounded `.select()` is capped at 1000 rows and reports no error, so the
// admin panel's trade counts and realized P/L silently stopped growing past the
// thousandth trade_records row. Paging is not an optimisation; without it the
// figures are wrong the moment the product succeeds.

export const PAGE = 1000;

// Order matters and is the whole reason this lives in a tested module:
// `.range()` is a method on the filter builder that `.select()` RETURNS, not on
// the query builder from `.from()`. Chaining `.range()` first throws
// "admin.from(...).range is not a function" at runtime — invisible to a bundler
// and to every type check, and it took the entire admin panel down in
// production once.
export async function selectAll(admin: any, table: string, columns: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    // A short page is the last page. Equal-to-PAGE means there may be more.
    if (!data || data.length < PAGE) return rows;
  }
}

// listUsers pages too, and its default perPage is far below a thousand.
export async function listAllUsers(admin: any) {
  const users: any[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < PAGE) return users;
  }
}

/**
 * Every row matching a filter, ordered so the pages cannot overlap or skip.
 *
 * `selectAll` above reads a whole table; this reads one account's slice of one,
 * which is what every per-account function actually wants. `equityHistory`
 * shipped without it and was capped at a thousand `trade_records` and a
 * thousand `stock_lots` — on a book that already holds 1,123 lots.
 *
 * ORDER IS REQUIRED, not optional, and that is the second half of the bug. An
 * unordered paged read has no defined page boundary: Postgres may return the
 * rows in any order it likes, and it need not be the same order twice. So a
 * rebuild could take a different thousand rows than the last one, write a
 * different `premium_cum` for the same historical day, and nothing about the
 * account would have changed. A stored series that moves on its own is worse
 * than a truncated one, because the truncation is at least stable.
 *
 * `apply` receives the builder returned by `.select()` and adds the filters.
 * Order matters exactly as it does above: `.range()` lives on that builder, not
 * on the one `.from()` returns, and chaining it first throws at runtime.
 */
export async function selectAllWhere(
  admin: any,
  table: string,
  columns: string,
  orderBy: string,
  apply: (q: any) => any = (q) => q
) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(admin.from(table).select(columns))
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}
