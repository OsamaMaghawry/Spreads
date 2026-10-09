import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

// The icons are generated (scripts/icons.mjs). These checks fail if one is
// cut off again -- every hand-made raster lost the bottom fifth of the tile,
// which is what Google and Claude showed -- or if the site and the app drift.

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url));

// Just enough PNG: 8-bit RGB or RGBA, not interlaced -- what a Chromium
// screenshot writes. Returns the alpha at (x, y).
function decodePng(buf) {
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", "not a PNG");
  let pos = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.subarray(pos + 4, pos + 8).toString("latin1");
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "8-bit only");
      type = data[9];
      assert.ok(type === 2 || type === 6, `colour type ${type}`);
      assert.equal(data[12], 0, "not interlaced");
    }
    if (kind === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? px[(y - 1) * stride + i - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      px[y * stride + i] = (x + pred) & 0xff;
    }
  }
  return { width, height, alpha: (x, y) => (bpp === 4 ? px[y * stride + x * 4 + 3] : 255) };
}

function icoFrames(buf) {
  assert.equal(buf.readUInt16LE(2), 1, "not an icon");
  const out = [];
  for (let i = 0; i < buf.readUInt16LE(4); i++) {
    const e = 6 + 16 * i;
    const size = buf[e] || 256;
    const png = buf.subarray(buf.readUInt32LE(e + 12), buf.readUInt32LE(e + 12) + buf.readUInt32LE(e + 8));
    out.push({ size, png: decodePng(png) });
  }
  return out;
}

// Opaque at the middle of every edge: a tile cut short loses its bottom edge.
function assertWholeTile({ width, height, alpha }, label) {
  const mid = (n) => Math.floor(n / 2);
  for (const [x, y, edge] of [[mid(width), 0, "top"], [mid(width), height - 1, "bottom"], [0, mid(height), "left"], [width - 1, mid(height), "right"]]) {
    assert.ok(alpha(x, y) > 200, `${label}: the ${edge} edge of the tile is missing`);
  }
}

test("favicon.ico: 16, 32 and 48px frames, each the whole tile", () => {
  const frames = icoFrames(read("landing/public/favicon.ico"));
  assert.deepEqual(frames.map((f) => f.size), [16, 32, 48]);
  for (const f of frames) {
    assert.equal(f.png.width, f.size);
    assert.equal(f.png.height, f.size);
    assertWholeTile(f.png, `${f.size}px frame`);
  }
});

test("apple-touch-icon.png: 180px, square corners, nothing transparent at the edge", () => {
  const png = decodePng(read("landing/public/assets/apple-touch-icon.png"));
  assert.equal(png.width, 180);
  assert.equal(png.height, 180);
  assertWholeTile(png, "touch icon");
  for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179]]) {
    assert.equal(png.alpha(x, y), 255, `corner ${x},${y} is transparent; iOS would show it black`);
  }
});

test("the app's icons are the site's", () => {
  for (const [site, app] of [
    ["landing/public/favicon.ico", "public/favicon.ico"],
    ["landing/public/assets/apple-touch-icon.png", "public/apple-touch-icon.png"],
    ["landing/public/assets/favicon.svg", "public/favicon.svg"]
  ]) {
    assert.ok(read(site).equals(read(app)), `${app} differs from ${site}: run npm run icons`);
  }
});
