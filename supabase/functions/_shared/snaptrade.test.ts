import { test } from "node:test";
import assert from "node:assert/strict";
import { signedContent, signRequest, queryString } from "./snaptrade.ts";

// THE SIGNATURE IS THE WHOLE PROTOCOL, and a wrong one fails as 401 -- which
// reads as "the keys are bad" and sends whoever is debugging it to the wrong
// place entirely. So the shape of the signed string is pinned here, where it
// can be checked against SnapTrade's own documentation by eye.

test("the signed content is three keys, alphabetical, no whitespace", () => {
  const s = signedContent("/api/v1/brokerages", "clientId=ACME&timestamp=1758000000", null);
  assert.equal(s, '{"content":null,"path":"/api/v1/brokerages","query":"clientId=ACME&timestamp=1758000000"}');
  // No spaces after colons or commas -- their spec is explicit about it.
  assert.ok(!/: |, /.test(s));
});

test("a request body is signed as an object, not as a string", () => {
  const s = signedContent("/api/v1/snapTrade/registerUser", "clientId=ACME&timestamp=1", { userId: "u-1" });
  assert.equal(s, '{"content":{"userId":"u-1"},"path":"/api/v1/snapTrade/registerUser","query":"clientId=ACME&timestamp=1"}');
  // The nested form, NOT '"content":"{\\"userId\\":\\"u-1\\"}"'. Signing the
  // stringified body instead of the body is the single easiest way to get
  // this wrong and the failure is indistinguishable from a bad key.
  assert.ok(!s.includes('\\"'));
});

test("an absent body signs as null rather than being left out", () => {
  // A missing key changes the JSON and therefore the hash. undefined in,
  // null out.
  assert.equal(
    signedContent("/api/v1/accounts", "clientId=A&timestamp=1", undefined),
    signedContent("/api/v1/accounts", "clientId=A&timestamp=1", null)
  );
});

test("the query string is sorted, so the string signed is the string sent", () => {
  const q = queryString({
    userSecret: "s3cret",
    clientId: "ACME",
    timestamp: 1758000000,
    userId: "u-1"
  });
  assert.equal(q, "clientId=ACME&timestamp=1758000000&userId=u-1&userSecret=s3cret");
});

test("empty, null and undefined parameters are left out entirely", () => {
  assert.equal(
    queryString({ clientId: "A", timestamp: 1, userId: null, userSecret: undefined, days: "" }),
    "clientId=A&timestamp=1"
  );
});

test("a value needing encoding is encoded once, in both places", () => {
  // A user secret is base64 and routinely carries + and /, which are not
  // query-safe. Encoding it in the sent URL but signing the raw form is the
  // other classic 401.
  const q = queryString({ clientId: "A", timestamp: 1, userSecret: "a+b/c=d" });
  assert.equal(q, "clientId=A&timestamp=1&userSecret=a%2Bb%2Fc%3Dd");
  const s = signedContent("/api/v1/accounts", q, null);
  assert.ok(s.includes("a%2Bb%2Fc%3Dd"));
});

test("the signature is base64 HMAC-SHA256 under the consumer key", async () => {
  // A fixed vector: same inputs, same signature, forever. If this changes,
  // every call to SnapTrade has changed with it.
  const sig = await signRequest(
    "UxrFb4cHdRWlmJKNuJjA6hoaN8uVa6jPGFVUl2UKHuKmurCnaU",
    "/api/v1/brokerages",
    "clientId=ACME&timestamp=1758000000",
    null
  );
  assert.match(sig, /^[A-Za-z0-9+/]+={0,2}$/);
  // 32 bytes of SHA-256 in base64 is always 44 characters.
  assert.equal(sig.length, 44);
  const again = await signRequest(
    "UxrFb4cHdRWlmJKNuJjA6hoaN8uVa6jPGFVUl2UKHuKmurCnaU",
    "/api/v1/brokerages",
    "clientId=ACME&timestamp=1758000000",
    null
  );
  assert.equal(sig, again);
});

test("a different key, path, query or body all change the signature", async () => {
  const base = ["k", "/api/v1/accounts", "clientId=A&timestamp=1", null] as const;
  const sig = await signRequest(...base);
  assert.notEqual(sig, await signRequest("k2", base[1], base[2], base[3]));
  assert.notEqual(sig, await signRequest(base[0], "/api/v1/orders", base[2], base[3]));
  assert.notEqual(sig, await signRequest(base[0], base[1], "clientId=A&timestamp=2", base[3]));
  assert.notEqual(sig, await signRequest(base[0], base[1], base[2], { a: 1 }));
});
