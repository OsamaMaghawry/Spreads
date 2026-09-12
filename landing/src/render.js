// Page shell and a small Markdown subset, shared by the blog routes.
//
// Everything here runs inside the Worker and produces the HTML a crawler
// actually receives. Nothing on these pages depends on client-side JavaScript
// — that is the whole reason the blog lives in this Worker rather than in the
// React app on the dashboard subdomain.

// The canonical host is per-deployment, not a constant: production and staging
// run the same Worker code, and a hardcoded host made staging link into
// production. It comes from the SITE_URL var in each wrangler config, falling
// back to the origin the request actually arrived on.

// Escaping happens before any markup is inserted, never after. Doing it the
// other way round strips the tags this renderer just added.
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Deliberately a subset, not a full CommonMark implementation: headings,
// emphasis, links, lists, code and quotes cover what a post needs, and every
// output tag is one this function emits itself. Author input is escaped first,
// so a post can never inject markup — the admin panel is trusted, but "the
// author is trusted" is a bad thing to have to rely on.
export function markdown(src) {
  const blocks = esc(src).replace(/\r\n/g, "\n").split(/\n{2,}/);
  const inline = (t) =>
    t
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      // Only http(s) and root-relative links are linkified, so an escaped
      // javascript: URL can never become an anchor. Root-relative keeps
      // internal links on whichever host serves the page — an absolute URL
      // here would make staging pages link into production.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[\w\/.#-]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

  return blocks
    .map((raw) => {
      // Indentation is checked against the raw block, before trimming.
      // Trimming first and then testing for leading spaces always reports
      // false, because the trim removed the very thing being tested.
      const rawLines = raw.replace(/\n+$/, "").split("\n");
      if (rawLines.length && rawLines.every((l) => /^ {4}/.test(l))) {
        return `<pre><code>${rawLines.map((l) => l.slice(4)).join("\n")}</code></pre>`;
      }

      const block = raw.trim();
      if (!block) return "";

      // A figure: ![caption](/assets/…) alone on a line. Only same-origin
      // asset paths become an image — a remote URL stays escaped text, so a
      // post can never make the reader's browser fetch a third-party host.
      const figure = block.match(/^!\[([^\]]*)\]\((\/assets\/[\w\/.-]+)\)$/);
      if (figure) {
        return `<figure><img src="${figure[2]}" alt="${figure[1]}" loading="lazy" />${
          figure[1] ? `<figcaption>${inline(figure[1])}</figcaption>` : ""
        }</figure>`;
      }

      const heading = block.match(/^(#{1,4})\s+(.*)$/s);
      if (heading) {
        // The post title is the page's h1, so body headings start at h2 and a
        // single `#` is clamped rather than emitting a competing h1.
        const level = Math.max(2, heading[1].length);
        return `<h${level}>${inline(heading[2].trim())}</h${level}>`;
      }

      const lines = block.split("\n");

      // A pipe table: every line is |…|…| and the second row is the ---
      // separator. Cells run through the same inline pass as any prose.
      if (lines.length >= 2 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[1])) {
        const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const head = cells(lines[0]).map((c) => `<th>${inline(c)}</th>`).join("");
        const rows = lines
          .slice(2)
          .map((l) => `<tr>${cells(l).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("");
        return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }

      // A list is recognised by its FIRST line, and a line without a marker
      // continues the item above it.
      //
      // This used to require every line to carry a marker, which meant an
      // item wrapped onto a second line — the normal way to write markdown in
      // an 80-column file — silently rendered as a paragraph with literal
      // dashes in it. Worse, it failed silently in the direction nobody
      // checks: content:check reads the source, counted the block as a list,
      // and passed a post that rendered as a wall of prose.
      const items = (marker) => {
        const out = [];
        for (const l of lines) {
          if (marker.test(l)) out.push(l.replace(marker, ""));
          else if (out.length) out[out.length - 1] += " " + l.trim();
        }
        return out.map((i) => `<li>${inline(i.trim())}</li>`).join("");
      };
      if (/^\s*[-*]\s+/.test(lines[0])) return `<ul>${items(/^\s*[-*]\s+/)}</ul>`;
      if (/^\s*\d+\.\s+/.test(lines[0])) return `<ol>${items(/^\s*\d+\.\s+/)}</ol>`;
      if (lines.every((l) => /^\s*&gt;\s?/.test(l))) {
        return `<blockquote>${inline(lines.map((l) => l.replace(/^\s*&gt;\s?/, "")).join(" "))}</blockquote>`;
      }

      return `<p>${inline(lines.join(" "))}</p>`;
    })
    .join("\n");
}

export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const MARK = `<svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 8 L21 22 L5 22 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 15 Q13 10.5 10 6 Q7 10.5 10 15 Z" fill="#3FA672"/><path d="M16 15 Q19 10.5 16 6 Q13 10.5 16 15 Z" fill="#3FA672"/></svg>`;

// Matches the static pages' nav, footer and disclaimer so a blog page is not
// visibly a different site. The disclaimer text is copied verbatim from
// landing/public/index.html — it is a compliance line, not decoration, and the
// two must not drift apart.
export function page({ title, description, canonical, head = "", body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<link href="/assets/site.css" rel="stylesheet">
${head}
<style>
  /* Reading size. The blog was set at 14px, which is a UI size, not a
     reading size -- fine for a table of numbers, tiring for two thousand
     words. 17px on a 780px column puts roughly 70 characters on a line,
     which is the width prose is comfortable at. Everything else in this
     block is scaled from that so the hierarchy still reads as a hierarchy. */
  .doc { padding: 48px 56px 80px; max-width: 780px; }
  .doc h1 { font-size: 36px; line-height: 1.18; }
  .doc .meta { margin: 12px 0 36px; font-size: 13px; color: var(--ink-mute); }
  .doc h2 { font-size: 24px; margin: 42px 0 14px; }
  .doc h3 { font-size: 18px; margin: 30px 0 10px; }
  .doc p, .doc li { font-size: 17px; line-height: 1.68; color: var(--ink-soft); }
  .doc ul, .doc ol { padding-left: 24px; margin: 14px 0; }
  /* Posts lead with lists now, so a list is a structure to read rather than
     an aside: the items get room between them, and a bolded lead-in sits in
     the body colour so the eye lands on it first. */
  .doc li { margin: 9px 0; padding-left: 2px; }
  .doc li::marker { color: var(--ink-mute); }
  .doc li > strong:first-child { color: var(--ink); }
  .doc pre { background: var(--line-soft); border: 1px solid var(--line); border-radius: 8px;
             padding: 14px 16px; overflow-x: auto; font-size: 14.5px; }
  .doc code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: .92em; }
  .doc blockquote { margin: 16px 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--line);
                    color: var(--ink-mute); }
  /* a:not(.btn) because a button inside a post is not a body-copy link.
     ".doc a" is specificity 0,1,1 and ".btn-primary" is 0,1,0, so the post's
     link colour won the cascade and painted the call-to-action's label brand
     purple on its brand-purple background -- an invisible button, on the one
     page whose whole job is to convert a reader. Excluding buttons is the fix
     rather than raising .btn's specificity: the rule is about prose links, and
     saying so is what stops the next component hitting the same wall.
     NOTE: no backticks in here. This block lives inside a JS template
     literal, and the first draft of this comment used them and broke the
     Worker's syntax outright. */
  .doc a:not(.btn) { color: var(--brand); }
  .doc figure { margin: 28px 0; }
  .doc figure img { width: 100%; height: auto; display: block; border: 1px solid var(--line);
                    border-radius: 12px; background: #FFFFFF; }
  .doc figcaption { margin-top: 8px; font-size: 13px; color: var(--ink-mute); line-height: 1.5; }
  .doc .lede { font-size: 19px; color: var(--ink-soft); margin: 4px 0 28px; }
  .doc .crumbs { font-size: 13px; color: var(--ink-mute); margin-bottom: 14px; }
  .doc .crumbs a { color: var(--ink-mute); text-decoration: none; }
  .doc .cat { padding: 22px 0; border-top: 1px solid var(--line-soft); }
  .doc .cat h2 { margin: 0 0 4px; }
  .doc .cat h2 a { color: var(--ink); text-decoration: none; }
  .doc .cat-intro { font-size: 15px; color: var(--ink-mute); margin-bottom: 10px; }
  .doc .cat ul { list-style: none; padding: 0; margin: 0; }
  .doc .cat li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line-soft); }
  .doc .cat li .when { font-size: 13px; color: var(--ink-mute); white-space: nowrap; }
  .doc .more { font-size: 14px; margin-top: 8px; }
  .doc ol.series { padding-left: 22px; }
  .doc ol.series li { margin: 12px 0; }
  .doc ol.series li p { margin: 2px 0 0; font-size: 14.5px; color: var(--ink-mute); line-height: 1.5; }
  .doc .readnext { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 36px 0 0; }
  .doc .readnext a { display: block; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; text-decoration: none; color: var(--ink); font-size: 15px; }
  .doc .readnext a span { display: block; font-size: 12px; color: var(--ink-mute); margin-bottom: 3px; }
  .doc .readnext a.next { text-align: right; }
  .doc .related { margin-top: 32px; }
  .doc .related h2 { font-size: 17px; margin-bottom: 6px; }
  .doc .related ul { padding-left: 18px; }
  .doc .startfree { margin-top: 28px; }
  .doc .tablewrap { overflow-x: auto; margin: 20px 0; }
  .doc table { border-collapse: collapse; width: 100%; font-size: 15px; }
  .doc th { text-align: left; font-weight: 500; color: var(--ink-mute); font-size: 13px;
            border-bottom: 1px solid var(--line); padding: 8px 14px 8px 0; white-space: nowrap; }
  .doc td { border-bottom: 1px solid var(--line-soft); padding: 9px 14px 9px 0;
            color: var(--ink-soft); line-height: 1.5; }
  .doc td:first-child, .doc th:first-child { padding-left: 0; }
  .postlist { list-style: none; padding: 0; margin: 28px 0 0; }
  .postlist li { margin: 0 0 26px; }
  .postlist h2 { font-size: 21px; margin: 0 0 6px; }
  .postlist h2 a { color: var(--ink); text-decoration: none; }
  .postlist h2 a:hover { color: var(--brand); }
  .postlist .when { font-size: 13px; color: var(--ink-mute); }
  .postlist p { margin: 6px 0 0; }
  @media (max-width: 860px) { .doc { padding-left: 24px; padding-right: 24px; } }
</style>
</head>
<body>

<div class="wrap">
  <nav class="nav">
    <a class="brandmark" href="/">${MARK}<span>DeltaMint</span></a>
    <div class="right">
      <div class="navlinks" id="navmenu">
        <a class="plain" href="/blog">Blog</a>
        <a class="btn btn-ghost" href="https://dashboard.deltamint.app/login">Log in</a>
      </div>
      <button class="burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navmenu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
      </button>
      <noscript><style>@media (max-width:40rem){.nav .navlinks{display:flex;position:static;flex-direction:row;min-width:0;padding:0;border:0;background:none;box-shadow:none}.burger{display:none}}</style></noscript>
    </div>
  </nav>
</div>

<div class="wrap">
  <article class="doc">
${body}
  </article>
</div>

<footer class="site">
  <div class="wrap">
    <div class="frow">
      <a class="brandmark" href="/" style="margin-right:auto">${MARK}<span style="font-size:.95rem">DeltaMint</span></a>
      <a href="/blog">Blog</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="https://dashboard.deltamint.app">Open the app</a>
    </div>
    <p class="fine">DeltaMint is a software tool, not a broker-dealer, and does not provide investment advice. Options trading involves substantial risk of loss and is not suitable for every investor. Trades are placed through your own brokerage account, under that broker's terms. Figures shown are illustrative.</p>
  </div>
</footer>

<script src="/assets/site.js" defer></script>
</body>
</html>`;
}
