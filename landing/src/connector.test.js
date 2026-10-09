import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./index.js";
import { CONNECTOR_MARK, ORIGIN_HEADER, connectorEnabled, connectorSection, injectConnector, renderConnectPage } from "./connector.js";

// The Claude connector runs on both Supabase projects, each fronted by its
// own site: deltamint.app/mcp reaches production's function, dev-landing's
// /mcp reaches staging's. The landing tree is identical in both deployments
// (the deploy gate demands it); what differs is the variables in the two
// wrangler files, and the worst mistake available is crossing them.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const jsonc = (rel) => JSON.parse(read(rel).replace(/^\s*\/\/.*$/gm, ""));
const UPSTREAM = "https://wpwaomzgpbozzghohwmf.supabase.co/functions/v1/mcp";
const PROD_UPSTREAM = "https://yecfbeohyakuoyczvdbj.supabase.co/functions/v1/mcp";
const STAGING = { SITE_URL: "https://dev-landing.deltamint.app", NOINDEX: "1", CONNECTOR_UPSTREAM: UPSTREAM, CONNECTOR_APP_URL: "https://dev-dash.deltamint.app" };
const LIVE = { SITE_URL: "https://deltamint.app", CONNECTOR_UPSTREAM: PROD_UPSTREAM, CONNECTOR_APP_URL: "https://dashboard.deltamint.app" };
// A deployment without the variable: the code must then do nothing at all.
const PRODUCTION = { SITE_URL: "https://deltamint.app" };

const HOME = `<html><head></head><body><main>${CONNECTOR_MARK}</main></body></html>`;
const assets = (body, type = "text/html; charset=utf-8", status = 200) => ({
  fetch: async () => new Response(body, { status, headers: { "content-type": type } })
});
const get = (path, env) => worker.fetch(new Request(`https://example.test${path}`), env, {});

test("each site passes /mcp to its own project, never the other's", () => {
  const prod = jsonc("../wrangler.jsonc").vars;
  const staging = jsonc("../wrangler.staging.jsonc").vars;
  assert.equal(prod.CONNECTOR_UPSTREAM, PROD_UPSTREAM);
  assert.equal(prod.CONNECTOR_APP_URL, "https://dashboard.deltamint.app");
  assert.equal(staging.CONNECTOR_UPSTREAM, UPSTREAM);
  assert.equal(staging.CONNECTOR_APP_URL, "https://dev-dash.deltamint.app");
  // Each upstream is the same project the deployment's blog already reads.
  assert.ok(prod.CONNECTOR_UPSTREAM.startsWith(prod.SUPABASE_URL + "/"));
  assert.ok(staging.CONNECTOR_UPSTREAM.startsWith(staging.SUPABASE_URL + "/"));
  assert.equal(connectorEnabled(PRODUCTION), false);
  assert.equal(connectorEnabled(STAGING), true);
});

test("production invokes the Worker for the homepage and the connector, and nothing else new", () => {
  const first = jsonc("../wrangler.jsonc").assets.run_worker_first;
  assert.ok(Array.isArray(first), "run_worker_first must stay a path list on production");
  assert.ok(!first.includes("/*"), "static pages stay static");
  for (const p of ["/", "/connect", "/mcp", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration", "/oauth/authorize"]) {
    assert.ok(first.includes(p), `${p} must reach the Worker on production`);
  }
});

test("production Worker: deltamint.app/mcp on the page, the homepage's analytics not doubled", async () => {
  const live = read("../public/index.html");
  const env = { ...LIVE, GA_MEASUREMENT_ID: "G-TJLVFXVFL6", HOTJAR_SITE_ID: "6773356", ASSETS: assets(live) };
  const home = await (await get("/", env)).text();
  assert.match(home, /Works with Claude/);
  const count = (text, needle) => text.split(needle).length - 1;
  for (const needle of ["G-TJLVFXVFL6", "hjid:6773356", "dmAnalyticsAllowed=function"]) {
    assert.equal(count(home, needle), count(live, needle), `${needle} appears a different number of times`);
  }
  const res = await get("/connect", { ...LIVE, ASSETS: assets(HOME) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Robots-Tag"), null);
  const page = await res.text();
  assert.ok(page.includes(`<code id="cx-mcp">https://deltamint.app/mcp</code>`));
  assert.match(page, /https:\/\/dashboard\.deltamint\.app\/connect-claude/);
  assert.doesNotMatch(page, /noindex|dev-dash|dev-landing|supabase/i);
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
  assert.ok(page.includes(`<code id="cx-mcp">https://dev-landing.deltamint.app/mcp</code>`));
  assert.doesNotMatch(page, /supabase/i, "people see our address, never the server behind it");
  assert.match(page, /https:\/\/dev-dash\.deltamint\.app\/connect-claude/);
  assert.match(page, /<meta name="robots" content="noindex">/);
});

test("without the variable, the same Worker serves neither", async () => {
  const env = { ...PRODUCTION, ASSETS: assets("Not found", "text/html", 404) };
  assert.equal((await get("/connect", env)).status, 404);
  const home = await (await get("/", { ...PRODUCTION, ASSETS: assets(HOME) })).text();
  assert.doesNotMatch(home, /Works with Claude/);
});

// /mcp is passed through to the Supabase function. Stub the network and look
// at exactly what crosses, both ways.
async function throughProxy(path, init, env, upstreamReply) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return upstreamReply();
  };
  try {
    const res = await worker.fetch(new Request(`https://dev-landing.deltamint.app${path}`, init), env, {});
    return { res, calls };
  } finally {
    globalThis.fetch = real;
  }
}

test("staging Worker passes /mcp through: auth and body in, sign-in pointer out, nothing else", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  const reply = () => new Response('{"error":"Sign in"}', {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer resource_metadata="https://dev-landing.deltamint.app/.well-known/oauth-protected-resource/mcp"',
      "set-cookie": "sb=1",
      "x-served-by": "supabase-edge"
    }
  });
  const { res, calls } = await throughProxy("/mcp", {
    method: "POST",
    headers: { authorization: "Bearer tok", "content-type": "application/json", "mcp-protocol-version": "2025-06-18", cookie: "site=1" },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  }, env, reply);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, UPSTREAM);
  assert.equal(calls[0].opts.method, "POST");
  const sent = new Headers(calls[0].opts.headers);
  assert.equal(sent.get("authorization"), "Bearer tok");
  assert.equal(sent.get("mcp-protocol-version"), "2025-06-18");
  assert.equal(sent.get(ORIGIN_HEADER), "https://dev-landing.deltamint.app");
  assert.equal(sent.get("cookie"), null);
  assert.equal(new TextDecoder().decode(calls[0].opts.body), '{"jsonrpc":"2.0","id":1,"method":"tools/list"}');

  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /dev-landing\.deltamint\.app/);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(res.headers.get("x-served-by"), null);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(await res.text(), '{"error":"Sign in"}');
});

test("both sign-in pointer paths reach the function's metadata", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
    const { res, calls } = await throughProxy(path, {}, env, () => new Response("{}", { headers: { "content-type": "application/json" } }));
    assert.equal(res.status, 200, path);
    assert.equal(calls[0].url, `${UPSTREAM}/.well-known/oauth-protected-resource`, path);
    assert.equal(calls[0].opts.body, undefined, path);
  }
});

test("without the variable, /mcp is never passed anywhere", async () => {
  const env = { ...PRODUCTION, ASSETS: assets("Not found", "text/html", 404) };
  const { res, calls } = await throughProxy("/mcp", { method: "POST", body: "{}" }, env, () => new Response("{}"));
  assert.equal(calls.length, 0);
  assert.equal(res.status, 404);
});

// The function believes the origin header only for sites on its own list.
// Both halves must name the same header, and the list must hold this site.
// SIGN-IN UNDER OUR NAME. What the browser is sent to must never name
// Supabase: the owner, seeing "Claude wants to use supabase.co to sign in",
// "I don't want any Supabase name during the process."
const SUPABASE_META = {
  issuer: "https://wpwaomzgpbozzghohwmf.supabase.co/auth/v1",
  authorization_endpoint: "https://wpwaomzgpbozzghohwmf.supabase.co/auth/v1/oauth/authorize",
  token_endpoint: "https://wpwaomzgpbozzghohwmf.supabase.co/auth/v1/oauth/token",
  registration_endpoint: "https://wpwaomzgpbozzghohwmf.supabase.co/auth/v1/oauth/clients/register",
  code_challenge_methods_supported: ["S256", "plain"]
};

test("this site is the authorization server Claude reads, with our sign-in step", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
    const { res, calls } = await throughProxy(path, {}, env, () =>
      new Response(JSON.stringify(SUPABASE_META), { headers: { "content-type": "application/json" } }));
    assert.equal(calls[0].url, "https://wpwaomzgpbozzghohwmf.supabase.co/.well-known/oauth-authorization-server/auth/v1");
    const meta = await res.json();
    assert.equal(meta.issuer, "https://dev-landing.deltamint.app", path);
    assert.equal(meta.authorization_endpoint, "https://dev-landing.deltamint.app/oauth/authorize", path);
    // Server-to-server steps stay direct: no person sees them.
    assert.equal(meta.token_endpoint, SUPABASE_META.token_endpoint);
    assert.equal(meta.registration_endpoint, SUPABASE_META.registration_endpoint);
    assert.deepEqual(meta.code_challenge_methods_supported, ["S256", "plain"]);
  }
});

test("an OAuth server switched off is reported as it is", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  const { res } = await throughProxy("/.well-known/oauth-authorization-server", {}, env, () =>
    new Response('{"msg":"OAuth server is disabled"}', { status: 404, headers: { "content-type": "application/json" } }));
  assert.equal(res.status, 404);
});

test("sign-in: Supabase is asked server-side and the browser goes straight to our approval page", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  const query = "?response_type=code&client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=s1&code_challenge=x&code_challenge_method=S256";
  // A project whose Site URL is an old address: the browser must not see it.
  const { res, calls } = await throughProxy(`/oauth/authorize${query}`, {}, env, () =>
    new Response(null, { status: 302, headers: { location: "https://old-app.example.workers.dev/oauth/consent?authorization_id=auth123" } }));
  assert.equal(calls[0].url, `https://wpwaomzgpbozzghohwmf.supabase.co/auth/v1/oauth/authorize${query}`);
  assert.equal(calls[0].opts.redirect, "manual");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://dev-dash.deltamint.app/oauth/consent?authorization_id=auth123");
  assert.doesNotMatch(res.headers.get("location"), /supabase/i);
});

test("sign-in: an error Supabase sends back to Claude passes through untouched", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  const back = "https://claude.ai/api/mcp/auth_callback?error=invalid_request&error_description=bad+scope&state=s1";
  const { res } = await throughProxy("/oauth/authorize?client_id=abc", {}, env, () =>
    new Response(null, { status: 302, headers: { location: back } }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), back);
});

test("sign-in: a request Supabase refuses outright gets our page, not its JSON", async () => {
  const env = { ...STAGING, ASSETS: assets(HOME) };
  const { res } = await throughProxy("/oauth/authorize?client_id=nope", {}, env, () =>
    new Response('{"code":400,"error_code":"validation_failed","msg":"invalid redirect_uri"}', { status: 400, headers: { "content-type": "application/json" } }));
  assert.equal(res.status, 400);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const page = await res.text();
  assert.match(page, /Sign-in could not start/);
  assert.match(page, /invalid redirect_uri/);
  assert.doesNotMatch(page, /supabase/i);
});

// The function believes the header only from the one site paired with its
// project. That pairing must be the one the wrangler files make.
test("the function pairs each project with the site that fronts it", () => {
  const fn = read("../../supabase/functions/mcp/index.ts");
  assert.ok(fn.includes(`"${ORIGIN_HEADER}"`), "header name differs between Worker and function");
  for (const file of ["../wrangler.jsonc", "../wrangler.staging.jsonc"]) {
    const { SITE_URL, CONNECTOR_UPSTREAM } = jsonc(file).vars;
    const ref = new URL(CONNECTOR_UPSTREAM).hostname.split(".")[0];
    assert.ok(fn.includes(`${ref}: "${SITE_URL}"`), `${file}: the function does not pair ${ref} with ${SITE_URL}`);
  }
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
