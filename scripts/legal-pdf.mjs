#!/usr/bin/env node
// PDF copies of the Terms of Service and the Privacy Policy, GENERATED from the
// pages the site serves -- for a broker's compliance file, or anyone else who
// needs the agreement as a document rather than a URL.
//
// Alpaca's compliance team asked for exactly this ("Provide PDF copies of
// Terms, Privacy Policy ... currently URL-only"), and the first copies were
// made by hand. A hand-made copy of a legal page is out of date the moment the
// page changes, and a stale agreement sent to a broker is worse than none. So,
// like the share image (scripts/og-card.mjs), these are a function of their
// source, with a stamp that `npm run content:check` verifies before every site
// deploy: edit a legal page without regenerating its PDF and the deploy stops.
//
// What is printed: the page itself -- words, headings and branding exactly as
// served -- without the web menu and Log in button, on a white page, with the
// published address, the version date the page states, and page numbers on
// every sheet.
//
//   npm run legal:pdf                     regenerate both PDFs and the stamp
//   node scripts/legal-pdf.mjs --check    verify only (what content:check calls)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(root, "landing/public");
const FONT_DIR = path.join(root, "scripts/fonts");
const OUT = path.join(root, "docs/legal/deliverables");
const STAMP = path.join(root, "docs/legal/deliverables/legal-pdf.stamp.json");

export const DOCS = [
  { slug: "terms", title: "Terms of Service", file: "DeltaMint-Terms-of-Service.pdf" },
  { slug: "privacy", title: "Privacy Policy", file: "DeltaMint-Privacy-Policy.pdf" }
];

// Faces the legal pages ask Google Fonts for, served from scripts/fonts.
const FACES = [
  ["Bricolage Grotesque", "600 700", "bricolage-700.woff2"],
  ["IBM Plex Sans", "400 500", "plex-sans.woff2"],
  ["IBM Plex Mono", "400", "plex-mono-400.woff2"],
  ["IBM Plex Mono", "500", "plex-mono-500.woff2"]
];

// A document, not a web page.
const PRINT_CSS = `
  html, body { background: #fff !important; }
  .nav .right, footer.site .frow a:not(.brandmark), .burger { display: none !important; }
  footer.site { margin-top: 28px !important; padding-top: 16px !important; border-top: 1px solid #dfe2ec; }
  .doc h2 { break-after: avoid; } .doc p, .doc li { orphans: 3; widows: 3; }
`;

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const read = (rel) => readFileSync(path.join(SITE, rel));

// Everything a PDF is made from. Changing any of it makes the PDF stale.
function inputsFor(doc) {
  return sha(JSON.stringify({
    // The share-image version in the page's meta tags is not part of the
    // agreement; a new card must not make the legal PDFs stale.
    page: sha(read(`${doc.slug}/index.html`).toString("utf8").replace(/og-card\.png\?v=[0-9a-f]+/g, "og-card.png")),
    css: sha(read("assets/site.css")),
    fonts: FACES.map(([, , f]) => sha(readFileSync(path.join(FONT_DIR, f)))),
    print: PRINT_CSS,
    generator: sha(readFileSync(fileURLToPath(import.meta.url)))
  }));
}

// The version date the page itself states -- printed on every sheet so a
// reader can tell which version of the agreement they hold.
function versionOf(doc) {
  const html = read(`${doc.slug}/index.html`).toString("utf8");
  const d = html.match(/<div class="updated">([^<]+)<\/div>/)?.[1]?.trim();
  if (!d) throw new Error(`legal-pdf: landing/public/${doc.slug}/index.html has no "Last updated" line.`);
  return d;
}

// null when every PDF is current, else the sentence saying which is not.
export function checkLegalPdfs() {
  if (!existsSync(STAMP)) return "no stamp — the legal PDFs have never been generated. Run: npm run legal:pdf";
  const stamp = JSON.parse(readFileSync(STAMP, "utf8"));
  for (const doc of DOCS) {
    const s = stamp[doc.slug];
    const pdf = path.join(OUT, doc.file);
    if (!s || s.inputs !== inputsFor(doc)) {
      return `the ${doc.title} page changed since ${doc.file} was made. Run: npm run legal:pdf`;
    }
    if (!existsSync(pdf) || s.pdf !== sha(readFileSync(pdf))) {
      return `${doc.file} was replaced or removed by hand. It is generated — run: npm run legal:pdf`;
    }
  }
  return null;
}

function fontCss() {
  return FACES.map(([family, weight, file]) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(/__fonts/${file}) format('woff2');}`
  ).join("\n");
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

// The site as the Worker serves it: /terms -> terms/index.html.
export function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      let file;
      if (url.pathname === "/__fonts.css") {
        res.writeHead(200, { "content-type": "text/css" }); return res.end(fontCss());
      }
      if (url.pathname.startsWith("/__fonts/")) file = path.join(FONT_DIR, path.basename(url.pathname));
      else {
        file = path.join(SITE, decodeURIComponent(url.pathname));
        if (!path.extname(file)) file = path.join(file, "index.html");
      }
      if (!file.startsWith(SITE) && !file.startsWith(FONT_DIR)) { res.writeHead(403); return res.end(); }
      if (!existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function generate() {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require("playwright")); } catch {
    ({ chromium } = require(path.join(process.env.NODE_PATH || "", "playwright")));
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // The pages link Google Fonts; answer with the same faces from scripts/fonts.
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 302, headers: { location: `${base}/__fonts.css` } }));
  await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await page.emulateMedia({ colorScheme: "light" });

  const stamp = {};
  try {
    for (const doc of DOCS) {
      await page.goto(`${base}/${doc.slug}`, { waitUntil: "networkidle" });
      await page.addStyleTag({ content: PRINT_CSS });
      const loaded = await page.evaluate(async () => {
        const faces = [...document.fonts];
        await Promise.all(faces.map((f) => f.load().catch(() => null)));
        const ok = (fam) => faces.some((f) => f.family.replace(/['"]/g, "") === fam && f.status === "loaded");
        return ok("Bricolage Grotesque") && ok("IBM Plex Sans") && ok("IBM Plex Mono");
      });
      if (!loaded) throw new Error(`legal-pdf: brand fonts did not load for ${doc.slug}; refusing to print in a fallback face.`);

      const small = "font-family:'IBM Plex Sans',sans-serif;font-size:8px;color:#6b7080;width:100%;padding:0 0.6in;display:flex;justify-content:space-between;";
      const version = versionOf(doc);
      const pdf = await page.pdf({
        format: "Letter", printBackground: true, displayHeaderFooter: true,
        headerTemplate: `<div style="${small}"><span>DeltaMint — ${doc.title}</span><span>https://deltamint.app/${doc.slug}</span></div>`,
        footerTemplate: `<div style="${small}"><span>Copy of https://deltamint.app/${doc.slug} · ${version}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        margin: { top: "0.75in", bottom: "0.75in", left: "0.6in", right: "0.6in" }
      });
      writeFileSync(path.join(OUT, doc.file), pdf);
      stamp[doc.slug] = { inputs: inputsFor(doc), pdf: sha(pdf), version };
      console.log(`${doc.file} written — ${version}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  writeFileSync(STAMP, JSON.stringify(stamp, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const why = checkLegalPdfs();
    console.log(why ? `legal-pdf: out of date — ${why}` : "legal-pdf: current");
    process.exit(why ? 1 : 0);
  }
  generate().catch((e) => { console.error(e.message); process.exit(1); });
}
