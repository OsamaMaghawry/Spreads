// Page shell and a small Markdown subset, shared by the blog routes.
//
// Everything here runs inside the Worker and produces the HTML a crawler
// actually receives. Nothing on these pages depends on client-side JavaScript
// — that is the whole reason the blog lives in this Worker rather than in the
// React app on the dashboard subdomain.

export const SITE = "https://deltamint.app";

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
      // Only http(s) links are linkified, so an escaped javascript: URL can
      // never become an anchor.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

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

      const heading = block.match(/^(#{1,4})\s+(.*)$/s);
      if (heading) {
        // The post title is the page's h1, so body headings start at h2 and a
        // single `#` is clamped rather than emitting a competing h1.
        const level = Math.max(2, heading[1].length);
        return `<h${level}>${inline(heading[2].trim())}</h${level}>`;
      }

      const lines = block.split("\n");

      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("");
        return `<ol>${items}</ol>`;
      }
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
  .doc { padding: 48px 56px 80px; max-width: 760px; }
  .doc h1 { font-size: 30px; line-height: 1.25; }
  .doc .meta { margin: 12px 0 36px; font-size: 12px; color: var(--ink-mute); }
  .doc h2 { font-size: 19px; margin: 36px 0 12px; }
  .doc h3 { font-size: 15px; margin: 28px 0 10px; }
  .doc p, .doc li { font-size: 14px; line-height: 1.8; color: var(--ink-soft); }
  .doc ul, .doc ol { padding-left: 22px; margin: 10px 0; }
  .doc li { margin: 4px 0; }
  .doc pre { background: var(--line-soft); border: 1px solid var(--line); border-radius: 8px;
             padding: 14px 16px; overflow-x: auto; font-size: 13px; }
  .doc code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: .92em; }
  .doc blockquote { margin: 16px 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--line);
                    color: var(--ink-mute); }
  .doc a { color: var(--brand); }
  .postlist { list-style: none; padding: 0; margin: 28px 0 0; }
  .postlist li { margin: 0 0 26px; }
  .postlist h2 { font-size: 18px; margin: 0 0 6px; }
  .postlist h2 a { color: var(--ink); text-decoration: none; }
  .postlist h2 a:hover { color: var(--brand); }
  .postlist .when { font-size: 12px; color: var(--ink-mute); }
  .postlist p { margin: 6px 0 0; }
  @media (max-width: 860px) { .doc { padding-left: 24px; padding-right: 24px; } }
</style>
</head>
<body>

<div class="wrap">
  <nav class="nav">
    <a class="brandmark" href="/">${MARK}<span>DeltaMint</span></a>
    <div class="right">
      <a class="plain" href="/blog">Blog</a>
      <a class="plain" href="/pricing">Pricing</a>
      <a class="btn btn-ghost" href="https://dashboard.deltamint.app/login">Log in</a>
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
      <a href="/pricing">Pricing</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="https://dashboard.deltamint.app">Open the app</a>
    </div>
    <p class="fine">DeltaMint is a software tool, not a broker-dealer, and does not provide investment advice. Options trading involves substantial risk of loss and is not suitable for every investor. Trades are placed through your own brokerage account, under that broker's terms. Figures shown are illustrative.</p>
  </div>
</footer>

</body>
</html>`;
}
