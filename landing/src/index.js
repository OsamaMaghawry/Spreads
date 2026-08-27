import { esc, markdown, formatDate, page } from "./render.js";

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

const POST_FIELDS = "slug,title,excerpt,body,author,meta_description,og_image,published_at,updated_at";

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

function renderIndex(posts, site, noindex) {
  const items = posts.length
    ? posts
        .map(
          (p) => `    <li>
      <h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2>
      <div class="when">${esc(formatDate(p.published_at))}${p.author ? ` · ${esc(p.author)}` : ""}</div>
      ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ""}
    </li>`
        )
        .join("\n")
    : `    <li><p>No posts yet.</p></li>`;

  return page({
    title: "Blog — DeltaMint",
    description: "Notes on selling options premium with defined risk: credit spreads, iron condors, position sizing and execution.",
    canonical: `${site}/blog`,
    head: `${robotsMeta(noindex)}<meta property="og:type" content="website" />
<meta property="og:site_name" content="DeltaMint" />
<meta property="og:url" content="${site}/blog" />
<meta property="og:title" content="Blog — DeltaMint" />
<meta property="og:image" content="${site}/assets/og-card.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${site}/assets/og-card.png" />`,
    body: `<h1>Blog</h1>
<p>Notes on selling options premium with defined risk.</p>
<ul class="postlist">
${items}
</ul>`
  });
}

function renderPost(post, site, noindex) {
  const url = `${site}/blog/${post.slug}`;
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
    mainEntityOfPage: { "@type": "WebPage", "@id": url }
  };

  return page({
    title: `${post.title} — DeltaMint`,
    description,
    canonical: url,
    head: `${robotsMeta(noindex)}<meta property="og:type" content="article" />
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
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    body: `<h1>${esc(post.title)}</h1>
<div class="meta">${esc(formatDate(post.published_at))}${post.author ? ` · ${esc(post.author)}` : ""}</div>
${markdown(post.body)}
<p style="margin-top:40px"><a href="/blog">← All posts</a></p>`
  });
}

function renderSitemap(posts, site) {
  // Static pages plus every published post. Drafts cannot appear here because
  // RLS never returned them.
  const staticPaths = ["/", "/pricing", "/blog", "/terms", "/privacy"];
  const urls = [
    ...staticPaths.map((p) => `  <url><loc>${site}${p}</loc></url>`),
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
    if (!isBlogPath) {
      // Anything else is a static asset. On production the Worker is not even
      // invoked for these; on staging it is, purely to stamp the header.
      const asset = await env.ASSETS.fetch(request);
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
        response = html(renderIndex(await fetchPosts(env), site, noindex));
      } else {
        const slug = decodeURIComponent(path.slice("/blog/".length));
        const [post] = await fetchPosts(env, { slug });
        response = post ? html(renderPost(post, site, noindex)) : notFound(site);
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
