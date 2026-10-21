// Telling search engines about the site's pages, so nobody has to.
//
// 21 Oct 2026. The daily SEO run ended every report with ten links for the
// owner to press "Request indexing" on, one by one, in Search Console. The
// owner: "I won't do this. Figure it out." and "I'm not building agents to
// just report. I need actions." So the snapshot does what can be done
// automatically, every day, and records what it did:
//
//   GOOGLE. The Search Console API cannot press "Request indexing" -- that
//   button has no API for ordinary pages. Google's Indexing API exists but is
//   only for job postings and livestream pages, and Google revokes access for
//   using it on anything else, which on a finance site is not a risk worth
//   taking. What the API CAN do is submit the sitemap, which asks Google to
//   re-read the whole list. That is done whenever the sitemap changes (a new
//   post, a new page), or when Google has not read it for a week.
//
//   BING and the engines that share IndexNow (Yandex, Seznam, Naver; Bing's
//   index also feeds ChatGPT search, Copilot and DuckDuckGo). IndexNow takes
//   the URLs directly. Every new or changed URL is sent once. The key is
//   public by design: it is the file at the site root that proves the site
//   asked.
//
// The decisions are pure functions, tested in searchSubmit.test.mjs; the
// network calls are thin and their outcomes are written into the snapshot.

import { createHash } from "node:crypto";

export const INDEXNOW_KEY = "8b62b8a4ab3d56d58e2397ca07208234";
const STALE_DAYS = 7;

/** Every <url> in a sitemap, with its lastmod where it has one. */
export function parseSitemap(xml) {
  return [...String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => ({
      loc: (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/) || [])[1] || null,
      lastmod: (m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/) || [])[1] || ""
    }))
    .filter((e) => e.loc);
}

/** One string that changes whenever a URL is added, removed or modified. */
export function sitemapFingerprint(entries) {
  const lines = entries.map((e) => `${e.loc} ${e.lastmod}`).sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

/**
 * Why the sitemap should be submitted to Google today, or null.
 * `lastDownloaded` is when Google last read it, from the Sitemaps API.
 */
export function sitemapReason({ fingerprint, submittedFingerprint, lastDownloaded, now = Date.now() }) {
  if (!submittedFingerprint) return "first submission from the daily job";
  if (fingerprint !== submittedFingerprint) return "the sitemap changed";
  const read = Date.parse(lastDownloaded || "");
  if (!Number.isFinite(read)) return "Google has no record of reading it";
  if (now - read > STALE_DAYS * 86400000) return `Google has not read it for over ${STALE_DAYS} days`;
  return null;
}

/** The URLs IndexNow has not been told about in their current form. */
export function indexNowBatch(entries, sent = {}) {
  return entries.filter((e) => !(e.loc in sent) || sent[e.loc] !== e.lastmod).map((e) => e.loc);
}

// --- The calls ------------------------------------------------------------

const gsc = (site, feed) =>
  `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(feed)}`;

// A 403 here is a permission, not an outage: the service account can read the
// property but was not given the right to submit. Said as the fix.
function permissionHint(status, sa) {
  return status === 403
    ? `Search Console refused (403). Give ${sa?.client_email || "the metrics service account"} "Full" permission: Search Console → Settings → Users and permissions.`
    : null;
}

export async function googleSitemap({ token, site, feed, sa, state, entries }) {
  const fingerprint = sitemapFingerprint(entries);
  const read = async () => {
    const res = await fetch(gsc(site, feed), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return { known: false };
    if (!res.ok) throw new Error(permissionHint(res.status, sa) || `sitemaps.get ${res.status} ${await res.text()}`);
    const s = await res.json();
    return {
      known: true,
      lastSubmitted: s.lastSubmitted || null,
      lastDownloaded: s.lastDownloaded || null,
      isPending: !!s.isPending,
      errors: Number(s.errors) || 0,
      warnings: Number(s.warnings) || 0,
      submittedUrls: (s.contents || []).reduce((n, c) => n + (Number(c.submitted) || 0), 0)
    };
  };
  const before = await read();
  const reason = sitemapReason({ fingerprint, submittedFingerprint: state.fingerprint, lastDownloaded: before.lastDownloaded });
  if (!reason) return { submitted: false, why: "unchanged, and Google read it recently", google: before, fingerprint: state.fingerprint };
  const res = await fetch(gsc(site, feed), { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    return { submitted: false, error: permissionHint(res.status, sa) || `sitemaps.submit ${res.status} ${await res.text()}`, google: before, fingerprint: state.fingerprint };
  }
  return { submitted: true, why: reason, at: new Date().toISOString(), google: await read().catch(() => before), fingerprint };
}

export async function indexNow({ host, urls, key = INDEXNOW_KEY }) {
  if (!urls.length) return { sent: 0 };
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls.slice(0, 10000) })
  });
  // 200 accepted; 202 accepted, key still being checked. Anything else sent nothing.
  if (res.status === 200 || res.status === 202) return { sent: urls.length, status: res.status };
  const why = {
    400: "bad request", 403: "key not valid: the key file is not live at the site root yet",
    422: "URLs do not belong to the host", 429: "too many requests"
  }[res.status] || "refused";
  return { sent: 0, status: res.status, error: `IndexNow ${res.status}: ${why}` };
}
