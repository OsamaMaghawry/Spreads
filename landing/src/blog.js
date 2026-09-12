// The blog's shape: categories, hub pages, what to read next, the feed.
//
// Pure functions over the rows the Worker fetches, kept apart from index.js
// so they can be tested with node --test and no network. The six categories
// match the check constraint on blog_posts.category; a post can carry no
// other value, so nothing here needs a fallback branch for an unknown one.

export const CATEGORIES = [
  { slug: "foundations", title: "Options, from the start", intro: "Contracts, prices, Greeks, volatility, assignment and margin — the vocabulary everything else uses." },
  { slug: "income", title: "Income strategies", intro: "Selling premium: covered calls, cash-secured puts, the wheel, credit spreads, condors and calendars." },
  { slug: "hedging", title: "Hedging with options", intro: "Protecting what you hold: protective puts, collars, spreads as insurance, and what volatility products do and do not do." },
  { slug: "investing", title: "Options for investors", intro: "Long-dated positions and stock replacement for people who hold for years." },
  { slug: "managing", title: "After the fill", intro: "Holding, rolling, adjusting, closing — and what breaks when the position count outgrows attention." },
  { slug: "measuring", title: "Measuring results", intro: "What a result is, return on risk, capital at risk, and records that mean something." }
];

export const categoryBySlug = (slug) => CATEGORIES.find((c) => c.slug === slug) || null;

// Posts inside a category, NEWEST FIRST. One rule for every hub.
//
// The owner, reading the blog index: *"The order is not stable. In the second
// one is okay, but first one the new is in the top."*
//
// The old sort was `series_order` ascending, falling back to newest first —
// and it was consistent, which is exactly why it looked broken. `series_order`
// does not track dates: foundations holds 1-5 (7 Sep → 11 Sep, so it read
// oldest-first) while "After the fill" holds 48 and 50 (2 Sep, then 29 Aug, so
// it read newest-first). Two sections, two apparent orderings, from one rule.
// A reader cannot see the numbers, only the dates, so the page had no rule
// they could learn.
//
// Newest first everywhere. It is the ordering a reader already expects from
// anything dated, and being the SAME everywhere is most of the value.
export function postsInCategory(posts, slug) {
  return posts
    .filter((p) => p.category === slug)
    .sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
}

// The same posts in SYLLABUS order — `series_order` ascending, unnumbered
// posts last, oldest first among equals.
//
// Kept, and used where sequence genuinely means something: "previous" and
// "read next" at the foot of a post. Foundations is a course — post 1 is the
// definition of a contract and post 5 is the bid-ask spread, on purpose — so a
// reader working through it should be handed the next lesson, not the next
// most recent article. What changed is that this ordering no longer decides
// how a HUB is listed, where the reader is browsing rather than studying.
export function syllabusOrder(posts, slug) {
  return posts
    .filter((p) => p.category === slug)
    .sort((a, b) => {
      const ao = a.series_order ?? Infinity, bo = b.series_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return String(a.published_at || "").localeCompare(String(b.published_at || ""));
    });
}

// Categories that have at least one post, each with its posts, in the fixed
// category order. An empty category has no hub link on the index -- a hub
// page with "no posts yet" is a page nobody should land on.
export function groupByCategory(posts) {
  return CATEGORIES.map((c) => ({ ...c, posts: postsInCategory(posts, c.slug) })).filter((c) => c.posts.length > 0);
}

// Previous and next inside the same category, by SYLLABUS order — the one
// place sequence is the point rather than recency.
export function neighbours(posts, post) {
  const list = syllabusOrder(posts, post.category);
  const i = list.findIndex((p) => p.slug === post.slug);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
}

// Up to n other posts to read: same category first (excluding the post and
// its immediate neighbours, which already have their own links), then the
// newest from elsewhere. Never the post itself.
export function related(posts, post, n = 3) {
  const { prev, next } = neighbours(posts, post);
  const skip = new Set([post.slug, prev?.slug, next?.slug].filter(Boolean));
  const same = syllabusOrder(posts, post.category).filter((p) => !skip.has(p.slug));
  const others = posts
    .filter((p) => p.category !== post.category && !skip.has(p.slug))
    .sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
  return [...same, ...others].slice(0, n);
}

const escXml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// RSS 2.0, newest first, twenty items. Plain text descriptions: the excerpt,
// not the body, so a reader sees what the post is and comes to the site.
export function renderFeed(posts, site) {
  const items = [...posts]
    .sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")))
    .slice(0, 20)
    .map((p) => `    <item>
      <title>${escXml(p.title)}</title>
      <link>${site}/blog/${escXml(p.slug)}</link>
      <guid isPermaLink="true">${site}/blog/${escXml(p.slug)}</guid>
      <pubDate>${new Date(p.published_at || 0).toUTCString()}</pubDate>
      <category>${escXml(p.category)}</category>
      <description>${escXml(p.excerpt || p.meta_description || "")}</description>
    </item>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>DeltaMint blog</title>
    <link>${site}/blog</link>
    <description>Options, explained from the first contract to the last position — for people who trade through their own account.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;
}
