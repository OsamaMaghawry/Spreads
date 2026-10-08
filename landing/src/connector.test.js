import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./index.js";
import { CONNECTOR_MARK, connectorEnabled, connectorSection, injectConnector, renderConnectPage } from "./connector.js";

// The Claude connector exists only on the staging Supabase project, so its
// homepage section and /connect page must exist only on dev-landing. The
// landing tree is identical in both deployments (the deploy gate demands it);
// what differs is one variable, set only in wrangler.staging.jsonc.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const MCP = "https://wpwaomzgpbozzghohwmf.supabase.co/functions/v1/mcp";
const STAGING = { SITE_URL: "https://dev-landing.deltamint.app", NOINDEX: "1", CONNECTOR_MCP_URL: MCP, CONNECTOR_APP_URL: "https://dev-dash.deltamint.app" };
const PRODUCTION = { SITE_URL: "https://deltamint.app" };

const HOME = `<html><head></head><body><main>${CONNECTOR_MARK}</main></body></html>`;
const assets = (body, type = "text/html; charset=utf-8", status = 200) => ({
  fetch: async () => new Response(body, { status, headers: { "content-type": type } })
});
const get = (path, env) => worker.fetch(new Request(`https://example.test${path}`), env, {});

test("production has no connector variable; staging has it", () => {
  const prod = read("../wrangler.jsonc");
  const staging = read("../wrangler.staging.jsonc");
  assert.doesNotMatch(prod, /CONNECTOR_MCP_URL/);
  assert.match(staging, /"CONNECTOR_MCP_URL":\s*"https:\/\/wpwaomzgpbozzghohwmf\.supabase\.co\/functions\/v1\/mcp"/);
  assert.equal(connectorEnabled(PRODUCTION), false);
  assert.equal(connectorEnabled(STAGING), true);
});

test("production never invokes the Worker for the homepage or /connect", () => {
  const prod = JSON.parse(read("../wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
  const first = prod.assets.run_worker_first;
  assert.ok(Array.isArray(first), "run_worker_first must stay a path list on production");
  assert.ok(!first.some((p) => p === "/" || p === "/*" || p.startsWith("/connect")), JSON.stringify(first));
});

test("the homepage carries the marker exactly once, and staging fills it", () => {
  const home = read("../public/index.html");
  assert.equal(home.split(CONNECTOR_MARK).length - 1, 1);
  const filled = injectConnector(home);
  assert.ok(!filled.includes(CONNECTOR_MARK));
  assert.match(filled, /id="claude"/);
  assert.equal(injectConnector("<p>no marker</p>"), "<p>no marker</p>");
});

test("staging Worker: section on the homepage, /connect served with the address", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  const home = await (await get("/", env)).text();
  assert.match(home, /Works with Claude/);
  const res = await get("/connect", env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
  const page = await res.text();
  assert.ok(page.includes(MCP));
  assert.match(page, /https:\/\/dev-dash\.deltamint\.app\/connect-claude/);
  assert.match(page, /<meta name="robots" content="noindex">/);
});

test("without the variable, the same Worker serves neither", async () => {
  const env = { ...PRODUCTION, ASSETS: assets("Not found", "text/html", 404) };
  assert.equal((await get("/connect", env)).status, 404);
  const home = await (await get("/", { ...PRODUCTION, ASSETS: assets(HOME) })).text();
  assert.doesNotMatch(home, /Works with Claude/);
});

test("the sample answer adds up: credit, max loss and return on risk agree", () => {
  const html = connectorSection();
  const rows = [...html.matchAll(/<tr><td>(\w+)<\/td><td>(\d+)\/(\d+)<span class="cx-kind"> put spread<\/span><\/td><td class="r cx-days">\d+<\/td><td class="r">[\d.]+<\/td><td class="r">\$(\d+)<\/td><td class="r">\$(\d+)<\/td><td class="r">([\d.]+)%<\/td><\/tr>/g)];
  assert.equal(rows.length, 3);
  for (const [, , hi, lo, credit, loss, ror] of rows) {
    const width = (Number(hi) - Number(lo)) * 100;
    assert.equal(Number(loss), width - Number(credit), `${hi}/${lo}`);
    assert.equal(Number(ror), Math.round((Number(credit) / Number(loss)) * 1000) / 10, `${hi}/${lo}`);
  }
});

// docs/context/compliance.md: no advice, signals or recommendations. A
// sentence that mentions them must be saying it is not one.
test("connector copy never presents a result as advice", () => {
  const text = (connectorSection() + renderConnectPage(STAGING, STAGING.SITE_URL, true))
    .replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ");
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (/\b(best|recommend\w*|signals?|top picks?|should (buy|sell)|guarantee\w*)\b/i.test(sentence)) {
      assert.match(sentence, /\b(not|never|no)\b/i, `advice-like wording: "${sentence.trim()}"`);
    }
  }
  assert.doesNotMatch(text, /\bAlpaca\b/, "the broker is not named on the marketing site outside the integrations card");
});
