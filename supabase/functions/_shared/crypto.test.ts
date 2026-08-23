// Verifies the property that makes key rotation safe to ship: with
// CREDENTIAL_ENCRYPTION_KEY_PREVIOUS unset, this module behaves exactly as it
// did before rotation support existed.
//
//   deno test --allow-env supabase/functions/_shared/crypto.test.ts
//
// Each case imports a fresh module instance via a cache-busting query string,
// because keys are cached at module scope after first use.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert";

const KEY_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const KEY_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";

let n = 0;
async function load(current: string, previous?: string) {
  Deno.env.set("CREDENTIAL_ENCRYPTION_KEY", current);
  if (previous) Deno.env.set("CREDENTIAL_ENCRYPTION_KEY_PREVIOUS", previous);
  else Deno.env.delete("CREDENTIAL_ENCRYPTION_KEY_PREVIOUS");
  return await import(`./crypto.ts?case=${n++}`);
}

Deno.test("round-trips under the current key", async () => {
  const c = await load(KEY_A);
  const sealed = await c.encryptSecret("PKTEST-secret");
  assert(c.isEncrypted(sealed));
  assertEquals(await c.decryptSecret(sealed), "PKTEST-secret");
});

Deno.test("passes legacy plaintext through untouched", async () => {
  const c = await load(KEY_A);
  assertEquals(await c.decryptSecret("plain-value"), "plain-value");
  assertEquals(await c.needsRewrite("plain-value"), true);
});

Deno.test("a fresh IV per encryption", async () => {
  const c = await load(KEY_A);
  assert((await c.encryptSecret("x")) !== (await c.encryptSecret("x")));
});

Deno.test("without a previous key, a foreign ciphertext still throws", async () => {
  // The pre-rotation behaviour, unchanged. This is the regression that would
  // matter if the fallback ever ran when it should not.
  const a = await load(KEY_A);
  const sealed = await a.encryptSecret("secret");

  const b = await load(KEY_B);
  await assertRejects(() => b.decryptSecret(sealed), Error, "Could not decrypt");
  assertEquals(await b.needsRewrite(sealed), false);
});

Deno.test("with a previous key, values written under it still open", async () => {
  const a = await load(KEY_A);
  const sealed = await a.encryptSecret("secret");

  const b = await load(KEY_B, KEY_A);
  assertEquals(await b.decryptSecret(sealed), "secret");
  // Flagged for rewrite so a rotation drains instead of relying on the fallback.
  assertEquals(await b.needsRewrite(sealed), true);
});

Deno.test("values already under the current key need no rewrite", async () => {
  const c = await load(KEY_B, KEY_A);
  assertEquals(await c.needsRewrite(await c.encryptSecret("secret")), false);
});

Deno.test("a value neither key opens throws", async () => {
  const a = await load(KEY_A);
  const sealed = await a.encryptSecret("secret");
  const tampered = sealed.slice(0, -5) + "AAAA=";

  const b = await load(KEY_B, KEY_B);
  await assertRejects(() => b.decryptSecret(tampered), Error);
});
