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
//   npm run og:card            regenerate og-card.png, the stamp, every reference
//                              to it (versioned) and the app's share tags
//   node scripts/og-card.mjs --check   verify only (what content:check calls)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = path.join(root, "landing/public/index.html");
const CSS = path.join(root, "landing/public/assets/site.css");
const HOME_CSS = path.join(root, "landing/public/assets/home.css");
const TEMPLATE = path.join(root, "scripts/og-card/template.html");
const FONT_DIR = path.join(root, "scripts/fonts");
const PNG = path.join(root, "landing/public/assets/og-card.png");
const STAMP = path.join(root, "scripts/og-card/stamp.json");
const APP_HTML = path.join(root, "index.html");
const WORKER = path.join(root, "landing/src/index.js");

const FONTS = [
  ["Bricolage Grotesque", "700", "bricolage-700.woff2"],
  ["IBM Plex Sans", "400 500", "plex-sans.woff2"],
  ["IBM Plex Mono", "500", "plex-mono-500.woff2"]
];
const TOKENS = ["paper", "ink", "ink-soft", "ink-mute", "line", "brand", "brand-soft", "mint", "mint-soft"];

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
    // The product shown on the card is the homepage's own Positions Monitor
    // replica, captured at generation time -- so when the homepage's product
    // picture changes, the card is stale too.
    // The card's own version tag is written into the homepage after the card
    // is made, so it is left out here or every card would be born stale.
    product: sha(readFileSync(HOME, "utf8").replace(/og-card\.png\?v=[0-9a-f]+/g, "og-card.png")) + sha(readFileSync(HOME_CSS)) + sha(readFileSync(CSS)),
    fonts: FONTS.map(([, , f]) => sha(readFileSync(path.join(FONT_DIR, f)))).join(",")
  };
}

export const inputsHash = (i) => sha(JSON.stringify(i));

// ---------------------------------------------------------------------------
// WHERE THE CARD IS REFERENCED, and with which version.
//
// Telegram, WhatsApp, iMessage, X and LinkedIn cache a share image by its URL,
// often for days. A new PNG at the same address is invisible to them: the
// owner, on the day the card changed, shared deltamint.app and got the new
// words over the OLD picture. So every reference carries ?v=<hash of the
// PNG>. A new card is a new URL, which every one of them fetches afresh.
//
// The app (index.html) had no share tags at all, so a link to it previewed
// nothing current. It gets the same card, title and description, generated
// here into a marked block. %VITE_SITE_URL% is filled by Vite per build, so a
// staging app points at the staging site's card and production at production.
// ---------------------------------------------------------------------------
const APP_START = "<!-- share:start (generated by scripts/og-card.mjs — do not edit) -->";
const APP_END = "<!-- share:end -->";

function referenceFiles() {
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
  return [...walk(path.join(root, "landing/public")).filter((f) => f.endsWith(".html")), WORKER];
}

function appBlock(i, version) {
  const t = escape(`DeltaMint — ${i.title}`).replace(/"/g, "&quot;");
  const d = escape(i.description).replace(/"/g, "&quot;");
  const img = `%VITE_SITE_URL%/assets/og-card.png?v=${version}`;
  return [
    APP_START,
    `    <meta name="description" content="${d}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:site_name" content="DeltaMint" />`,
    `    <meta property="og:title" content="${t}" />`,
    `    <meta property="og:description" content="${d}" />`,
    `    <meta property="og:image" content="${img}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${t}" />`,
    `    <meta name="twitter:description" content="${d}" />`,
    `    <meta name="twitter:image" content="${img}" />`,
    `    ${APP_END}`
  ].join("\n");
}

const versionOf = (png) => sha(png).slice(0, 12);
const REF = /og-card\.png(\?v=[0-9a-f]+)?/g;

function syncReferences(i, version) {
  for (const f of referenceFiles()) {
    const text = readFileSync(f, "utf8");
    const next = text.replace(REF, `og-card.png?v=${version}`);
    if (next !== text) writeFileSync(f, next);
  }
  const app = readFileSync(APP_HTML, "utf8");
  const block = appBlock(i, version);
  const a = app.indexOf(APP_START);
  const b = app.indexOf(APP_END);
  const next = a >= 0 && b > a
    ? app.slice(0, a) + block + app.slice(b + APP_END.length)
    : app.replace('    <link rel="icon"', `    ${block}\n    <link rel="icon"`);
  if (next !== app) writeFileSync(APP_HTML, next);
}

function staleReference(i, version) {
  for (const f of referenceFiles()) {
    for (const m of readFileSync(f, "utf8").matchAll(REF)) {
      if (m[1] !== `?v=${version}`) {
        return `${path.relative(root, f)} links og-card.png without the current version (?v=${version}), so apps would keep showing their cached copy. Run: npm run og:card`;
      }
    }
  }
  if (!readFileSync(APP_HTML, "utf8").includes(appBlock(i, version))) {
    return "the app's share tags (index.html) do not match the homepage and current card. Run: npm run og:card";
  }
  return null;
}

// Returns null when the card is current, else the sentence saying why not.
export function checkCard() {
  let stamp;
  try { stamp = JSON.parse(readFileSync(STAMP, "utf8")); } catch { return "no stamp — the card has never been generated. Run: npm run og:card"; }
  if (stamp.inputs !== inputsHash(cardInputs())) {
    return "the homepage headline, description, logo or brand colours changed since og-card.png was made. Run: npm run og:card";
  }
  const png = readFileSync(PNG);
  if (stamp.png !== sha(png)) {
    return "og-card.png was replaced by hand. It is generated — run: npm run og:card";
  }
  return staleReference(cardInputs(), versionOf(png));
}

// The Positions Monitor, as the homepage renders it: desktop from the hero's
// wipe with only the DeltaMint side showing, phone from the hero's mobile
// view. Both are the site's own sample account.
async function captureProduct(chromium) {
  const { serve } = await import("./legal-pdf.mjs");
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const open = async (viewport, scale) => {
    const p = await browser.newPage({ viewport, deviceScaleFactor: scale });
    await p.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 302, headers: { location: `${base}/__fonts.css` } }));
    await p.route(/googletagmanager|hotjar|gstatic/, (r) => r.abort());
    await p.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await p.goto(`${base}/`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    return p;
  };
  try {
    const d = await open({ width: 1280, height: 900 }, 2);
    await d.addStyleTag({ content: `
      #wipe { --x: 0% !important; cursor: default; }
      #wipe .layer.brk, #wipe .handle, #wipe .wipe-lab, #wipe .wipe-range { display: none !important; }
      #wipe .layer.dm { clip-path: none !important; padding-top: 22px !important; }` });
    // Crop by sizing the element itself, not by clipping the window: a clip
    // below the fold is silently cut short.
    const wipeW = await d.$eval("#wipe", (e) => e.getBoundingClientRect().width);
    await d.addStyleTag({ content: `#wipe { height: ${Math.round(wipeW * 0.62)}px !important; overflow: hidden !important; }` });
    const desktop = await (await d.$("#wipe")).screenshot();

    const m = await open({ width: 390, height: 844 }, 3);
    const dm = await m.$('.hero-mobile .seg-b[data-view="dm"]');
    if (dm) { await dm.click(); await m.waitForTimeout(400); }
    const phoneW = await m.$eval(".hero-mobile .screen", (e) => e.getBoundingClientRect().width);
    await m.addStyleTag({ content: `.hero-mobile .seg { display: none !important; }
      .hero-mobile .screen { height: ${Math.round(phoneW * 2.05)}px !important; overflow: hidden !important; }` });
    const phone = await (await m.$(".hero-mobile .screen")).screenshot();
    return { desktop, phone };
  } finally {
    await browser.close();
    server.close();
  }
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
  const shots = await captureProduct(chromium);
  const img = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
  const fill = {
    FONTS: fontCss, TOKENS: i.tokens, LOCKUP: i.lockup, TITLE: escape(i.title), DESCRIPTION: escape(i.description),
    DESKTOP: img(shots.desktop), PHONE: img(shots.phone)
  };
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
  syncReferences(i, versionOf(png));
  console.log(`og-card.png written — "${i.title}" (v=${versionOf(png)}); every reference and the app's share tags updated`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const why = checkCard();
    console.log(why ? `og-card: out of date — ${why}` : "og-card: current");
    process.exit(why ? 1 : 0);
  }
  generate().catch((e) => { console.error(e.message); process.exit(1); });
}
