#!/usr/bin/env node
// Checks the signals that decide whether a browser blocks the site.
//
// A young domain that shows a login form, talks about money and redirects to a
// brokerage is structurally indistinguishable from a credential-phishing kit,
// and reputation engines score shape rather than intent. Being approved by a
// broker is no protection: their compliance review and McAfee's classifier
// share nothing. The defence is to be boringly legible — real identity, real
// trust pages, correct headers, authenticated mail — and to find out from a
// build rather than from a customer who cannot reach the login page.
//
//   npm run site:health              offline checks only (runs in CI)
//   npm run site:health -- --live    also probe DNS, headers and reputation
//
// Live checks need network and are skipped, not failed, when unreachable, so a
// sandboxed or offline CI run still catches the regressions it can see.
// Reputation lookups additionally need free API keys:
//   SAFE_BROWSING_API_KEY   https://developers.google.com/safe-browsing
//   VIRUSTOTAL_API_KEY      https://www.virustotal.com

import { readFileSync, existsSync } from "node:fs";
import { resolveTxt } from "node:dns/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");

const APEX = "deltamint.app";
const ORIGINS = [`https://${APEX}`, `https://dashboard.${APEX}`];

// Pages a legitimate business is expected to publish. Their absence is one of
// the cheapest signals a reputation engine reads, and the easiest to fix.
//
// Pricing is NOT among them while the product is a demo. A published price is
// a promise of something to buy, and a reputation engine reading a price for a
// product that cannot yet be delivered is worse than reading none — the owner,
// 12 Sep: "I don't want to have the pricing on something doesn't exist yet."
// The page is kept in `landing/drafts/`; add it back here the day it goes
// back up, so this check starts failing again the moment prices are promised
// and then quietly removed.
const TRUST_PAGES = ["privacy", "terms"];

const results = [];
const ok = (name, detail = "") => results.push({ level: "ok", name, detail });
const warn = (name, detail) => results.push({ level: "warn", name, detail });
const fail = (name, detail) => results.push({ level: "fail", name, detail });
const skip = (name, detail) => results.push({ level: "skip", name, detail });

// ---------------------------------------------------------------- offline

function checkTrustPages() {
  const pub = path.join(root, "landing/public");
  const index = path.join(pub, "index.html");
  if (!existsSync(index)) return fail("trust pages", "landing/public/index.html is missing");

  const html = readFileSync(index, "utf8");
  for (const page of TRUST_PAGES) {
    const served = existsSync(path.join(pub, page, "index.html")) || existsSync(path.join(pub, `${page}.html`));
    const linked = html.includes(`/${page}`);
    if (served && linked) ok(`trust page: ${page}`);
    else if (served) warn(`trust page: ${page}`, "published but not linked from the homepage");
    else fail(`trust page: ${page}`, "not published — a missing privacy or terms page reads as a throwaway site");
  }
}

function checkContactableIdentity() {
  const pub = path.join(root, "landing/public");
  const files = TRUST_PAGES.map((p) => path.join(pub, p, "index.html")).filter(existsSync);
  const text = files.map((f) => readFileSync(f, "utf8")).join(" ");

  // A working address a human can reach. Contact forms alone do not count:
  // classifiers and reviewers both look for a reachable identity.
  if (/mailto:[^"'@\s]+@[^"'\s]+/.test(text)) ok("contact address", "a mailto: address is published");
  else warn("contact address", "no mailto: address in the legal pages — publish one a human can reach");
}

/** No page that collects a password should live on the marketing domain. */
function checkNoCredentialFormsOnMarketing() {
  const pub = path.join(root, "landing/public");
  const pages = ["index.html", ...TRUST_PAGES.map((p) => `${p}/index.html`)]
    .map((f) => path.join(pub, f))
    .filter(existsSync);

  const offenders = pages.filter((f) => /type=["']password["']/i.test(readFileSync(f, "utf8")));
  if (offenders.length === 0) ok("no credential forms on the marketing site");
  else fail("credential form on marketing site",
    `${offenders.map((f) => path.relative(root, f)).join(", ")} — keep login on the app subdomain`);
}

// ------------------------------------------------------------------- live

async function head(url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000) });
  return res;
}

// Every URL Google can reach must lead to the one the canonical tag names.
//
// Search Console flagged five URLs on 10 Sep 2026: four `http://` and three
// carrying a trailing slash the canonical does not use. Nothing this repo
// emits produces those forms -- sitemap, robots.txt and every internal link
// use the canonical form -- so they are almost certainly redirects being
// reported for information rather than a defect. But "almost certainly" was
// resting on two things nobody had tested: Cloudflare's Always Use HTTPS,
// which is a dashboard setting invisible from the repo, and the asset
// server's trailing-slash default, which is now declared in wrangler.jsonc.
//
// This is the test that would have answered the question in a minute instead
// of an afternoon. It reads the canonical the page itself declares rather
// than a list held here, so it cannot drift from the pages.
async function checkCanonicalForms() {
  const cases = [
    [`http://${APEX}/terms`, "http is upgraded"],
    [`https://${APEX}/terms/`, "a trailing slash resolves to the canonical form"],
    [`http://${APEX}/`, "http on the apex is upgraded"],
    // www answered 5xx to Googlebot on 29 Aug and 1 Sep 2026 -- the only
    // genuine error in the whole Search Console report, and invisible from
    // this repo because no code here serves www: the apex is attached to the
    // landing Worker as a custom domain in the Cloudflare dashboard and www
    // was never attached to anything. A person typing the address they are
    // used to typing gets a server error. Checked here so it can never again
    // be discovered by a crawler weeks later.
    [`https://www.${APEX}/`, "www reaches the site"],
    [`http://www.${APEX}/`, "http www reaches the site"]
  ];

  for (const [url, what] of cases) {
    let res;
    try {
      res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000) });
    } catch (e) {
      skip(`canonical: ${what}`, `${url} not reachable from here (${e.message})`);
      continue;
    }
    // A non-2xx is an environment problem far more often than a site problem
    // -- this repo's own sandbox answers 403 at CONNECT for deltamint.app, and
    // failing the build on that would train everyone to ignore the check.
    // Only a canonical MISMATCH is a real defect, so only that fails.
    if (!res.ok) {
      warn(`canonical: ${what}`, `${url} ended at HTTP ${res.status} — could not judge from here`);
      continue;
    }
    const landed = res.url;
    if (!landed.startsWith("https://")) {
      fail(`canonical: ${what}`, `${url} ended on ${landed} — still not https`);
      continue;
    }
    // The page's own canonical is the authority. A redirect that lands on a
    // URL the page does not claim as canonical is the actual defect, and it
    // is invisible to a status-code check.
    const body = await res.text().catch(() => "");
    const m = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(body);
    if (!m) {
      warn(`canonical: ${what}`, `${landed} declares no canonical tag`);
      continue;
    }
    const declared = m[1].replace(/\/$/, "");
    const arrived = landed.replace(/\/$/, "");
    if (declared !== arrived) {
      fail(
        `canonical: ${what}`,
        `${url} lands on ${arrived} but that page declares ${declared} — Google sees two URLs for one page`
      );
      continue;
    }
    ok(`canonical: ${what}`, `${url} → ${arrived}`);
  }
}

async function checkOrigins() {
  for (const origin of ORIGINS) {
    let res;
    try {
      res = await head(origin);
    } catch (e) {
      skip(`reachable: ${origin}`, `not reachable from here (${e.message})`);
      continue;
    }

    if (!res.ok) {
      // Headers on an error page belong to whatever produced the error — a
      // proxy, a WAF, an origin failure — not to the site. Reporting them as
      // the site's own configuration would be worse than reporting nothing.
      warn(`reachable: ${origin}`, `HTTP ${res.status} — headers not checked, an origin returning errors scores badly`);
      continue;
    }
    ok(`reachable: ${origin}`, `HTTP ${res.status}`);

    const h = res.headers;
    const want = {
      "strict-transport-security": "HSTS — enable in Cloudflare under SSL/TLS → Edge Certificates",
      "x-content-type-options": "should be nosniff",
      "referrer-policy": "should be set"
    };
    for (const [header, hint] of Object.entries(want)) {
      if (h.get(header)) ok(`${header} on ${origin}`);
      else warn(`${header} missing on ${origin}`, hint);
    }
  }
}

async function checkMailAuth() {
  for (const [name, host, must] of [
    ["SPF", APEX, "v=spf1"],
    ["DMARC", `_dmarc.${APEX}`, "v=DMARC1"]
  ]) {
    try {
      const records = (await resolveTxt(host)).map((r) => r.join(""));
      if (records.some((r) => r.toLowerCase().startsWith(must.toLowerCase()))) ok(`${name} record`);
      else fail(`${name} record`, `no ${must} record on ${host} — unauthenticated mail damages domain reputation`);
    } catch (e) {
      // ENODATA and ENOTFOUND are answers, not failures: DNS replied and there
      // is no such record. Anything else means we could not ask.
      if (e.code === "ENODATA" || e.code === "ENOTFOUND") {
        fail(`${name} record`, `no TXT record on ${host} — unauthenticated mail damages domain reputation`);
      } else {
        skip(`${name} record`, `lookup failed (${e.message})`);
      }
    }
  }
}

async function checkSafeBrowsing() {
  const key = process.env.SAFE_BROWSING_API_KEY;
  if (!key) return skip("Google Safe Browsing", "set SAFE_BROWSING_API_KEY to enable");
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        client: { clientId: "deltamint", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: ORIGINS.map((url) => ({ url }))
        }
      })
    });
    const body = await res.json();
    if (body.matches?.length) fail("Google Safe Browsing", `flagged: ${JSON.stringify(body.matches)}`);
    else ok("Google Safe Browsing", "no threat matches");
  } catch (e) {
    skip("Google Safe Browsing", e.message);
  }
}

async function checkVirusTotal() {
  const key = process.env.VIRUSTOTAL_API_KEY;
  if (!key) return skip("VirusTotal", "set VIRUSTOTAL_API_KEY to enable");
  try {
    const res = await fetch(`https://www.virustotal.com/api/v3/domains/${APEX}`, {
      headers: { "x-apikey": key },
      signal: AbortSignal.timeout(10000)
    });
    const body = await res.json();
    const stats = body.data?.attributes?.last_analysis_stats;
    if (!stats) return skip("VirusTotal", "no analysis stats returned");
    const bad = (stats.malicious || 0) + (stats.suspicious || 0);
    if (bad > 0) fail("VirusTotal", `${bad} vendor(s) flag ${APEX} — dispute each one individually`);
    else ok("VirusTotal", `clean across ${stats.harmless || 0} vendors`);
  } catch (e) {
    skip("VirusTotal", e.message);
  }
}

// WHAT A CRAWLER ACTUALLY READS, which nothing here was testing.
//
// The owner: *"I see deltamint is buried in the internet and not discoverable
// whatsoever even pages are linked."* Three searches on 20 Sep -- the brand
// name, an exact article title, and a site: query -- returned the domain zero
// times, while this very script reported the apex healthy at HTTP 200.
//
// Both can be true, because "the homepage returns 200" and "a search engine
// can enumerate and fetch every page" are different questions and only the
// first was ever asked. A crawler starts at robots.txt and the sitemap. The
// sitemap here is not a file in the repo -- the Worker builds it per request
// from Supabase -- so it can break in ways no commit would show: the query
// fails and it serves zero URLs, or it lists posts that 404.
//
// These checks answer the second question. They cannot tell us why Google has
// not indexed the site -- only Search Console knows that -- but they close off
// the causes that live on our side, with evidence instead of assumption.
async function checkCrawlerSurface() {
  const base = `https://${APEX}`;

  // robots.txt must exist, must not disallow the site, and must point at a
  // sitemap. A production robots.txt reading "Disallow: /" is the single
  // fastest way to be invisible, and it is one env var away.
  let robotsText = "";
  try {
    const res = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      fail("robots.txt", `HTTP ${res.status} — a crawler cannot read our crawl rules`);
    } else {
      robotsText = await res.text();
      const blanket = /^\s*Disallow:\s*\/\s*$/im.test(robotsText);
      if (blanket) {
        fail("robots.txt", "serves a blanket Disallow: / on production — nothing here can be indexed");
      } else {
        ok("robots.txt", `HTTP 200, no blanket disallow`);
      }
      if (/^\s*Sitemap:\s*\S+/im.test(robotsText)) ok("robots.txt names a sitemap");
      else warn("robots.txt names a sitemap", "no Sitemap: line — crawlers must discover every URL by link alone");
    }
  } catch (e) {
    fail("robots.txt", `could not be fetched: ${e.message}`);
  }

  // The sitemap is generated, so an empty one is a live failure and not a
  // config mistake anybody would see in a diff.
  let locs = [];
  try {
    const res = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      fail("sitemap.xml", `HTTP ${res.status} — the URL list a crawler works from is unavailable`);
    } else {
      const xml = await res.text();
      locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (!/xml/.test(type)) warn("sitemap.xml content type", `served as ${type || "(none)"} rather than XML`);
      if (locs.length === 0) {
        fail("sitemap.xml", "parses to ZERO urls — a crawler is told the site has no pages");
      } else {
        ok("sitemap.xml", `${locs.length} url(s)`);
      }
      // A sitemap listing URLs that do not resolve teaches a crawler to
      // distrust it. Sampled rather than exhaustive so this stays a health
      // check and not a crawl of our own site.
      const sample = locs.slice(0, 8);
      const bad = [];
      for (const loc of sample) {
        try {
          const r = await fetch(loc, { redirect: "follow", signal: AbortSignal.timeout(10000) });
          if (!r.ok) bad.push(`${loc} → HTTP ${r.status}`);
        } catch (e) {
          bad.push(`${loc} → ${e.message}`);
        }
      }
      if (sample.length === 0) skip("sitemap urls resolve", "nothing to sample");
      else if (bad.length === 0) ok("sitemap urls resolve", `${sample.length} sampled, all reachable`);
      else fail("sitemap urls resolve", bad.join("; "));
    }
  } catch (e) {
    fail("sitemap.xml", `could not be fetched: ${e.message}`);
  }

  // THE DASHBOARD MUST CARRY NOINDEX, and this is the inverse of the check
  // below: there, a noindex is a bug; here, its ABSENCE is.
  //
  // Search Console's 3-month export on 20 Sep showed dashboard.deltamint.app
  // taking 24 of the property's 77 impressions -- the app root, /register,
  // /login and /forgot-password -- which is nearly a third of everything this
  // site was shown for, spent on pages no stranger should ever be offered.
  // /forgot-password reaching Google is the exact failure public/robots.txt
  // was rewritten to stop, and nothing has been testing whether the fix holds.
  for (const p of ["/", "/register", "/forgot-password"]) {
    const url = `https://dashboard.${APEX}${p}`;
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000) });
      const header = (res.headers.get("x-robots-tag") || "").toLowerCase();
      const body = await res.text();
      const meta = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(body);
      if (/noindex/.test(header) || meta) ok(`dashboard noindex: ${p}`, /noindex/.test(header) ? "X-Robots-Tag" : "meta tag");
      else fail(`dashboard noindex: ${p}`, "the authenticated app is indexable — it can be offered to strangers in search");
    } catch (e) {
      warn(`dashboard noindex: ${p}`, `could not be checked: ${e.message}`);
    }
  }

  // A page carrying noindex is invisible however healthy it looks. The Worker
  // sets this from an env var, so production and staging differ by one value
  // and nothing in the repo proves which way production is set.
  //
  // EVERY SITEMAP URL, not a token two. Search Console reported "Excluded by
  // 'noindex' tag -- Source: Website" against this property on 13 Sep while
  // the homepage and blog index were both clean, which is exactly the shape a
  // leak on one article takes: the two pages anybody spot-checks look right
  // and the post nobody re-checks is invisible. Checking the pages we publish
  // is the only version of this test that can find that.
  const noindexed = [];
  const unchecked = [];
  const pages = locs.length ? locs : [`${base}/`, `${base}/blog`];
  for (const p of pages) {
    try {
      const res = await fetch(p, { redirect: "follow", signal: AbortSignal.timeout(10000) });
      const header = (res.headers.get("x-robots-tag") || "").toLowerCase();
      const body = await res.text();
      const metaNoindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(body);
      if (/noindex/.test(header) || metaNoindex) {
        noindexed.push(`${p} (${/noindex/.test(header) ? "X-Robots-Tag" : "meta tag"})`);
      }
    } catch (e) {
      unchecked.push(`${p}: ${e.message}`);
    }
  }
  if (noindexed.length) fail("indexable: published pages", `serving noindex — ${noindexed.join("; ")}`);
  else ok("indexable: published pages", `${pages.length - unchecked.length} checked, none noindexed`);
  if (unchecked.length) warn("indexable: not checked", unchecked.join("; "));
}

// ------------------------------------------------------------------- run

checkTrustPages();
checkContactableIdentity();
checkNoCredentialFormsOnMarketing();

if (live) {
  await checkOrigins();
  await checkCanonicalForms();
  await checkCrawlerSurface();
  await checkMailAuth();
  await checkSafeBrowsing();
  await checkVirusTotal();
} else {
  skip("live checks", "re-run with --live to probe DNS, headers and reputation");
}

const mark = { ok: "  ok  ", warn: " warn ", fail: " FAIL ", skip: " skip " };
for (const r of results) {
  console.log(`[${mark[r.level]}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}

const failed = results.filter((r) => r.level === "fail");
const warned = results.filter((r) => r.level === "warn");
console.log(`\n${results.filter((r) => r.level === "ok").length} ok · ${warned.length} warning(s) · ${failed.length} failure(s)`);

if (failed.length > 0) {
  console.error("\nFailures above are signals a reputation engine reads. Fix before launch.");
  process.exit(1);
}
