import test from "node:test";
import assert from "node:assert/strict";
import { parseSitemap, sitemapFingerprint, sitemapReason, indexNowBatch } from "./searchSubmit.mjs";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://deltamint.app/</loc></url>
  <url><loc>https://deltamint.app/tools/credit-spread-calculator</loc></url>
  <url><loc>https://deltamint.app/blog/collar-option-strategy</loc><lastmod>2026-10-14</lastmod></url>
</urlset>`;

test("sitemap: every url, with its lastmod where it has one", () => {
  assert.deepEqual(parseSitemap(xml), [
    { loc: "https://deltamint.app/", lastmod: "" },
    { loc: "https://deltamint.app/tools/credit-spread-calculator", lastmod: "" },
    { loc: "https://deltamint.app/blog/collar-option-strategy", lastmod: "2026-10-14" }
  ]);
  assert.deepEqual(parseSitemap(""), []);
});

test("fingerprint: changes with a new page or a new lastmod, not with order", () => {
  const e = parseSitemap(xml);
  const f = sitemapFingerprint(e);
  assert.equal(sitemapFingerprint([...e].reverse()), f);
  assert.notEqual(sitemapFingerprint([...e, { loc: "https://deltamint.app/blog/new", lastmod: "2026-10-21" }]), f);
  assert.notEqual(sitemapFingerprint(e.map((x, i) => (i === 2 ? { ...x, lastmod: "2026-10-20" } : x))), f);
});

test("google: submit the first time, on any change, and when Google stops reading it", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  assert.match(sitemapReason({ fingerprint: "a", submittedFingerprint: null, lastDownloaded: null, now }), /first/);
  assert.match(sitemapReason({ fingerprint: "b", submittedFingerprint: "a", lastDownloaded: "2026-10-20T00:00:00Z", now }), /changed/);
  assert.match(sitemapReason({ fingerprint: "a", submittedFingerprint: "a", lastDownloaded: "2026-10-10T00:00:00Z", now }), /7 days/);
  // Unchanged and read yesterday: nothing to ask for.
  assert.equal(sitemapReason({ fingerprint: "a", submittedFingerprint: "a", lastDownloaded: "2026-10-20T00:00:00Z", now }), null);
});

test("indexnow: each URL once, again only when it changes", () => {
  const e = parseSitemap(xml);
  assert.equal(indexNowBatch(e, {}).length, 3);
  const sent = Object.fromEntries(e.map((x) => [x.loc, x.lastmod]));
  assert.deepEqual(indexNowBatch(e, sent), []);
  const edited = e.map((x, i) => (i === 2 ? { ...x, lastmod: "2026-10-21" } : x));
  assert.deepEqual(indexNowBatch(edited, sent), ["https://deltamint.app/blog/collar-option-strategy"]);
});

// ---------------------------------------------------------------------------
// The calls, against a stubbed fetch: what is sent, and what a refusal says.
// ---------------------------------------------------------------------------

import { googleSitemap, indexNow } from "./searchSubmit.mjs";

function stubFetch(handler) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    const { status = 200, json = {} } = handler(String(url), init.method || "GET") || {};
    return { status, ok: status >= 200 && status < 300, json: async () => json, text: async () => JSON.stringify(json) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const entries = parseSitemap(xml);
const sa = { client_email: "metrics@deltamint.iam.gserviceaccount.com" };
const args = { token: "t", site: "sc-domain:deltamint.app", feed: "https://deltamint.app/sitemap.xml", sa, entries };

test("google: a first run submits the sitemap with PUT and reads it back", async () => {
  const f = stubFetch((url, method) => (method === "PUT" ? { status: 204 } : { json: { lastDownloaded: "2026-10-20T08:00:00Z", contents: [{ submitted: "58" }] } }));
  try {
    const r = await googleSitemap({ ...args, state: {} });
    assert.equal(r.submitted, true);
    assert.match(r.why, /first/);
    assert.equal(r.google.submittedUrls, 58);
    assert.ok(f.calls.some((c) => c.method === "PUT" && c.url.includes("sitemaps/https%3A%2F%2Fdeltamint.app%2Fsitemap.xml")));
  } finally { f.restore(); }
});

test("google: unchanged and read recently is left alone", async () => {
  const f = stubFetch(() => ({ json: { lastDownloaded: new Date().toISOString() } }));
  try {
    const r = await googleSitemap({ ...args, state: { fingerprint: sitemapFingerprint(entries) } });
    assert.equal(r.submitted, false);
    assert.ok(!f.calls.some((c) => c.method === "PUT"));
  } finally { f.restore(); }
});

test("google: a refusal names the permission to give, and which account", async () => {
  const f = stubFetch((url, method) => (method === "PUT" ? { status: 403, json: { error: "insufficient permission" } } : { json: {} }));
  try {
    const r = await googleSitemap({ ...args, state: {} });
    assert.equal(r.submitted, false);
    assert.match(r.error, /Full" permission/);
    assert.match(r.error, /metrics@deltamint/);
  } finally { f.restore(); }
});

test("indexnow: the key file travels with the URLs; a refusal sends nothing", async () => {
  let f = stubFetch(() => ({ status: 202 }));
  try {
    const r = await indexNow({ host: "deltamint.app", urls: ["https://deltamint.app/tools"] });
    assert.deepEqual([r.sent, r.status], [1, 202]);
    const body = JSON.parse(f.calls[0].body);
    assert.equal(body.keyLocation, `https://deltamint.app/${body.key}.txt`);
  } finally { f.restore(); }
  f = stubFetch(() => ({ status: 403 }));
  try {
    const r = await indexNow({ host: "deltamint.app", urls: ["https://deltamint.app/tools"] });
    assert.equal(r.sent, 0);
    assert.match(r.error, /key file is not live/);
  } finally { f.restore(); }
  assert.deepEqual(await indexNow({ host: "deltamint.app", urls: [] }), { sent: 0 });
});
