#!/usr/bin/env node
// One row a day: Search Console, GA4 and the product funnel.
//
// Runs in CI with a Google service account (GOOGLE_METRICS_SA, JSON) and the
// Supabase service role. Writes docs/growth/metrics/YYYY-MM-DD.json, rewrites
// docs/growth/metrics/README.md with the latest figures, and upserts the same
// row into growth_metrics so the admin KPI panel can show it. No agent
// session ever holds the Google credentials: they read the files this writes.
//
// Any source that is not configured is recorded as null with a reason, never
// as zero -- a zero would read as "no traffic" when it means "not connected".

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import path from "node:path";

const OUT = "docs/growth/metrics";
const SITE = process.env.GSC_SITE_URL || "sc-domain:deltamint.app";
const GA4 = process.env.GA4_PROPERTY_ID || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const day = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// --- Google: a signed JWT exchanged for a bearer token, no SDK -------------
async function googleToken(sa, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` })
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function searchConsole(token) {
  const q = async (body) => {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`gsc: ${res.status} ${await res.text()}`);
    return (await res.json()).rows || [];
  };
  // Search Console data lags two to three days; the windows end at day-3.
  const end = daysAgo(3), start28 = daysAgo(30), start1 = daysAgo(3);
  const total = (rows) => rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });
  const [d1, d28, queries, pages] = await Promise.all([
    q({ startDate: start1, endDate: end }),
    q({ startDate: start28, endDate: end }),
    q({ startDate: start28, endDate: end, dimensions: ["query"], rowLimit: 25 }),
    q({ startDate: start28, endDate: end, dimensions: ["page"], rowLimit: 25 })
  ]);
  const t28 = total(d28);
  return {
    site: SITE, window: { start: start28, end },
    lastDay: total(d1),
    last28: { ...t28, ctr: t28.impressions ? t28.clicks / t28.impressions : 0, position: d28[0]?.position ?? null },
    topQueries: queries.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 })),
    topPages: pages.map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions }))
  };
}

async function analytics(token) {
  const run = async (body) => {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4}:runReport`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`ga4: ${res.status} ${await res.text()}`);
    return (await res.json()).rows || [];
  };
  const range = (n) => [{ startDate: `${n}daysAgo`, endDate: "yesterday" }];
  const num = (r, i) => Number(r.metricValues?.[i]?.value || 0);
  const [t1, t28, sources, landing] = await Promise.all([
    run({ dateRanges: range(1), metrics: [{ name: "activeUsers" }, { name: "sessions" }] }),
    run({ dateRanges: range(28), metrics: [{ name: "activeUsers" }, { name: "sessions" }] }),
    run({ dateRanges: range(28), dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }], limit: 15, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    run({ dateRanges: range(28), dimensions: [{ name: "landingPagePlusQueryString" }], metrics: [{ name: "sessions" }], limit: 15, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] })
  ]);
  return {
    property: GA4,
    lastDay: { users: num(t1[0] || {}, 0), sessions: num(t1[0] || {}, 1) },
    last28: { users: num(t28[0] || {}, 0), sessions: num(t28[0] || {}, 1) },
    sources: sources.map((r) => ({ source: r.dimensionValues[0].value, sessions: num(r, 0) })),
    landingPages: landing.map((r) => ({ page: r.dimensionValues[0].value, sessions: num(r, 0) }))
  };
}

// --- Product funnel, the same arithmetic the admin panel uses ---------------
async function funnel() {
  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const get = async (p) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: h });
    if (!res.ok) throw new Error(`supabase ${p}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const [profiles, accounts, trades, subs] = await Promise.all([
    get("profiles?select=id,created_at,signup_source"),
    get("trading_accounts?select=id,user_id,is_paper"),
    get("trade_records?select=user_id,account_id"),
    get("subscriptions?select=user_id,status")
  ]);
  const live = new Set(accounts.filter((a) => !a.is_paper).map((a) => a.id));
  const byUser = (rows, f = () => true) => new Set(rows.filter(f).map((r) => r.user_id));
  const connected = byUser(accounts), traded = byUser(trades), tradedLive = byUser(trades, (t) => live.has(t.account_id));
  const paying = byUser(subs, (s) => s.status === "active");
  const since = daysAgo(7);
  const bySource = {};
  for (const p of profiles) bySource[p.signup_source || "unknown"] = (bySource[p.signup_source || "unknown"] || 0) + 1;
  return {
    signedUp: profiles.length,
    signedUpLast7: profiles.filter((p) => (p.created_at || "") >= since).length,
    connected: connected.size,
    traded: traded.size,
    tradedLive: tradedLive.size,
    paying: paying.size,
    bySource
  };
}

async function safely(name, fn, enabled) {
  if (!enabled) return { unavailable: `${name} not configured` };
  try { return await fn(); } catch (e) { return { unavailable: `${name}: ${e.message}` }; }
}

const sa = process.env.GOOGLE_METRICS_SA ? JSON.parse(process.env.GOOGLE_METRICS_SA) : null;
const token = sa ? await googleToken(sa, ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/analytics.readonly"]) : null;

const snapshot = {
  day,
  search: await safely("search console", () => searchConsole(token), !!token),
  analytics: await safely("ga4", () => analytics(token), !!token && !!GA4),
  funnel: await safely("supabase", funnel, !!SUPABASE_URL && !!SERVICE_KEY)
};

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, `${day}.json`), JSON.stringify(snapshot, null, 2) + "\n");

// README: the latest row and a 30-day table from the files on disk.
const files = readdirSync(OUT).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-30);
const rows = files.map((f) => JSON.parse(readFileSync(path.join(OUT, f), "utf8")));
const cell = (v) => (v === null || v === undefined ? "—" : String(v));
const table = rows.map((r) => `| ${r.day} | ${cell(r.search?.lastDay?.impressions)} | ${cell(r.search?.lastDay?.clicks)} | ${cell(r.analytics?.lastDay?.sessions)} | ${cell(r.funnel?.signedUp)} | ${cell(r.funnel?.connected)} | ${cell(r.funnel?.tradedLive)} | ${cell(r.funnel?.paying)} |`).join("\n");
const latest = snapshot;
writeFileSync(path.join(OUT, "README.md"), `# Growth metrics

Written daily by \`.github/workflows/metrics-snapshot.yml\`. Agents read
these files; the Google credentials never leave CI. A dash means the source
is not connected yet, not zero.

## Latest — ${latest.day}

- Search Console, last 28 days: ${latest.search?.last28 ? `${latest.search.last28.impressions} impressions, ${latest.search.last28.clicks} clicks, CTR ${(latest.search.last28.ctr * 100).toFixed(1)}%` : latest.search?.unavailable || "—"}
- GA4, last 28 days: ${latest.analytics?.last28 ? `${latest.analytics.last28.users} users, ${latest.analytics.last28.sessions} sessions` : latest.analytics?.unavailable || "—"}
- Funnel: ${latest.funnel?.signedUp !== undefined ? `${latest.funnel.signedUp} signed up (${latest.funnel.signedUpLast7} this week) → ${latest.funnel.connected} connected → ${latest.funnel.traded} traded → ${latest.funnel.tradedLive} traded live → ${latest.funnel.paying} paying` : latest.funnel?.unavailable || "—"}
- Target (docs/growth/plan-100.md): 100 paying by 2026-12-31.

## Last ${rows.length} days

| Day | Impressions | Clicks | Sessions | Signed up | Connected | Traded live | Paying |
| --- | --- | --- | --- | --- | --- | --- | --- |
${table}
`);

// Same row into the database for the KPI panel.
if (SUPABASE_URL && SERVICE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/growth_metrics?on_conflict=day`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ day, search: snapshot.search, analytics: snapshot.analytics, funnel: snapshot.funnel })
  });
  if (!res.ok) console.error(`growth_metrics upsert: ${res.status} ${await res.text()}`);
}
console.log(`metrics-snapshot: wrote ${OUT}/${day}.json`);
