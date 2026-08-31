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
