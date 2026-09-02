// Publishes content/blog/*.md into the blog_posts table.
//
// The gap this closes: content-engine could write a finished post and commit
// it, and the post would still never exist for a reader. The only path from a
// markdown file to the live blog was a human opening the admin panel, so two
// finished posts sat in the repo while production served an empty blog for
// two weeks and five weekly agents reported around it.
//
// Publishing is now a consequence of merging, not of remembering. Idempotent:
// upserts on slug, so re-running is safe and editing a post updates it.
//
// A file is published only when its front matter says so. `draft: true`, or a
// missing title/slug/body, is skipped and named in the output — silence here
// would recreate exactly the failure this script exists to prevent.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const DIR = "content/blog";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("publish-blog: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

// Front matter is a small fixed set of scalar keys — no nesting, no lists — so
// a dependency-free parse is honest here rather than a shortcut.
function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim().replace(/^["']|["']$/g, "");
    meta[kv[1]] = v;
  }
  return { meta, body: m[2].trim() };
}

const CATEGORIES = ["foundations", "income", "hedging", "investing", "managing", "measuring"];

const files = (await readdir(DIR)).filter((f) => f.endsWith(".md"));
const rows = [];
const skipped = [];

for (const file of files) {
  const { meta, body } = parseFrontMatter(await readFile(join(DIR, file), "utf8"));
  if (String(meta.draft).toLowerCase() === "true") {
    skipped.push(`${file}: marked draft`);
    continue;
  }
  if (!meta.title || !meta.slug || !body) {
    skipped.push(`${file}: missing title, slug or body`);
    continue;
  }
  // Six categories, matching the check constraint on the table. A post with
  // no category lands in "managing" (the original pillar); a post with a
  // category outside the six is refused rather than let the insert fail on
  // the constraint with a message that names nothing.
  const category = meta.category || "managing";
  if (!CATEGORIES.includes(category)) {
    skipped.push(`${file}: category "${category}" is not one of ${CATEGORIES.join(", ")}`);
    continue;
  }
  rows.push({
    slug: meta.slug,
    title: meta.title,
    // Load-bearing, and not obvious: the public read policy is
    // `status = 'published' and published_at <= now()`. A row inserted without
    // this column is invisible to anon and the blog renders "No posts yet."
    // with no error anywhere -- the row is in the table, so the table looks
    // fine. Set it explicitly; never rely on the column default.
    status: 'published',
    excerpt: meta.excerpt || null,
    body,
    author: meta.author || "DeltaMint",
    meta_description: meta.meta_description || null,
    og_image: meta.og_image || null,
    category,
    tags: String(meta.tags || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5),
    series_order: meta.series_order ? Number(meta.series_order) || null : null,
    // Preserve an explicit date so republishing does not reorder the blog;
    // otherwise the file is live as of now. A future date is a scheduled post:
    // the same policy hides it until then, which is intended, not a bug.
    published_at: meta.published_at || new Date().toISOString()
  });
}

for (const line of skipped) console.log(`skip  ${line}`);
if (!rows.length) {
  console.log("publish-blog: nothing to publish");
  process.exit(0);
}

const res = await fetch(`${url}/rest/v1/blog_posts?on_conflict=slug`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "content-type": "application/json",
    // merge-duplicates makes this an upsert; without it a re-run 409s on slug.
    Prefer: "resolution=merge-duplicates,return=representation"
  },
  body: JSON.stringify(rows)
});

if (!res.ok) {
  console.error(`publish-blog: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const written = await res.json();
for (const r of written) console.log(`live  ${r.slug}  status=${r.status}`);

// Verify as the public sees it rather than trusting the write. The failure
// this guards against is a row that exists and is still invisible, which a
// successful insert cannot distinguish from a working blog.
const anon = process.env.SUPABASE_ANON_KEY;
if (anon) {
  const check = await fetch(`${url}/rest/v1/blog_posts?select=slug`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` }
  });
  const visible = check.ok ? (await check.json()).map((r) => r.slug) : [];
  const hidden = written.map((r) => r.slug).filter((s) => !visible.includes(s));
  if (hidden.length) {
    console.error(`publish-blog: written but NOT publicly visible: ${hidden.join(", ")}`);
    process.exit(1);
  }
  console.log(`publish-blog: ${visible.length} post(s) visible to the public`);
} else {
  console.log("publish-blog: SUPABASE_ANON_KEY not set; skipped the public-visibility check");
}
console.log(`publish-blog: ${rows.length} post(s) published`);
