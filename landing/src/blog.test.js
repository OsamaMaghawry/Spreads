import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, groupByCategory, postsInCategory, neighbours, related, renderFeed } from "./blog.js";

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

test("posts in a category follow syllabus order; unordered posts come last", () => {
  assert.deepEqual(postsInCategory(posts, "foundations").map((p) => p.slug), ["what-is-an-option", "calls-and-puts", "strike-expiry-premium", "delta"]);
});

test("neighbours are the previous and next in the same category", () => {
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
