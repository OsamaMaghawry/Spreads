import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSender } from "./emailPayload.ts";

// WHICH MAILBOX EACH EMAIL COMES FROM, pinned.
//
// The owner asked for one thing -- *"I want to send with the Support email not
// Agent. Agents is internal only."* -- and the change was applied to every
// email in the product, internal ones included. *"Agents is internal email for
// our agentic workflow. Now everything has changed to Support!!!!!"*
//
// The distinction is by READER and cannot be read off a call site, so these
// assert it directly: a customer never receives agents@, and our own
// build-and-integrity mail never arrives as support@.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const email = read("./email.ts");
const equityHistory = read("../equityHistory/index.ts");
const publishBlog = read("../../../.github/workflows/publish-blog.yml");

test("there are exactly two senders, and the customer-facing one is the default", () => {
  assert.match(email, /support:\s*Deno\.env\.get\("ALERT_EMAIL_FROM"\)\s*\|\|\s*"DeltaMint <support@deltamint\.app>"/);
  assert.match(email, /agents:\s*Deno\.env\.get\("AGENT_EMAIL_FROM"\)\s*\|\|\s*"DeltaMint Agents <agents@deltamint\.app>"/);
  // A caller that says nothing sends as the brand. Getting this default wrong
  // in the other direction puts "Agents" in front of a customer.
  assert.match(email, /from:\s*string\s*=\s*SENDER\.support/);
});

test("both addresses parse into what Brevo wants", () => {
  assert.deepEqual(parseSender("DeltaMint <support@deltamint.app>"), {
    name: "DeltaMint", email: "support@deltamint.app"
  });
  assert.deepEqual(parseSender("DeltaMint Agents <agents@deltamint.app>"), {
    name: "DeltaMint Agents", email: "agents@deltamint.app"
  });
});

test("the sender reaches the provider payload instead of a captured constant", () => {
  // The bug this guards: `from` was a module-level FROM closed over by the
  // send, so a per-call sender would have been accepted and silently ignored.
  assert.match(email, /brevoPayload\(from,\s*to,\s*subject,\s*html,\s*text\)/);
  assert.equal(/brevoPayload\(FROM\b/.test(email), false);
});

test("stored-history drift mail comes from agents, not support", () => {
  // Names accounts, columns and stored days; exists for whoever maintains
  // this. Both the scheduled send and the preview, or the preview stops
  // showing what the real one looks like.
  const sends = equityHistory.match(/await sendEmail\([^)]*\)/g) || [];
  assert.equal(sends.length, 2, `expected 2 sends in equityHistory, found ${sends.length}`);
  for (const s of sends) assert.match(s, /SENDER\.agents/);
});

test("a failed publish tells agents, and is not addressed to support", () => {
  assert.match(publishBlog, /m\["From"\] = "DeltaMint Agents <agents@deltamint\.app>"/);
  assert.match(publishBlog, /m\["To"\] = "agents@deltamint\.app"/);
  assert.equal(/m\["To"\] = "support@deltamint\.app"/.test(publishBlog), false);
});

test("customer mail is never sent as agents", () => {
  // The three functions a customer actually hears from. None of them may name
  // the agents sender; they take the default, which is support.
  for (const p of ["../sendDigest/index.ts", "../positionWatch/index.ts", "../weeklyDigest/index.ts"]) {
    const src = read(p);
    assert.equal(/SENDER\.agents/.test(src), false, `${p} must not send as agents@`);
  }
});

test("the address a reader is told to reply to stays support", () => {
  // The digest body hands out an address for "if a number here looks wrong".
  // It has to be a mailbox a customer's reply reaches.
  const digest = read("./weeklyDigestEmail.ts");
  assert.match(digest, /support@deltamint\.app/);
  assert.equal(/agents@deltamint\.app/.test(digest), false);
});
