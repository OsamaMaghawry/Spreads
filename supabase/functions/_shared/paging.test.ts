import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAll, listAllUsers, PAGE } from "./paging.ts";

// The fake client mirrors supabase-js's REAL builder shape, which is the entire
// point of this file. `.from()` returns something with only `.select()`;
// `.select()` returns something with `.range()`. A helper that chains them the
// other way round throws "admin.from(...).range is not a function" at runtime —
// it bundles cleanly, passes every type check, and took the admin panel down.
// Any fake that exposes `.range()` on the `.from()` object would hide exactly
// the bug this guards against, so it deliberately does not.
function fakeClient(rowsByTable: Record<string, any[]>, calls: any[] = []) {
  return {
    calls,
    from(table: string) {
      return {
        select(columns: string) {
          return {
            range(from: number, to: number) {
              calls.push({ table, columns, from, to });
              const all = rowsByTable[table] || [];
              return Promise.resolve({ data: all.slice(from, to + 1), error: null });
            }
          };
        }
      };
    }
  };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));

test("selectAll calls select before range, as supabase-js requires", async () => {
  const calls: any[] = [];
  const admin = fakeClient({ t: rows(3) }, calls);
  const out = await selectAll(admin, "t", "a, b");
  assert.equal(out.length, 3);
  assert.deepEqual(calls[0], { table: "t", columns: "a, b", from: 0, to: PAGE - 1 });
});

test("a short first page is the only request", async () => {
  const calls: any[] = [];
  await selectAll(fakeClient({ t: rows(10) }, calls), "t", "*");
  assert.equal(calls.length, 1);
});

test("reads past the 1000-row cap that silently truncated the panel", async () => {
  const calls: any[] = [];
  const out = await selectAll(fakeClient({ t: rows(2500) }, calls), "t", "*");
  assert.equal(out.length, 2500, "every row must come back, not the first page");
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.from),
    [0, PAGE, PAGE * 2]
  );
});

test("an exact multiple of the page size still terminates", async () => {
  // 2000 rows means page three comes back empty; without the short-page check
  // this loops forever.
  const calls: any[] = [];
  const out = await selectAll(fakeClient({ t: rows(PAGE * 2) }, calls), "t", "*");
  assert.equal(out.length, PAGE * 2);
  assert.equal(calls.length, 3);
});

test("an error is raised with the table named, not swallowed", async () => {
  const admin = {
    from: () => ({ select: () => ({ range: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) })
  };
  await assert.rejects(() => selectAll(admin, "trade_records", "*"), /trade_records: boom/);
});

test("listAllUsers pages past the first batch", async () => {
  const pages: any[] = [];
  const admin = {
    auth: {
      admin: {
        listUsers({ page, perPage }: any) {
          pages.push(page);
          const total = PAGE + 7;
          const start = (page - 1) * perPage;
          return Promise.resolve({ data: { users: rows(total).slice(start, start + perPage) }, error: null });
        }
      }
    }
  };
  const users = await listAllUsers(admin);
  assert.equal(users.length, PAGE + 7);
  assert.deepEqual(pages, [1, 2]);
});
