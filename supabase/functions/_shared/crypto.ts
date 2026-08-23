// AES-256-GCM envelope for brokerage credentials.
//
// The point of encrypting these at the application layer rather than relying on
// the platform's disk encryption is where the key lives: CREDENTIAL_ENCRYPTION_KEY
// is a function secret, so it is never inside the database. A database dump, a
// leaked service-role key, or SQL injection therefore yields ciphertext only —
// an attacker needs to compromise both systems, not one.
//
// Stored form is "v1:<iv>:<ciphertext>", base64. Base64 never contains a colon,
// so splitting on it is unambiguous. A value without the "v1:" prefix predates
// encryption and is returned as-is, so rows written before this change keep
// working until the next time they are saved.

const PREFIX = "v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const cache = new Map<string, CryptoKey>();

async function keyFrom(envName: string, required: boolean): Promise<CryptoKey | null> {
  const cached = cache.get(envName);
  if (cached) return cached;

  const configured = Deno.env.get(envName);
  if (!configured) {
    if (!required) return null;
    throw new Error(
      `${envName} is not configured. Generate one with ` +
      "`openssl rand -base64 32` and set it with `supabase secrets set`."
    );
  }
  const raw = fromBase64(configured);
  if (raw.length !== 32) {
    throw new Error(`${envName} must decode to 32 bytes for AES-256, got ${raw.length}.`);
  }
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
  cache.set(envName, key);
  return key;
}

/** The key everything is written under. Always required. */
async function encryptionKey(): Promise<CryptoKey> {
  return (await keyFrom("CREDENTIAL_ENCRYPTION_KEY", true))!;
}

// The key being rotated away from, set only while a rotation is draining.
// Absent by default, and when absent this file behaves exactly as it did before
// rotation support existed — which is what makes the change safe to ship.
async function previousKey(): Promise<CryptoKey | null> {
  return keyFrom("CREDENTIAL_ENCRYPTION_KEY_PREVIOUS", false);
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  // A fresh IV per encryption is required for GCM — reusing one across two
  // values under the same key breaks the mode's confidentiality entirely.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(stored: string | null): Promise<string | null> {
  if (stored === null || stored === undefined) return null;
  if (!isEncrypted(stored)) return stored;

  const [, iv, ciphertext] = stored.split(":");
  if (!iv || !ciphertext) throw new Error("Stored credential is malformed");

  const attempt = async (key: CryptoKey) =>
    new TextDecoder().decode(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext))
    );

  try {
    return await attempt(await encryptionKey());
  } catch {
    // GCM authenticates as well as encrypts, so a failure here means the
    // ciphertext was tampered with, or it was written under a different key.
    // During a rotation the second case is expected, so try the outgoing key
    // before giving up. migrateCredentials rewrites whatever lands here, so the
    // fallback drains rather than becoming permanent.
    const previous = await previousKey();
    if (previous) {
      try {
        return await attempt(previous);
      } catch {
        // Falls through to the error below: neither key opens it.
      }
    }
    throw new Error(
      "Could not decrypt a stored credential. CREDENTIAL_ENCRYPTION_KEY may have " +
      "changed since it was saved; re-enter the account's credentials."
    );
  }
}

/**
 * True when `stored` needs rewriting under the current key — either it is
 * plaintext, or it only opens under the outgoing key. Used by the maintenance
 * job to drain a rotation without involving users.
 */
export async function needsRewrite(stored: string | null): Promise<boolean> {
  if (stored === null || stored === undefined) return false;
  if (!isEncrypted(stored)) return true;

  const [, iv, ciphertext] = stored.split(":");
  if (!iv || !ciphertext) return false;

  try {
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      await encryptionKey(),
      fromBase64(ciphertext)
    );
    return false;
  } catch {
    return (await previousKey()) !== null;
  }
}

// Non-secret display value, so the account list can show which key is in use
// without the browser ever receiving the key itself.
export function apiKeyHint(apiKey: string): string {
  if (apiKey.length <= 8) return "••••••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}
