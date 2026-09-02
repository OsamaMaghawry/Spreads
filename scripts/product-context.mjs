#!/usr/bin/env node
// Regenerates docs/product-context.md from the codebase.
//
// The point is a single file that describes what this product actually is —
// accurate enough to hand to a model, a new contributor, or a compliance
// reviewer without anyone first re-reading the source. Everything below is
// derived from the repository rather than written by hand, so it cannot drift:
// when a screen or a function is added, this file changes with it, and CI fails
// if the committed copy no longer matches what the code says.
//
//   npm run context          regenerate
//   npm run context:check    fail if the committed copy is stale (used in CI)
//
// Every input must be a tracked file. Nothing here may derive from git history:
// a `git log` section used to exist, and because each new commit — the merge
// commit included — changed its output, the committed copy was stale the moment
// it was written and CI could never pass on main. Git history is available from
// git; duplicating it here bought nothing and cost the guarantee.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const dirs = (p) => (existsSync(path.join(root, p)) ? readdirSync(path.join(root, p), { withFileTypes: true }) : []);

/** First `//` comment block above the handler, as one line — the author's own
 *  summary. Imports and blank lines are skipped, since these files open with
 *  them and the describing comment sits underneath. */
function leadingComment(source) {
  const lines = [];
  for (const line of source.split("\n")) {
    const t = line.trim();
    if (t.startsWith("//")) lines.push(t.replace(/^\/\/\s?/, ""));
    else if (lines.length > 0) break;                 // block ended
    else if (t === "" || t.startsWith("import ")) continue;
    else break;                                       // real code before any comment
  }
  // Keep it to the first sentence; the rest is implementation detail.
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  const stop = text.search(/\.\s/);
  return stop === -1 ? text : text.slice(0, stop + 1);
}

function screens() {
  return dirs("src/pages")
    .filter((f) => f.name.endsWith(".jsx"))
    .map((f) => f.name.replace(/\.jsx$/, ""))
    .sort();
}

function serverFunctions() {
  return dirs("supabase/functions")
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => {
      const entry = path.join("supabase/functions", d.name, "index.ts");
      const summary = existsSync(path.join(root, entry)) ? leadingComment(read(entry)) : "";
      return { name: d.name, summary };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Top-level keys of the object computeStats() returns — the analytics vocabulary. */
function metrics() {
  const src = read("src/lib/analytics.js");
  const start = src.indexOf("\n  return {");
  if (start === -1) return [];
  const body = src.slice(start, src.indexOf("\n  };", start));
  const keys = [...body.matchAll(/^\s{4}([a-zA-Z][\w]*)[,:]/gm)].map((m) => m[1]);
  return [...new Set(keys)];
}

function schema() {
  const files = dirs("supabase/migrations").filter((f) => f.name.endsWith(".sql")).map((f) => f.name).sort();
  const tables = new Map();
  for (const file of files) {
    const sql = read(path.join("supabase/migrations", file));
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const cols = m[2]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !/^(primary key|unique|check|constraint|foreign key)/i.test(l))
        .map((l) => l.split(/\s+/)[0])
        .filter((c) => /^\w+$/.test(c));
      tables.set(m[1], new Set(cols));
    }
    for (const m of sql.matchAll(/alter table (?:only )?public\.(\w+)[\s\S]*?add column (?:if not exists )?(\w+)/g)) {
      if (tables.has(m[1])) tables.get(m[1]).add(m[2]);
    }
  }
  return [...tables].map(([name, cols]) => ({ name, cols: [...cols] }));
}

/** The kinds a single (non-spread) position can be, from positionKinds.ts — the
 *  vocabulary the dashboard, the watch and the risk model share. */
function positionKinds() {
  const p = "supabase/functions/_shared/positionKinds.ts";
  if (!existsSync(path.join(root, p))) return [];
  const src = read(p);
  const block = src.slice(src.indexOf("export const KINDS"), src.indexOf("} as const", src.indexOf("export const KINDS")));
  return [...block.matchAll(/\w+:\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

/** One line per component folder under src/components — what the reader can
 *  find where. Counts are of .jsx files; the summary is the folder's own
 *  leading comment where a file carries one. */
function componentAreas() {
  return dirs("src/components")
    .filter((d) => d.isDirectory() && d.name !== "ui")
    .map((d) => {
      const files = dirs(path.join("src/components", d.name)).filter((f) => f.name.endsWith(".jsx") || f.name.endsWith(".js"));
      return { name: d.name, files: files.map((f) => f.name.replace(/\.(jsx|js)$/, "")).sort() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The ten most recent lines of docs/ops/shipped.md — what a user can newly
 *  do. Written by the duty engineer; tracked, so it may be read here. */
function shipped() {
  const p = "docs/ops/shipped.md";
  if (!existsSync(path.join(root, p))) return [];
  return read(p).split("\n").filter((l) => l.startsWith("- ")).slice(0, 10).map((l) => l.slice(2));
}

/** The `###` headings of docs/deferred-work.md — what is knowingly not built. */
function deferred() {
  if (!existsSync(path.join(root, "docs/deferred-work.md"))) return [];
  return [...read("docs/deferred-work.md").matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
}

/** Hand-written context from docs/context/, inlined so the output is one file.
 *  These carry the judgement — brand, positioning, compliance — that cannot be
 *  derived from source. Edit those files; this one is assembled from them. */
function contextDoc(name) {
  const p = path.join("docs/context", `${name}.md`);
  if (!existsSync(path.join(root, p))) return `_(missing: ${p})_`;
  // Demote headings by one level so they nest under this document's sections.
  return read(p)
    .replace(/^# .*$/m, "")
    .replace(/^(#{1,5}) /gm, "#$1 ")
    .trim();
}

const out = `<!-- GENERATED by scripts/product-context.mjs — do not edit by hand.
     Run \`npm run context\` after changing screens, functions, schema or analytics. -->

# DeltaMint — product context

Everything worth knowing about this product in one file: what it is, how it is
built, how it should look and sound, where it sits in its market, and what its
broker approval requires. Give this to a model, a contributor or a reviewer
instead of explaining any of it from memory.

Two kinds of content are assembled here, and they are maintained differently:

- **Derived from the code** — screens, functions, schema, analytics, history.
  Regenerated on every run, so it cannot drift.
- **Written judgement** — brand, positioning, compliance. Lives in
  \`docs/context/\`. Edit those files, then run \`npm run context\`.

Never edit this file directly; it is overwritten. CI fails when it no longer
matches its sources.

## What it is

DeltaMint is a browser tool for self-directed options traders who run
defined-risk multi-leg positions — credit spreads and iron condors. It holds no
customer funds or securities, executes nothing itself, and gives no advice.
Users link their own brokerage account; every order is placed at their
direction, through that account.

Its distinguishing job is **portfolio comprehension**: brokers list option legs
individually, so one iron condor appears as four unrelated rows. DeltaMint pairs
legs back into the structure that created them and reports each position's real
credit, risk, break-evens and value. That matters more the more positions a
trader holds, which is the constraint the product exists to lift.

Revenue is a flat monthly subscription. No commission, no share of profits,
nothing contingent on trading activity.

## Architecture

- **Frontend** — Vite + React single-page app, static assets on Cloudflare Workers.
- **Backend** — Supabase: Postgres with row-level security, Auth, and Deno edge functions.
- **Broker access** — every brokerage API call happens in an edge function, never the browser.
- **Marketing site** — separate static Cloudflare Worker (\`landing/\`).

## Screens

${screens().map((s) => `- ${s}`).join("\n")}

## Position kinds

Anything the pairing cannot explain as a vertical spread is still shown, as
one of these (\`supabase/functions/_shared/positionKinds.ts\`). A naked call's
maximum loss is withheld, not zeroed, and every total carrying one says it is
incomplete.

${positionKinds().map((k) => `- ${k}`).join("\n")}

## Components, by area

${componentAreas().map((a) => `- **${a.name}** — ${a.files.join(", ")}`).join("\n")}

## Recently shipped

From \`docs/ops/shipped.md\`, newest first.

${shipped().map((l) => `- ${l}`).join("\n") || "_(nothing recorded yet)_"}

## Server functions

Each runs as its own bundle carrying a copy of what it imports from \`_shared/\`,
so a change to shared code requires redeploying all of them.

${serverFunctions().map((f) => `- **${f.name}** — ${f.summary || "(no summary comment)"}`).join("\n")}

## Database

Row-level security scopes every table to \`auth.uid()\`. Brokerage credentials are
encrypted with AES-256-GCM before storage, with the key held in the edge
function environment rather than the database, and the credential columns are
revoked from the browser role entirely.

${schema().map((t) => `- **${t.name}** — ${t.cols.join(", ")}`).join("\n")}

## Analytics vocabulary

Computed by \`src/lib/analytics.js\` from reconstructed closed trades. Notable for
being premium-seller specific rather than generic profit and loss: credit
capture is the kept share of premium sold, and return on risk is measured
against peak *concurrent* collateral rather than the sum of every trade.

${metrics().map((m) => `\`${m}\``).join(" · ")}

## Known gaps

Deliberately not built yet — see \`docs/deferred-work.md\`.

${deferred().map((d) => `- ${d}`).join("\n") || "- (none recorded)"}

---

# Brand and identity

${contextDoc("brand")}

---

# Positioning and market

${contextDoc("positioning")}

---

# Compliance and broker approval

${contextDoc("compliance")}
`;

const target = path.join(root, "docs/product-context.md");

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current.trim() !== out.trim()) {
    console.error("docs/product-context.md is out of date. Run `npm run context` and commit the result.");
    process.exit(1);
  }
  console.log("docs/product-context.md is current.");
} else {
  writeFileSync(target, out);
  console.log("Wrote docs/product-context.md");
}
