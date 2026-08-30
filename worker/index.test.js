// node --test worker/index.test.js

import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const ASSETS = { fetch: async () => new Response("app", { status: 200 }) };
const env = { CANONICAL_HOST: "dashboard.deltamint.app", ASSETS };

test("a link that lands on the workers.dev host is sent to the real one", async () => {
  const res = await worker.fetch(
    new Request("https://spreads.osamamaghawry.workers.dev/accounts"),
    env
  );
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://dashboard.deltamint.app/accounts");
});

test("the query survives, because an auth link carries its token there", async () => {
  const res = await worker.fetch(
    new Request("https://spreads.osamamaghawry.workers.dev/?code=abc123&type=signup"),
    env
  );
  assert.equal(res.headers.get("location"), "https://dashboard.deltamint.app/?code=abc123&type=signup");
});

test("the real host is served, not redirected", async () => {
  const res = await worker.fetch(new Request("https://dashboard.deltamint.app/accounts"), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "app");
});

test("with no canonical host configured it just serves the app", async () => {
  const res = await worker.fetch(new Request("http://localhost:5173/accounts"), { ASSETS });
  assert.equal(res.status, 200);
});
