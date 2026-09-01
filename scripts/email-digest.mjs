// Emails the owner whatever a weekly agent just committed.
//
// Why this is CI's job and not the agent's: the Routine sessions run without
// MCP tools and without service-role credentials, so an agent physically
// cannot call sendDigest itself. Asking it to "remember to email" would be a
// step that fails silently -- which is the whole failure this repo keeps
// hitting. A commit is evidence the work happened; making the email a
// consequence of the commit means delivery cannot drift from the work.
//
// Takes markdown paths, renders them plainly, and posts to the sendDigest
// edge function so the mail arrives as DeltaMint Agents <agents@deltamint.app>.
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

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A deliberately small renderer: headings, bullets, paragraphs. Enough for a
// report to read well in a mail client, and nothing that can mangle content.
function render(md) {
  const out = [];
  for (const block of md.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const b = block.trim();
    if (!b) continue;
    const h = b.match(/^(#{1,4})\s+(.*)$/s);
    if (h) {
      const size = [21, 17, 15, 14][h[1].length - 1];
      out.push(`<h${h[1].length} style="font-size:${size}px;margin:22px 0 6px;color:#12241e;">${esc(h[2].trim())}</h${h[1].length}>`);
      continue;
    }
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      const items = lines.map((l) => `<li style="margin:4px 0;">${esc(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("");
      out.push(`<ul style="padding-left:20px;margin:8px 0;font-size:14px;line-height:1.65;color:#3c4f48;">${items}</ul>`);
      continue;
    }
    out.push(`<p style="font-size:14px;line-height:1.7;margin:8px 0;color:#3c4f48;">${esc(lines.join(" "))}</p>`);
  }
  return out.join("\n");
}

const sections = [];
const textParts = [];
for (const f of files) {
  let md;
  try {
    md = await readFile(f, "utf8");
  } catch {
    console.log(`email-digest: ${f} unreadable (deleted?), skipping`);
    continue;
  }
  // Front matter is for the publisher, not the reader.
  md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  sections.push(
    `<div style="margin:0 0 26px;"><div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#7c8b85;font-weight:700;">${esc(labelFor(f))} &middot; ${esc(basename(f))}</div>${render(md)}</div>`
  );
  textParts.push(`### ${labelFor(f)} — ${basename(f)}\n\n${md.trim()}`);
}

if (!sections.length) {
  console.log("email-digest: nothing readable to send");
  process.exit(0);
}

const label = labelFor(files[0]);
const subject = files.length === 1 ? `${label} — ${basename(files[0], ".md")}` : `${label} and ${files.length - 1} more`;

const html = `<div style="margin:0;padding:0;background:#f4f6f5;"><div style="max-width:660px;margin:0 auto;padding:28px 18px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2b26;"><div style="font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#7c8b85;font-weight:600;">DeltaMint</div><div style="background:#fff;border-radius:8px;border:1px solid #e3e9e6;padding:22px 24px;margin-top:14px;">${sections.join("")}</div><div style="margin:20px 0 0;font-size:12px;color:#8a9993;">Sent automatically when this was committed to main.</div></div></div>`;

const res = await fetch(`${url}/functions/v1/sendDigest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ subject, html, text: textParts.join("\n\n---\n\n") })
});

const bodyText = await res.text();
if (!res.ok) {
  console.error(`email-digest: ${res.status} ${bodyText}`);
  process.exit(1);
}
console.log(`email-digest: sent "${subject}" -> ${bodyText}`);
