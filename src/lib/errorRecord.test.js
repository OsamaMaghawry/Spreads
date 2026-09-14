import test from "node:test";
import assert from "node:assert/strict";
import { describeError, recordError, errorReport } from "./errorRecord.js";

test("describeError captures the message, stack and component stack", () => {
  const e = new Error("Cannot read properties of undefined (reading 'map')");
  const d = describeError(e, { componentStack: "at CloseDialog" }, "https://x/account/1");
  assert.equal(d.message, "Cannot read properties of undefined (reading 'map')");
  assert.ok(d.stack.includes("Error"));
  assert.equal(d.componentStack, "at CloseDialog");
  assert.equal(d.url, "https://x/account/1");
});

test("describeError survives a thrown non-Error", () => {
  // `throw "boom"` and `throw undefined` both reach a boundary.
  assert.equal(describeError("boom").message, "boom");
  assert.equal(describeError(undefined).message, "Unknown error");
  assert.equal(describeError(null).message, "Unknown error");
});

test("recordError writes the record where it can be read back", () => {
  const win = { location: { href: "https://dev-dash.deltamint.app/account/1" } };
  recordError(new Error("boom"), { componentStack: "at CloseDialog" }, win);
  assert.equal(win.__deltamintLastError.message, "boom");
  assert.equal(win.__deltamintLastError.componentStack, "at CloseDialog");
  assert.equal(win.__deltamintLastError.url, "https://dev-dash.deltamint.app/account/1");
});

test("recordError never throws, whatever the window does", () => {
  // THE POINT OF THE try/catch: a second throw here would unmount the
  // boundary itself and put the blank page straight back.
  const frozen = Object.freeze({ location: { href: "x" } });
  assert.doesNotThrow(() => recordError(new Error("boom"), null, frozen));
  assert.doesNotThrow(() => recordError(new Error("boom"), null, null));
  const hostile = { get location() { throw new Error("nope"); } };
  assert.doesNotThrow(() => recordError(new Error("boom"), null, hostile));
});

test("recordError returns the record even when it cannot store it", () => {
  const r = recordError(new Error("boom"), null, null);
  assert.equal(r.message, "boom");
});

test("errorReport is one pasteable block naming the page and the time", () => {
  const r = describeError(new Error("boom"), { componentStack: "at CloseDialog" }, "https://x/y");
  const text = errorReport(r);
  assert.ok(text.startsWith("DeltaMint error: boom"));
  assert.ok(text.includes("Page: https://x/y"));
  assert.ok(text.includes("at CloseDialog"));
});
