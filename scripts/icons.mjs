#!/usr/bin/env node
// The site's and the app's icons -- favicon.ico and apple-touch-icon.png --
// GENERATED from the one drawing, landing/public/assets/favicon.svg.
//
// The owner, seeing the icon beside DeltaMint in Claude's connector list and in
// Google's results: "Why this thing is cropped like this." The rasters had been
// made by hand once, and every one of them lost the bottom fifth of the tile:
// the 48px frame Google shows stopped at row 39, the touch icon at row 139 of
// 180. The SVG was fine, so every browser tab looked right and nothing noticed.
//
// So now nothing is made by hand:
//
//   favicon.ico            16, 32 and 48px frames of the tile (PNG inside ICO)
//   apple-touch-icon.png   180px, the tile drawn to the edges with square
//                          corners: iOS and Android round it themselves, and
//                          a transparent corner shows up as black there
//
// written to both the landing site and the app, which also gets its copy of
// the SVG from here, so the two can never drift. scripts/icons.test.js fails
// if a frame is cut off again or the copies differ.
//
//   npm run icons

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (rel) => path.join(root, rel);

const SOURCE = "landing/public/assets/favicon.svg";
const OUT = {
  ico: ["landing/public/favicon.ico", "public/favicon.ico"],
  touch: ["landing/public/assets/apple-touch-icon.png", "public/apple-touch-icon.png"],
  svg: ["public/favicon.svg"]
};
const ICO_SIZES = [16, 32, 48];
const TOUCH_SIZE = 180;

function loadChromium() {
  const require = createRequire(import.meta.url);
  try { return require("playwright").chromium; } catch {
    return require(path.join(process.env.NODE_PATH || "", "playwright")).chromium;
  }
}

// The drawing at an exact pixel size. `square` drops the corner radius.
async function render(page, svg, size, { square = false } = {}) {
  const drawn = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\swidth="\d+"\s+height="\d+"/, ` width="${size}" height="${size}"`)
    .replace(/(<rect[^>]*?)\srx="[\d.]+"/, square ? "$1" : "$&");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${drawn}</body></html>`
  );
  return page.screenshot({ omitBackground: !square, clip: { x: 0, y: 0, width: size, height: size } });
}

// ICO with PNG frames (supported by every browser and by Windows since Vista).
function ico(frames) {
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...frames.map((f) => f.png)]);
}

const svg = readFileSync(at(SOURCE), "utf8");
const browser = await loadChromium().launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const frames = [];
  for (const size of ICO_SIZES) frames.push({ size, png: await render(page, svg, size) });
  const touch = await render(page, svg, TOUCH_SIZE, { square: true });
  const icon = ico(frames);
  for (const f of OUT.ico) writeFileSync(at(f), icon);
  for (const f of OUT.touch) writeFileSync(at(f), touch);
  for (const f of OUT.svg) writeFileSync(at(f), svg);
  console.log(`icons: favicon.ico (${ICO_SIZES.join(", ")}px), apple-touch-icon.png (${TOUCH_SIZE}px), from ${SOURCE}`);
} finally {
  await browser.close();
}
