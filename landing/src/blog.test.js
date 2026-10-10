import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, groupByCategory, postsInCategory, syllabusOrder, neighbours, related, renderFeed } from "./blog.js";
import { markdown } from "./render.js";

const P = (slug, category, series_order, published_at = "2026-09-01T00:00:00Z") => ({ slug, category, series_order, published_at, title: slug, excerpt: `about ${slug}` });
const posts = [
  P("what-is-an-option", "foundations", 1, "2026-09-03T11:00:00Z"),
  P("calls-and-puts", "foundations", 2, "2026-09-04T11:00:00Z"),
  P("strike-expiry-premium", "foundations", 3, "2026-09-05T11:00:00Z"),
  P("delta", "foundations", null, "2026-09-06T11:00:00Z"),
  P("return-on-risk", "measuring", 59, "2026-08-29T00:00:00Z"),
  P("one-position-not-two-legs", "managing", 50, "2026-08-29T00:00:00Z")
];

test("six categories, fixed order, hubs only for categories with posts", () => {
  assert.equal(CATEGORIES.length, 6);
  const groups = groupByCategory(posts);
  assert.deepEqual(groups.map((g) => g.slug), ["foundations", "managing", "measuring"]);
  assert.equal(groups[0].posts.length, 4);
});

test("a HUB lists newest first, whatever the syllabus numbers say", () => {
  // The owner: "The order is not stable." It was consistent -- series_order
  // ascending -- but series_order does not track dates, so one hub read
  // oldest-first and another newest-first from the same rule, and a reader
  // seeing only dates had no rule to learn.
  assert.deepEqual(
    postsInCategory(posts, "foundations").map((p) => p.slug),
    ["delta", "strike-expiry-premium", "calls-and-puts", "what-is-an-option"]
  );
});

test("a hub's order does NOT depend on series_order", () => {
  // The bug's shape: two posts whose numbers run opposite to their dates. The
  // hub must read the same way as every other hub regardless.
  const odd = [
    P("older-but-lower-number", "managing", 48, "2026-09-02T00:00:00Z"),
    P("newer-but-higher-number", "managing", 50, "2026-08-29T00:00:00Z")
  ];
  assert.deepEqual(
    postsInCategory(odd, "managing").map((p) => p.slug),
    ["older-but-lower-number", "newer-but-higher-number"]
  );
});

test("syllabus order is still available, and is by number not date", () => {
  // Foundations is a course: post 1 is the definition, post 5 the bid-ask
  // spread. That sequence still drives prev/next at the foot of a post.
  assert.deepEqual(
    syllabusOrder(posts, "foundations").map((p) => p.slug),
    ["what-is-an-option", "calls-and-puts", "strike-expiry-premium", "delta"]
  );
});

test("neighbours walk the SYLLABUS, not the hub listing", () => {
  const { prev, next } = neighbours(posts, posts[1]);
  assert.equal(prev.slug, "what-is-an-option");
  assert.equal(next.slug, "strike-expiry-premium");
  assert.equal(neighbours(posts, posts[0]).prev, null);
  assert.equal(neighbours(posts, posts[4]).next, null);
});

test("related never includes the post itself or its neighbours, same category first", () => {
  const r = related(posts, posts[1], 3).map((p) => p.slug);
  assert.ok(!r.includes("calls-and-puts"));
  assert.ok(!r.includes("what-is-an-option") && !r.includes("strike-expiry-premium"));
  assert.equal(r[0], "delta");
  assert.equal(r.length, 3);
});

test("the feed is newest first, escapes markup, and carries the category", () => {
  const xml = renderFeed([...posts, P("a<b", "income", 15, "2026-09-07T00:00:00Z")], "https://deltamint.app");
  assert.ok(xml.indexOf("<title>a&lt;b</title>") < xml.indexOf("<title>delta</title>"));
  assert.match(xml, /<category>income<\/category>/);
  assert.ok(!xml.includes("<title>a<b"));
});

// A list item wrapped onto a second line is the normal way to write markdown
// in an 80-column file. It used to render as a paragraph with literal dashes
// in it, and content:check could not see the difference because it reads the
// source, not the output.
test("a wrapped list item folds into one <li>", () => {
  const out = markdown("- **One.** wrapped item that continues\n  onto a second line\n- **Two.** short");
  assert.match(out, /^<ul>/);
  assert.match(out, /<li><strong>One\.<\/strong> wrapped item that continues onto a second line<\/li>/);
  assert.equal(out.match(/<li>/g).length, 2);
});

test("a paragraph containing a dash is not a list", () => {
  assert.match(markdown("Just a paragraph with a - dash inside it."), /^<p>/);
});

// The owner shared dev-landing on Telegram and got the new words over the OLD
// card: the static pages name the card by its production address.
import { rehostAssets } from "./index.js";

test("off production, the share image is served from the site being shared", () => {
  const html = '<meta property="og:image" content="https://deltamint.app/assets/og-card.png?v=abc" />';
  assert.equal(
    rehostAssets(html, "https://dev-landing.deltamint.app"),
    '<meta property="og:image" content="https://dev-landing.deltamint.app/assets/og-card.png?v=abc" />'
  );
});

test("production pages are left exactly as they are", () => {
  const html = '<meta property="og:image" content="https://deltamint.app/assets/og-card.png?v=abc" />';
  assert.equal(rehostAssets(html, "https://deltamint.app"), html);
  assert.equal(rehostAssets(html, undefined), html);
});

test("only asset URLs move; links to production pages stay put", () => {
  const html = '<link rel="canonical" href="https://deltamint.app/terms" />';
  assert.equal(rehostAssets(html, "https://dev-landing.deltamint.app"), html);
});

// SEARCH TITLE. The line Google gets in <title> can differ from the headline
// on the page, the way big sites do it. It is stored as a comment line at the
// top of the body (no column for it), so it must never reach the page as text.
import { splitSearchTitle, withSearchTitle } from "./render.js";
import { renderPost } from "./index.js";

const POST = {
  slug: "what-is-an-options-contract",
  title: "What is an options contract — and what lands in your account",
  category: "foundations",
  author: "DeltaMint",
  published_at: "2026-09-08T10:00:00Z",
  excerpt: "Every field but the price is fixed.",
  meta_description: "One option contract is 100 shares."
};

test("search title: stored at the top of the body, read back exactly", () => {
  const body = withSearchTitle("How many shares in an option contract?", "First paragraph.\n\n## A heading");
  assert.deepEqual(splitSearchTitle(body), { searchTitle: "How many shares in an option contract?", body: "First paragraph.\n\n## A heading" });
  assert.deepEqual(splitSearchTitle("No marker."), { searchTitle: null, body: "No marker." });
  assert.equal(withSearchTitle(undefined, "Body."), "Body.");
});

test("search title: Google gets it, the page keeps its headline, the marker never shows", () => {
  const html = renderPost({ ...POST, body: withSearchTitle("How many shares in an option contract? 100", "One contract is 100 shares.") }, "https://deltamint.app", false);
  assert.match(html, /<title>How many shares in an option contract\? 100<\/title>/);
  assert.match(html, /<meta property="og:title" content="How many shares in an option contract\? 100" \/>/);
  assert.match(html, /<h1>What is an options contract — and what lands in your account<\/h1>/);
  assert.match(html, /<p>One contract is 100 shares\.<\/p>/);
  assert.doesNotMatch(html, /search_title/);
});

test("search title: a post without one uses its headline for both", () => {
  const html = renderPost({ ...POST, body: "One contract is 100 shares." }, "https://deltamint.app", false);
  assert.match(html, /<title>What is an options contract — and what lands in your account<\/title>/);
  assert.match(html, /<h1>What is an options contract — and what lands in your account<\/h1>/);
});
