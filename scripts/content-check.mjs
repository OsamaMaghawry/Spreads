#!/usr/bin/env node
// Checks outbound copy against the rules that govern what may ship.
//
// docs/context/compliance.md is not style guidance. DeltaMint is not a
// broker-dealer or an adviser, and a single sentence that reads as a
// recommendation, a return claim or a promise is a regulatory problem rather
// than an editing one — while a broker's compliance team is actively reviewing
// the account.
//
// This catches what a pattern can catch: banned constructions, hard numbers
// next to profit words, the broker's name outside the places it belongs. It
// cannot judge tone or implication, which is what the `compliance-gate` agent
// is for. Both run; neither replaces the other.
//
//   npm run content:check                  every marketing page and blog draft
//   npm run content:check -- path/to.md    one file
//
// Exits non-zero on a failure so CI stops a publish rather than reporting it.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));

// Everything a stranger can read. Legal pages are checked too: they are the one
// place the broker may be named, but they may not make claims either.
const SCAN_DIRS = ["content/blog", "landing/public", "growth/queue"];

// The broker's name stays off marketing copy except where an integration is
// genuinely being described. A privacy policy that hides who receives user data
// is a worse problem than the naming rule, so legal pages are exempt.
const BROKER_NAMES = [/\balpaca\b/i];
const BROKER_ALLOWED = [/landing\/public\/privacy\//, /landing\/public\/terms\//, /docs\//];

// Each rule is a construction that changes what the product legally is. The
// note says why, because a failure with no reason gets suppressed rather than
// fixed.
// The shape of a post. Numbers taken from the two posts we are happy with:
// 1,038 and 1,088 words of PROSE (headings, captions and table cells do not
// count -- they are structure, and counting them lets a thin post pad itself
// with subheadings), five sections each, three diagrams and a table between
// them. The floor sits just under the pair so they define it rather than
// fail it; the target in the brief is higher.
const MIN_WORDS = 1000;
const MIN_SECTIONS = 4;
const MIN_VISUALS = 2;
const FRONT_MATTER = ["title", "slug", "excerpt", "meta_description", "author", "category", "series_order", "tags"];

const RULES = [
  {
    id: "advice",
    why: "reads as investment advice; the product may list what matches a filter, never what to do",
    patterns: [
      /\b(we|deltamint)\s+(recommend|advise|suggest)\b/i,
      /\byou\s+should\s+(buy|sell|open|close|trade|enter|exit)\b/i,
      /\b(best|top|hottest)\s+(trade|trades|stock|stocks|play|plays)\b/i,
      /\b(buy|sell)\s+signals?\b/i,
      /\btrade\s+ideas?\b/i,
      /\bpicks?\s+of\s+the\s+(day|week)\b/i
    ]
  },
  {
    id: "performance",
    why: "a performance or return claim, including an implied one",
    patterns: [
      /\b\d+(\.\d+)?\s*%\s*(return|returns|gain|gains|profit|win\s*rate|monthly|annually|per\s+year)\b/i,
      /\b(average|typical|expected)\s+(return|profit|gain)\b/i,
      /\bmake\s+\$?\d/i,
      /\b(double|triple)\s+your\s+(money|account|portfolio)\b/i,
      /\bconsistent(ly)?\s+profitab/i,
      /\bproven\s+(strategy|system|results)\b/i
    ]
  },
  {
    id: "guarantee",
    why: "a guarantee; nothing about a market outcome may be promised",
    patterns: [
      /\bguarantee(d|s)?\b/i,
      /\brisk[- ]free\b/i,
      /\bcan'?t\s+lose\b/i,
      /\bsure\s+thing\b/i,
      /\bno\s+risk\b/i
    ]
  },
  {
    id: "broker-dealer",
    why: "implies broker-dealer status; DeltaMint holds no funds or securities and opens no accounts",
    patterns: [
      /\bwe\s+(execute|place|route)\s+(your\s+)?(trades|orders)\b/i,
      /\byour\s+(funds|money|securities)\s+(are|is)\s+(held|safe|protected)\s+(with|by)\s+us\b/i,
      /\bour\s+brokerage\b/i,
      /\bopen\s+an?\s+account\s+with\s+us\b/i
    ]
  },
  {
    id: "social-trading",
    why: "copy, mirror or social trading, which will not be approved at all without registered status",
    patterns: [
      /\b(copy|mirror|social)\s+trad(e|ing)\b/i,
      /\bfollow\s+(top|our|expert)\s+traders?\b/i,
      /\bsignal\s+(provider|service)\b/i,
      /\blead\s+trader\b/i
    ]
  },
  {
    id: "autonomy",
    why: "describes the software as deciding; automated actions are rules the user configured and the software executed",
    patterns: [
      /\b(our\s+)?(ai|algorithm|system|bot)\s+(decides|chooses|picks|knows\s+when)\b/i,
      /\btrades\s+for\s+you\b/i,
      /\bhands[- ]free\s+(profits|income|trading)\b/i,
      /\bset\s+it\s+and\s+forget\s+it\b/i
    ]
  },
  {
    id: "vocabulary",
    why: "on the positioning playbook's avoid-list; this audience reads these words as a scam tell",
    patterns: [
      /\bai[- ]powered\b/i,
      /\bpassive\s+income\b/i,
      /\bconsistent\s+income\b/i,
      /\bbeat\s+the\s+market\b/i,
      /\balerts?\s+you\s+(on\s+)?what\s+to\s+trade\b/i
    ]
  },
  {
    id: "testimonial",
    why: "a testimonial about results; with two users there is nothing truthful to quote yet",
    patterns: [
      /\b(join|trusted\s+by)\s+\d[\d,]*\+?\s+(traders|users|investors|customers)\b/i,
      /\bthousands\s+of\s+(traders|users)\b/i
    ]
  }
];

const results = [];
const ok = (name, detail = "") => results.push({ level: "ok", name, detail });
const fail = (name, detail) => results.push({ level: "fail", name, detail });
const skip = (name, detail) => results.push({ level: "skip", name, detail });

function filesUnder(dir) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(md|html)$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

// Markup and front matter are not prose. Checking them produces false failures
// on class names and metadata, which is how a check gets switched off.
function prose(text, file) {
  let body = text;
  if (file.endsWith(".md")) body = body.replace(/^---\n[\s\S]*?\n---\n/, "");
  // Queue files quote forum posters verbatim; their words are evidence, not
  // our copy, and the rules govern only what we would publish. Blockquotes
  // are stripped there — and only there — so a poster asking about "passive
  // income" doesn't fail the reply drafted to answer them.
  if (/growth[\\/]queue/.test(file)) body = body.replace(/^\s*>.*$/gm, " ");
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

// "We do not guarantee the availability of any brokerage connection" is a
// disclaimer — the opposite of the thing the rule is looking for. Reading the
// words immediately before a match is what separates a promise from its denial,
// and a check that fails on disclaimers is a check that gets switched off.
const NEGATED = /\b(not|no|never|cannot|can'?t|don'?t|doesn'?t|without|nothing)\b[^.]{0,40}$/i;

function isNegated(text, index) {
  return NEGATED.test(text.slice(Math.max(0, index - 60), index));
}

// The broker may be named where an integration is genuinely being described —
// which is exactly what a "Connect your broker" section does. The rule exists
// to stop the name being used as marketing weight, not to hide the integration.
// "Alpaca-only for now" and "routes through Alpaca" are the honest-limitation
// disclosures the playbook requires in forum replies — accuracy, not weight.
const INTEGRATION_CONTEXT = /\b(connect|connects|connecting|works with|integration|integrates|supported|brokerage you already use|your broker|only\s+supports?|[a-z]+[- ]only\b|routes?\s+through)\b/i;

function inIntegrationContext(text, index) {
  return INTEGRATION_CONTEXT.test(text.slice(Math.max(0, index - 300), index + 120));
}

// A figure shown to demonstrate what a screen displays is not a claim about
// what anyone earned — but only if the page says so, near enough that a reader
// meets the label before the number. Marking figures as illustrative is the
// legitimate way to show a product; this recognises it and nothing else.
const ILLUSTRATIVE = /\b(example|sample|illustrat\w+|hypothetical|not\s+(a\s+)?(forecast|results|typical))\b/i;

function isIllustrative(text, index) {
  return ILLUSTRATIVE.test(text.slice(Math.max(0, index - 400), index + 200));
}

// A diagram carries the same exposure as a sentence.
//
// compliance-gate had to open the three SVGs by hand to clear a post, because
// this file only ever read the markdown: a performance claim or a broker's
// name inside a <text> label would have shipped unread. The captions and
// labels a reader actually sees are prose, so they go through the same rules
// as prose, and a failure is reported against the post that embeds them.
function svgProse(file) {
  const out = [];
  const raw = readFileSync(file, "utf8");
  for (const [, src] of raw.matchAll(/!\[[^\]]*\]\((\/assets\/[\w/.-]+\.svg)\)/g)) {
    const asset = path.join(root, "landing/public", src);
    if (!existsSync(asset)) continue;
    const svg = readFileSync(asset, "utf8");
    const words = [
      ...[...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]),
      ...[...svg.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1])
    ];
    out.push({ src, text: words.join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") });
  }
  return out;
}

function checkFile(file) {
  const rel = path.relative(root, file);
  const raw = readFileSync(file, "utf8");
  const text = prose(raw, file);
  let clean = true;

  if (rel.startsWith("content/blog") && rel.endsWith(".md")) {
    for (const { src, text: label } of svgProse(file)) {
      for (const rule of RULES) {
        for (const pattern of rule.patterns) {
          const hit = label.match(pattern);
          if (!hit || isNegated(label, hit.index)) continue;
          if (rule.id === "performance" && isIllustrative(label, hit.index)) continue;
          clean = false;
          fail(`${rel} · ${rule.id}`, `"${hit[0].trim()}" in ${src} — ${rule.why}`);
        }
      }
      for (const pattern of BROKER_NAMES) {
        const hit = label.match(pattern);
        if (!hit || inIntegrationContext(label, hit.index)) continue;
        clean = false;
        fail(`${rel} · broker-name`, `"${hit[0]}" in ${src} — a label in a diagram is read like any other line`);
      }
    }
  }

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const hit = text.match(pattern);
      if (!hit || isNegated(text, hit.index)) continue;
      if (rule.id === "performance" && isIllustrative(text, hit.index)) continue;
      clean = false;
      fail(`${rel} · ${rule.id}`, `"${hit[0].trim()}" — ${rule.why}`);
    }
  }

  if (!BROKER_ALLOWED.some((allowed) => allowed.test(rel))) {
    for (const pattern of BROKER_NAMES) {
      const hit = text.match(pattern);
      if (!hit || inIntegrationContext(text, hit.index)) continue;
      clean = false;
      fail(
        `${rel} · broker-name`,
        `"${hit[0]}" — the broker is named only where an integration is genuinely described, or on legal pages where accuracy requires it`
      );
    }
  }

  // Headlines carry the register. An exclamation mark or an emoji in one is
  // the playbook's shorthand for "written by marketing" — banned outright.
  // Queue files are exempt: their headings are other people's thread titles
  // plus working-state markers, and none of it gets published as a headline.
  if (file.endsWith(".md") && !/growth[\\/]queue/.test(rel)) {
    for (const line of raw.split("\n")) {
      if (!/^#{1,6}\s/.test(line)) continue;
      if (/!/.test(line) || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) {
        clean = false;
        fail(`${rel} · vocabulary`, `"${line.trim()}" — no exclamation marks or emoji in a headline`);
      }
    }
  }

  // Every page a stranger reads has to say what the product is not.
  if (rel.startsWith("content/blog") && !/not\s+(investment\s+)?advice/i.test(text)) {
    clean = false;
    fail(`${rel} · disclaimer`, "no 'not investment advice' line; every published post carries one");
  }

  // The shape of a post, enforced.
  //
  // The brief used to say "700-1200 words, subheadings that say something"
  // and nothing else, so a 150-word note with two headings and no picture
  // passed every gate and reached the blog. The two posts we are happy with
  // are 1,207 and 1,279 words with three diagrams and a table between them;
  // that is the standard, and a standard nobody can fail is not one.
  if (rel.startsWith("content/blog") && rel.endsWith(".md")) {
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
    const structural = /^\s*(#|!\[|\||[-*>]\s|\d+\.\s|    )/;
    const words = body
      .split("\n")
      .filter((l) => !structural.test(l))
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    if (words < MIN_WORDS) {
      clean = false;
      fail(`${rel} · length`, `${words} words of prose; a post is at least ${MIN_WORDS} — below that it reads as a note`);
    }

    const sections = body.split("\n").filter((l) => /^##\s+\S/.test(l)).length;
    if (sections < MIN_SECTIONS) {
      clean = false;
      fail(`${rel} · sections`, `${sections} '##' sections; a post has at least ${MIN_SECTIONS}, each one a claim rather than a label`);
    }

    // Only the figure form the renderer actually turns into an <img>, and
    // only if the file is really there -- a caption pointing at a missing
    // asset renders as a broken image on the live blog.
    const figures = [...body.matchAll(/^!\[([^\]]*)\]\((\/assets\/[\w/.-]+)\)$/gm)];
    for (const [, caption, src] of figures) {
      if (!existsSync(path.join(root, "landing/public", src))) {
        clean = false;
        fail(`${rel} · figure`, `${src} is referenced but not in landing/public${src.replace(/[^/]+$/, "")} — it would render as a broken image`);
      }
      if (caption.trim().split(/\s+/).length < 6) {
        clean = false;
        fail(`${rel} · figure`, `"${caption}" — a caption is a sentence that stands on its own; a skimming reader reads only captions`);
      }
    }
    if (figures.length < 1) {
      clean = false;
      fail(`${rel} · figure`, "no diagram; every post carries at least one original SVG in landing/public/assets/blog/");
    }

    const tables = body.split("\n\n").filter((b) => {
      const lines = b.trim().split("\n");
      return lines.length >= 2 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[1]);
    }).length;
    if (figures.length + tables < MIN_VISUALS) {
      clean = false;
      fail(
        `${rel} · visuals`,
        `${figures.length} figure(s) and ${tables} table(s); a post carries at least ${MIN_VISUALS} between them`
      );
    }

    for (const key of FRONT_MATTER) {
      if (!new RegExp(`^${key}:\\s*\\S`, "m").test(raw)) {
        clean = false;
        fail(`${rel} · front-matter`, `no '${key}:' — publish-blog.mjs needs it to file the post under the right hub`);
      }
    }
    const meta = raw.match(/^meta_description:\s*(.+)$/m);
    if (meta && meta[1].trim().length > 160) {
      clean = false;
      fail(`${rel} · front-matter`, `meta_description is ${meta[1].trim().length} characters; a search result shows about 160`);
    }
  }

  if (clean) ok(rel);
}

const targets = args.length > 0
  ? args.map((a) => path.resolve(root, a))
  : SCAN_DIRS.flatMap(filesUnder);

if (targets.length === 0) skip("content", "nothing to check yet — no blog drafts and no marketing pages found");
targets.filter(existsSync).forEach(checkFile);

const mark = { ok: "  ok  ", fail: " FAIL ", skip: " skip " };
for (const r of results) {
  console.log(`[${mark[r.level]}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}

const failed = results.filter((r) => r.level === "fail");
console.log(
  `\n${results.filter((r) => r.level === "ok").length} clean · ${failed.length} failure(s) across ${targets.length} file(s)`
);

if (failed.length > 0) {
  console.error(
    "\nThese are compliance rules, not style notes. See docs/context/compliance.md before rewording."
  );
  process.exit(1);
}
