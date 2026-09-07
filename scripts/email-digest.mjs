// Emails the owner whatever a weekly agent just committed.
//
// Why this is CI's job and not the agent's: the Routine sessions run without
// MCP tools and without service-role credentials, so an agent physically
// cannot call sendDigest itself. Asking it to "remember to email" would be a
// step that fails silently -- which is the whole failure this repo keeps
// hitting. A commit is evidence the work happened; making the email a
// consequence of the commit means delivery cannot drift from the work.
//
// What it sends is a SUMMARY, not the document. The first version pasted
// every report in full, which on a phone is a wall of text nobody reads --
// and an unread email delivers exactly as much as no email. So each item gets
// a card: what it is, one sentence, up to five points, and a link to the
// whole thing. The report itself lives in the repo; the blog post lives on
// the staging blog. The mail's job is to get the owner there.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const files = process.argv.slice(2).filter((f) => f.endsWith(".md"));
if (!files.length) {
  console.log("email-digest: no markdown files given; nothing to send");
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("email-digest: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

// Where the full thing can be read. A blog post is on the staging blog (the
// workflow passes REVIEW_URL); everything else is a file in the repo.
const REVIEW_URL = process.env.REVIEW_URL;
const REPO_BLOB = "https://github.com/OsamaMaghawry/Spreads/blob/main/";

// Which cadence produced this, so the subject says something on a phone.
const LABELS = [
  [/^docs\/reality\//, "Reality check"],
  [/^growth\/plays\//, "Growth play"],
  [/^docs\/product\//, "Product update"],
  [/^docs\/branding\//, "Branding audit"],
  [/^docs\/trading-audit\//, "Trading audit"],
  [/^docs\/board\//, "Board pack"],
  [/^content\/blog\//, "New blog post"]
];
const labelFor = (p) => (LABELS.find(([re]) => re.test(p)) || [null, "Update"])[1];
const isPost = (p) => /^content\/blog\//.test(p);

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Inline emphasis only. A summary card is not the place to reproduce a
// document's structure, so everything else is flattened to plain text.
const inline = (t) =>
  esc(t)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "<strong style=\"color:#12241e;\">$1</strong>")
    // Single-asterisk italics are dropped rather than rendered: the point is a
    // scannable line, and a stray `*` surviving into the mail (which is what
    // happened on the first branding digest) reads as a typo.
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Clipping happens before this runs, so a long item can lose the closing
    // marker of a pair and leave its opener stranded — which is exactly how
    // `*"No emoji anywhere…` reached the inbox. Anything still standing here
    // has no partner and is punctuation the reader never wrote.
    .replace(/\*+/g, "");

const clip = (s, n) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, t.lastIndexOf(" ", n - 1) > n * 0.6 ? t.lastIndexOf(" ", n - 1) : n - 1).trimEnd() + "…";
};

// Front matter is for the publisher, but its title and excerpt are the best
// summary a post has, so it is read before being stripped.
function frontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2] };
}

// The three things a card shows, pulled out of the document: what it is
// called, one sentence of what it says, and the points worth scanning.
function digest(md) {
  const blocks = md.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  let title = null;
  let summary = null;
  let fallbackSummary = null;
  let seenHeading = false;
  let summaryUnderHeading = false;
  const points = [];

  for (const b of blocks) {
    const h = b.match(/^(#{1,4})\s+(.*)$/s);
    if (h) {
      if (!title && h[1].length === 1) title = h[2].trim();
      // Everything before the first ## is preamble — scope, cadence, who
      // adjudicates what. The findings start under the first heading, so a
      // paragraph there outranks anything above it.
      if (h[1].length > 1) seenHeading = true;
      continue;
    }
    if (/^\s*[-*]\s+/.test(b.split("\n")[0])) {
      // These documents are hard-wrapped, so one bullet spans several lines.
      // Treating every line as its own item cut each point off at column 78
      // — the first version of this mail read as a list of half-sentences.
      // A line starting a new item begins with a marker at the left margin;
      // an indented marker is a sub-point (skipped, it is detail under a
      // point already listed); anything else continues the item above it.
      let current = null;
      for (const l of b.split("\n")) {
        if (/^[-*]\s+/.test(l)) {
          if (current) points.push(current);
          current = l.replace(/^[-*]\s+/, "").trim();
        } else if (/^\s+[-*]\s+/.test(l)) {
          if (current) { points.push(current); current = null; }
        } else if (current) {
          current += " " + l.trim();
        }
        if (points.length >= 5) break;
      }
      if (current && points.length < 5) points.push(current);
      continue;
    }
    if (/^\s*\|/.test(b)) continue; // a table does not survive a summary
    // Reports often open with process metadata — "Cadence: biweekly…",
    // "Scope walked: …" — which is the least useful sentence in the file and
    // was what the first digest led with. A paragraph opening with a short
    // Label: is skipped in favour of the next one that actually says
    // something; if the whole document is like that, the first is used
    // rather than sending a card with no summary at all.
    const flat = b.replace(/\n/g, " ");
    const meta = /^[A-Z][A-Za-z]*(\s+[a-z]+){0,2}:\s/.test(b);
    if (!meta && (!summary || (seenHeading && !summaryUnderHeading))) {
      summary = flat;
      if (seenHeading) summaryUnderHeading = true;
    }
    if (!fallbackSummary) fallbackSummary = flat;
  }
  return { title, summary: summary || fallbackSummary, points };
}

const cards = [];
const textParts = [];

for (const f of files) {
  let raw;
  try {
    raw = await readFile(f, "utf8");
  } catch {
    console.log(`email-digest: ${f} unreadable (deleted?), skipping`);
    continue;
  }

  const { meta, body } = frontMatter(raw);
  const d = digest(body);
  const label = labelFor(f);
  // The chip above the title already says what kind of thing this is, so a
  // heading that opens by repeating it ("Board pack — 2026-W36") loses the
  // repetition and keeps the part that identifies this one.
  const title = (meta.title || d.title || basename(f, ".md")).replace(
    new RegExp(`^${label}\\s*[—:-]\\s*`, "i"),
    ""
  );
  const summary = meta.excerpt || d.summary || "";
  const href =
    isPost(f) && REVIEW_URL
      ? `${REVIEW_URL.replace(/\/$/, "")}/${meta.slug || basename(f, ".md")}`
      : `${REPO_BLOB}${f}`;
  const cta = isPost(f) && REVIEW_URL ? "Read it on staging" : "Open the full report";

  const points = d.points.length
    ? `<ul style="margin:12px 0 0;padding-left:18px;">${d.points
        .map(
          (p) =>
            `<li style="margin:7px 0;font-size:14px;line-height:1.55;color:#3c4f48;">${inline(clip(p, 150))}</li>`
        )
        .join("")}</ul>`
    : "";

  cards.push(
    `<div style="border:1px solid #e3e9e6;border-radius:10px;padding:18px 20px;margin:0 0 14px;background:#ffffff;">
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7c8b85;font-weight:700;">${esc(label)}</div>
      <div style="font-size:17px;line-height:1.3;font-weight:600;color:#12241e;margin:6px 0 0;">${esc(title)}</div>
      ${summary ? `<p style="font-size:14px;line-height:1.6;color:#3c4f48;margin:8px 0 0;">${inline(clip(summary, 260))}</p>` : ""}
      ${points}
      <div style="margin:16px 0 0;"><a href="${esc(href)}" style="display:inline-block;font-size:13px;font-weight:600;color:#ffffff;background:#1d6b53;border-radius:7px;padding:9px 16px;text-decoration:none;">${esc(cta)}</a></div>
    </div>`
  );

  textParts.push(
    [`${label}: ${title}`, summary ? clip(summary, 260) : "", ...d.points.map((p) => `- ${clip(p, 150)}`), href]
      .filter(Boolean)
      .join("\n")
  );
}

if (!cards.length) {
  console.log("email-digest: nothing readable to send");
  process.exit(0);
}

const label = labelFor(files[0]);
const firstTitle = textParts[0].split("\n")[0].replace(/^[^:]+:\s*/, "");
// "Branding audit — Branding consistency audit — 2026-W36" is what prefixing
// blindly produces. When the title already carries the label's own words, the
// title alone is the subject.
const labelWord = label.split(" ")[0].toLowerCase();
const titleSaysIt = firstTitle.toLowerCase().includes(labelWord);
const subject =
  cards.length === 1
    ? titleSaysIt
      ? clip(firstTitle, 70)
      : `${label} — ${clip(firstTitle, 60)}`
    : `${cards.length} updates — ${label} and ${cards.length - 1} more`;

const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
const count = `${cards.length} ${cards.length === 1 ? "item" : "items"} · ${esc(today)}`;
const footer = REVIEW_URL
  ? "Drafted on the staging blog, not live. Say the word and it goes to deltamint.app."
  : "Sent when the work was committed. Nothing here needs a reply.";

const html = `<div style="margin:0;padding:0;background:#f4f6f5;">
  <div style="max-width:600px;margin:0 auto;padding:26px 16px 34px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 4px 14px;">
      <span style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#12241e;font-weight:700;">DeltaMint</span>
      <span style="font-size:12px;color:#8a9993;">${count}</span>
    </div>
    ${cards.join("\n")}
    <div style="margin:18px 4px 0;font-size:12px;line-height:1.5;color:#8a9993;">${esc(footer)}</div>
  </div>
</div>`;

const text = `DeltaMint — ${count.replace(" · ", ", ")}\n\n${textParts.join("\n\n---\n\n")}\n\n${footer}`;

// A dry run renders the mail and sends nothing, so the layout can be checked
// without putting a test message in the owner's inbox.
if (process.env.EMAIL_DIGEST_DRY_RUN) {
  console.log(`subject: ${subject}\n${html}`);
  process.exit(0);
}

const res = await fetch(`${url}/functions/v1/sendDigest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ subject, html, text })
});

const bodyText = await res.text();
if (!res.ok) {
  console.error(`email-digest: ${res.status} ${bodyText}`);
  process.exit(1);
}
console.log(`email-digest: sent "${subject}" -> ${bodyText}`);
