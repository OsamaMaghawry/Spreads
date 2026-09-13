import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSender, brevoPayload } from "./emailPayload.ts";

test("splits a display name from the address, which Brevo needs separately", () => {
  assert.deepEqual(parseSender("DeltaMint <support@deltamint.app>"), {
    name: "DeltaMint",
    email: "support@deltamint.app"
  });
});

test("a bare address has no name rather than an empty one", () => {
  assert.deepEqual(parseSender("support@deltamint.app"), { email: "support@deltamint.app" });
});

test("tolerates quotes and stray whitespace", () => {
  assert.deepEqual(parseSender('  "DeltaMint"  <support@deltamint.app>  '), {
    name: "DeltaMint",
    email: "support@deltamint.app"
  });
});

test("uses Brevo's field names, not Resend's", () => {
  const p = brevoPayload(
    "DeltaMint <support@deltamint.app>",
    "osamamaghawry@gmail.com",
    "Alert",
    "<p>hi</p>",
    "hi"
  );
  assert.deepEqual(p, {
    sender: { name: "DeltaMint", email: "support@deltamint.app" },
    to: [{ email: "osamamaghawry@gmail.com" }],
    subject: "Alert",
    htmlContent: "<p>hi</p>",
    textContent: "hi"
  });
  // The Resend spellings must not survive the swap.
  for (const dead of ["from", "html", "text"]) {
    assert.equal(dead in p, false, `${dead} is Resend's field, not Brevo's`);
  }
});

test("omits textContent when there is no plain-text part", () => {
  const p = brevoPayload("a@b.c", "d@e.f", "s", "<p>h</p>");
  assert.equal("textContent" in p, false);
});
