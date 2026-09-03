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

// Posts inside a category, in syllabus order where one is set, else newest
// first. A post with no series_order sorts after those with one.
export function postsInCategory(posts, slug) {
  return posts
    .filter((p) => p.category === slug)
    .sort((a, b) => {
      const ao = a.series_order ?? Infinity, bo = b.series_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return String(b.published_at || "").localeCompare(String(a.published_at || ""));
    });
}

// Categories that have at least one post, each with its posts, in the fixed
// category order. An empty category has no hub link on the index -- a hub
// page with "no posts yet" is a page nobody should land on.
export function groupByCategory(posts) {
  return CATEGORIES.map((c) => ({ ...c, posts: postsInCategory(posts, c.slug) })).filter((c) => c.posts.length > 0);
}

// Previous and next inside the same category, by syllabus order.
export function neighbours(posts, post) {
  const list = postsInCategory(posts, post.category);
  const i = list.findIndex((p) => p.slug === post.slug);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
}

// Up to n other posts to read: same category first (excluding the post and
// its immediate neighbours, which already have their own links), then the
// newest from elsewhere. Never the post itself.
export function related(posts, post, n = 3) {
  const { prev, next } = neighbours(posts, post);
  const skip = new Set([post.slug, prev?.slug, next?.slug].filter(Boolean));
  const same = postsInCategory(posts, post.category).filter((p) => !skip.has(p.slug));
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
