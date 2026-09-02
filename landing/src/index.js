import { esc, markdown, formatDate, page } from "./render.js";
import { CATEGORIES, categoryBySlug, groupByCategory, postsInCategory, neighbours, related, renderFeed } from "./blog.js";

// Blog routes for the marketing site.
//
// Production and staging run this same code against different Supabase
// projects, so nothing here may assume a host. `SITE_URL` comes from the
// wrangler config per deployment; a hardcoded canonical previously made
// staging emit production links.
//
// Posts are read from Supabase with the anon key over REST — no SDK, so the
// Worker stays dependency-free and needs no build step. The anon key is public
// by construction (it ships in the browser bundle already) and RLS on
// `blog_posts` limits it to posts that are published and past their date, so
// this Worker cannot read a draft even if asked to.

const POST_FIELDS = "slug,title,excerpt,body,author,meta_description,og_image,published_at,updated_at,category,tags,series_order";

// Posts change rarely and are read often. Serving from the edge cache keeps a
// crawler burst off Supabase entirely — which matters on a free-tier project
// that pauses when idle.
const CACHE_SECONDS = 300;

const siteUrl = (request, env) => env.SITE_URL || new URL(request.url).origin;

// Staging must never reach an index. A `dev-landing…` URL ranking for the
// brand would compete with the real site and split its authority, so the
// non-production deployment sets NOINDEX and gets: a blanket Disallow in
// robots.txt, an X-Robots-Tag header on every response including assets and
// XML, and a meta robots tag in the HTML. Production sets none of this and is
// indexed normally.
const isNoIndex = (env) => env.NOINDEX === "1";

// Analytics on the marketing site and blog only, and only where the
// deployment carries a measurement id. The dashboard stays untracked.
function analyticsTag(env) {
  const id = env.GA_MEASUREMENT_ID;
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true});</script>`;
}

async function fetchPosts(env, { slug = null } = {}) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/blog_posts`);
  url.searchParams.set("select", POST_FIELDS);
  url.searchParams.set("order", "published_at.desc");
  if (slug) url.searchParams.set("slug", `eq.${slug}`);

  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
  return res.json();
}

// A response is never mutated in place — headers on a cached or asset response
// are immutable, so anything added has to go onto a fresh copy.
function withNoIndexHeader(response) {
  const out = new Response(response.body, response);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  return out;
}

const robotsMeta = (noindex) => (noindex ? '<meta name="robots" content="noindex, nofollow">\n' : "");

// Always noindex regardless of environment — a 404 should never be indexed
// anywhere, so this one does not take the deployment flag.
function notFound(site) {
  return new Response(
    page({
      title: "Not found — DeltaMint",
      description: "That page could not be found.",
      canonical: `${site}/blog`,
      head: '<meta name="robots" content="noindex">',
      body: `<h1>Not found</h1>
<p>That post doesn't exist, or it hasn't been published yet.</p>
<p><a href="/blog">Back to the blog</a></p>`
    }),
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function html(body) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": `public, max-age=60, s-maxage=${CACHE_SECONDS}`
    }
  });
}

function renderIndex(posts, site, noindex, env = {}) {
  const groups = groupByCategory(posts);
  const items = groups.length
    ? groups
        .map(
          (g) => `    <section class="cat">
      <h2><a href="/blog/${g.slug}">${esc(g.title)}</a></h2>
      <p class="cat-intro">${esc(g.intro)}</p>
      <ul>
${g.posts
  .slice(0, 6)
  .map(
    (p) => `        <li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a><span class="when">${esc(formatDate(p.published_at))}</span></li>`
  )
  .join("\n")}
      </ul>${g.posts.length > 6 ? `\n      <p class="more"><a href="/blog/${g.slug}">All ${g.posts.length} in ${esc(g.title)} →</a></p>` : ""}
    </section>`
        )
        .join("\n")
    : `    <p>No posts yet.</p>`;

  return page({
    title: "Blog — DeltaMint",
    description: "Options, explained from the first contract to the last position — for people who trade through their own account.",
    canonical: `${site}/blog`,
    head: `${robotsMeta(noindex)}${analyticsTag(env)}<meta property="og:type" content="website" />
<meta property="og:site_name" content="DeltaMint" />
<meta property="og:url" content="${site}/blog" />
<meta property="og:title" content="DeltaMint blog" />
<meta property="og:image" content="${site}/assets/og-card.png" />
<link rel="alternate" type="application/rss+xml" title="DeltaMint blog" href="${site}/blog/feed.xml" />`,
    body: `<h1>Blog</h1>
<p class="lede">Options, explained from the first contract to the last position. One post a day, in six series.</p>
${items}`
  });
}

function renderCategory(posts, cat, site, noindex, env = {}) {
  const list = postsInCategory(posts, cat.slug);
  const url = `${site}/blog/${cat.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cat.title,
    description: cat.intro,
    url,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: `${site}/blog` },
        { "@type": "ListItem", position: 2, name: cat.title, item: url }
      ]
    }
  };
  return page({
    title: `${cat.title} — DeltaMint`,
    description: cat.intro,
    canonical: url,
    head: `${robotsMeta(noindex)}${analyticsTag(env)}<meta property="og:type" content="website" />
<meta property="og:site_name" content="DeltaMint" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:title" content="${esc(cat.title)}" />
<meta property="og:description" content="${esc(cat.intro)}" />
<meta property="og:image" content="${site}/assets/og-card.png" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    body: `<p class="crumbs"><a href="/blog">Blog</a> › ${esc(cat.title)}</p>
<h1>${esc(cat.title)}</h1>
<p class="lede">${esc(cat.intro)}</p>
<ol class="series">
${list
  .map(
    (p) => `  <li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a>${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ""}</li>`
  )
  .join("\n")}
</ol>`
  });
}

function renderPost(post, site, noindex, env = {}, all = []) {
  const url = `${site}/blog/${post.slug}`;
  const cat = categoryBySlug(post.category);
  const { prev, next } = neighbours(all, post);
  const more = related(all, post, 3);
  const description = post.meta_description || post.excerpt || "";
  const image = post.og_image || `${site}/assets/og-card.png`;

  // BlogPosting structured data. Finance is YMYL under Google's quality
  // guidelines, so a named author and real dates carry more weight here than
  // they would on most sites.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    image,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: { "@type": "Person", name: post.author },
    publisher: { "@type": "Organization", name: "DeltaMint", url: site },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: cat ? cat.title : undefined,
    keywords: Array.isArray(post.tags) && post.tags.length ? post.tags.join(", ") : undefined
  };
  const crumbs = cat
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Blog", item: `${site}/blog` },
          { "@type": "ListItem", position: 2, name: cat.title, item: `${site}/blog/${cat.slug}` },
          { "@type": "ListItem", position: 3, name: post.title, item: url }
        ]
      }
    : null;

  return page({
    title: `${post.title} — DeltaMint`,
    description,
    canonical: url,
    head: `${robotsMeta(noindex)}${analyticsTag(env)}<meta property="og:type" content="article" />
<meta property="og:site_name" content="DeltaMint" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:title" content="${esc(post.title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="article:published_time" content="${esc(post.published_at)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(post.title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>${crumbs ? `\n<script type="application/ld+json">${JSON.stringify(crumbs)}</script>` : ""}`,
    body: `${cat ? `<p class="crumbs"><a href="/blog">Blog</a> › <a href="/blog/${cat.slug}">${esc(cat.title)}</a></p>` : ""}
<h1>${esc(post.title)}</h1>
<div class="meta">${esc(formatDate(post.published_at))}${post.author ? ` · ${esc(post.author)}` : ""}${post.series_order ? ` · part ${post.series_order}` : ""}</div>
${markdown(post.body)}
${prev || next ? `<nav class="readnext">${prev ? `<a class="prev" href="/blog/${esc(prev.slug)}"><span>Previous</span>${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a class="next" href="/blog/${esc(next.slug)}"><span>Read next</span>${esc(next.title)}</a>` : ""}</nav>` : ""}
${more.length ? `<section class="related"><h2>More to read</h2><ul>${more.map((p) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></li>`).join("")}</ul></section>` : ""}
<p class="startfree"><a class="btn btn-primary" href="https://dashboard.deltamint.app/register?ref=blog/${esc(post.slug)}">Start free on a paper account</a></p>
<p style="margin-top:40px"><a href="/blog">← All posts</a></p>`
  });
}

function renderSitemap(posts, site) {
  // Static pages plus every published post. Drafts cannot appear here because
  // RLS never returned them.
  const staticPaths = ["/", "/pricing", "/blog", "/terms", "/privacy"];
  const hubs = groupByCategory(posts).map((c) => `  <url><loc>${site}/blog/${c.slug}</loc></url>`);
  const urls = [
    ...staticPaths.map((p) => `  <url><loc>${site}${p}</loc></url>`),
    ...hubs,
    ...posts.map(
      (p) =>
        `  <url><loc>${site}/blog/${esc(p.slug)}</loc><lastmod>${esc(
          (p.updated_at || p.published_at || "").slice(0, 10)
        )}</lastmod></url>`
    )
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const site = siteUrl(request, env);
    const noindex = isNoIndex(env);

    // On a non-production deployment the Worker runs ahead of every asset
    // (run_worker_first: true), so this is the one place that can guarantee no
    // response leaves without the noindex header.
    if (noindex && path === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "X-Robots-Tag": "noindex, nofollow"
        }
      });
    }

    const isBlogPath = path === "/blog" || path.startsWith("/blog/") || path === "/sitemap.xml";
    // The home and pricing pages are static assets; the analytics tag for
    // them is injected below on the way out when a measurement id is set.
    if (!isBlogPath) {
      // Anything else is a static asset. On production the Worker is not even
      // invoked for these; on staging it is, purely to stamp the header.
      let asset = await env.ASSETS.fetch(request);
      const tag = analyticsTag(env);
      if (tag && (asset.headers.get("content-type") || "").includes("text/html")) {
        const text = await asset.text();
        asset = new Response(text.replace("</head>", `${tag}\n</head>`), asset);
      }
      return noindex ? withNoIndexHeader(asset) : asset;
    }

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    let response;
    try {
      if (path === "/sitemap.xml") {
        const posts = await fetchPosts(env);
        response = new Response(renderSitemap(posts, site), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": `public, max-age=300, s-maxage=${CACHE_SECONDS}`
          }
        });
      } else if (path === "/blog") {
        response = html(renderIndex(await fetchPosts(env), site, noindex, env));
      } else if (path === "/blog/feed.xml") {
        response = new Response(renderFeed(await fetchPosts(env), site), {
          headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": `public, max-age=300, s-maxage=${CACHE_SECONDS}` }
        });
      } else {
        const slug = decodeURIComponent(path.slice("/blog/".length));
        const cat = categoryBySlug(slug);
        if (cat) {
          response = html(renderCategory(await fetchPosts(env), cat, site, noindex, env));
        } else {
          // One fetch of everything published: the post itself plus the
          // neighbours and related list need the whole set, and it is small.
          const all = await fetchPosts(env);
          const post = all.find((p) => p.slug === slug);
          response = post ? html(renderPost(post, site, noindex, env, all)) : notFound(site);
        }
      }
    } catch (err) {
      // A database hiccup must not return a broken page to a crawler that
      // might then de-index it. 503 with no cache tells it to come back.
      return new Response(
        page({
          title: "Temporarily unavailable — DeltaMint",
          description: "The blog is temporarily unavailable.",
          canonical: `${site}/blog`,
          head: '<meta name="robots" content="noindex">',
          body: `<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>`
        }),
        {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "120" }
        }
      );
    }

    if (noindex) response = withNoIndexHeader(response);
    if (response.status === 200) ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  }
};
