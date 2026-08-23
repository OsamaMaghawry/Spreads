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
const TRUST_PAGES = ["privacy", "terms", "pricing"];

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

// ------------------------------------------------------------------- run

checkTrustPages();
checkContactableIdentity();
checkNoCredentialFormsOnMarketing();

if (live) {
  await checkOrigins();
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
