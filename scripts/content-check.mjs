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

function checkFile(file) {
  const rel = path.relative(root, file);
  const raw = readFileSync(file, "utf8");
  const text = prose(raw, file);
  let clean = true;

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
