#!/usr/bin/env node
// The share image (og-card.png) -- what a link to deltamint.app shows on
// Reddit, X, Slack, iMessage -- GENERATED from the homepage, never drawn.
//
// The owner, finding the old card still up weeks after the rebrand: "the site
// description is all about the Spreads and Condors. Why we don't update our
// things. Do I have to do it every time?" He should not. The card was a
// hand-made PNG: the old triangle logo and "Credit spreads and iron condors"
// were baked into its pixels, so nothing that changed the homepage's words or
// the logo could reach it, and nothing noticed.
//
// So the card is now a FUNCTION of the homepage:
//
//   headline     <title> of landing/public/index.html, less "DeltaMint — "
//   line         its <meta name="description">
//   lockup       the brandmark markup the homepage itself renders
//   colours      the tokens in landing/public/assets/site.css
//   fonts        scripts/fonts (the site's own faces, vendored so the
//                result is the same on any machine, with or without network)
//
// and a stamp (scripts/og-card/stamp.json) records a hash of exactly those
// inputs and of the PNG. `npm run content:check`, which runs before every site
// deploy, recomputes both: change the homepage headline, description or logo
// without regenerating the card, or swap the PNG by hand, and the deploy
// stops with the command that fixes it.
//
//   npm run og:card            regenerate og-card.png and the stamp
//   node scripts/og-card.mjs --check   verify only (what content:check calls)

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = path.join(root, "landing/public/index.html");
const CSS = path.join(root, "landing/public/assets/site.css");
const TEMPLATE = path.join(root, "scripts/og-card/template.html");
const FONT_DIR = path.join(root, "scripts/fonts");
const PNG = path.join(root, "landing/public/assets/og-card.png");
const STAMP = path.join(root, "scripts/og-card/stamp.json");

const FONTS = [
  ["Bricolage Grotesque", "700", "bricolage-700.woff2"],
  ["IBM Plex Sans", "400 500", "plex-sans.woff2"],
  ["IBM Plex Mono", "500", "plex-mono-500.woff2"]
];
const TOKENS = ["paper", "ink", "ink-soft", "line", "brand", "mint"];

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Everything the card is made from, read fresh from the site. Throws with the
// file to look at if the homepage stops carrying something the card needs --
// better a failed check than a card silently built from nothing.
export function cardInputs() {
  const home = readFileSync(HOME, "utf8");
  const title = home.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = home.match(/<meta name="description" content="([^"]+)"/)?.[1];
  // The first brandmark on the page is the header lockup.
  const mark = home.match(/<a class="brandmark"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  if (!title || !description || !mark) {
    throw new Error(`og-card: ${path.relative(root, HOME)} is missing its <title>, meta description or brandmark.`);
  }
  const css = readFileSync(CSS, "utf8");
  const rootBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] || "";
  const tokens = TOKENS.map((t) => {
    const v = rootBlock.match(new RegExp(`--${t}:\\s*([^;]+);`))?.[1]?.trim();
    if (!v) throw new Error(`og-card: --${t} not found in :root of ${path.relative(root, CSS)}.`);
    return `--${t}: ${v};`;
  }).join(" ");
  return {
    title: decode(title).replace(/^DeltaMint\s+[—-]\s+/, "").trim(),
    description: decode(description).trim(),
    lockup: mark.trim().replace(/\s+/g, " "),
    tokens,
    template: readFileSync(TEMPLATE, "utf8"),
    fonts: FONTS.map(([, , f]) => sha(readFileSync(path.join(FONT_DIR, f)))).join(",")
  };
}

export const inputsHash = (i) => sha(JSON.stringify(i));

// Returns null when the card is current, else the sentence saying why not.
export function checkCard() {
  let stamp;
  try { stamp = JSON.parse(readFileSync(STAMP, "utf8")); } catch { return "no stamp — the card has never been generated. Run: npm run og:card"; }
  if (stamp.inputs !== inputsHash(cardInputs())) {
    return "the homepage headline, description, logo or brand colours changed since og-card.png was made. Run: npm run og:card";
  }
  if (stamp.png !== sha(readFileSync(PNG))) {
    return "og-card.png was replaced by hand. It is generated — run: npm run og:card";
  }
  return null;
}

async function generate() {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require("playwright")); } catch {
    ({ chromium } = require(path.join(process.env.NODE_PATH || "", "playwright")));
  }
  const i = cardInputs();
  const fontCss = FONTS.map(([family, weight, file]) => {
    const b64 = readFileSync(path.join(FONT_DIR, file)).toString("base64");
    return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  }).join("\n");
  // Every placeholder, every occurrence, and replaced through a function so a
  // "$" in the copy is never read as a replacement pattern.
  const fill = { FONTS: fontCss, TOKENS: i.tokens, LOCKUP: i.lockup, TITLE: escape(i.title), DESCRIPTION: escape(i.description) };
  const html = i.template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
  if (/\{\{\w+\}\}/.test(html)) throw new Error("og-card: template has a placeholder the generator does not fill.");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  // document.fonts.check() answers TRUE for a family that was never declared
  // ("nothing to load"), so it cannot tell a loaded face from a missing one.
  // Ask for each face by name and require that it actually loaded.
  const loaded = await page.evaluate(async () => {
    const faces = [...document.fonts];
    await Promise.all(faces.map((f) => f.load().catch(() => null)));
    const ok = (family) => faces.some((f) => f.family.replace(/"/g, "") === family && f.status === "loaded");
    return ok("Bricolage Grotesque") && ok("IBM Plex Sans") && ok("IBM Plex Mono");
  });
  if (!loaded) throw new Error("og-card: brand fonts did not load; refusing to write a card in a fallback face.");
  const png = await page.screenshot({ type: "png" });
  await browser.close();

  writeFileSync(PNG, png);
  writeFileSync(STAMP, JSON.stringify({ inputs: inputsHash(i), png: sha(png), title: i.title, description: i.description }, null, 2) + "\n");
  console.log(`og-card.png written — "${i.title}"`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const why = checkCard();
    console.log(why ? `og-card: out of date — ${why}` : "og-card: current");
    process.exit(why ? 1 : 0);
  }
  generate().catch((e) => { console.error(e.message); process.exit(1); });
}
