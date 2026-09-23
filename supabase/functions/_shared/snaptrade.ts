// The SnapTrade HTTP client: request signing, and one call shape.
//
// WHY THIS IS HAND-WRITTEN rather than their SDK. The SDK carries axios and a
// generated client for every endpoint, which is a large dependency inside an
// edge bundle for a thing we are still evaluating. The whole protocol is one
// HMAC and four query parameters, and writing it out means the signature is a
// pure function with tests rather than a black box that either works or
// returns 401 with nothing to look at.
//
// THE PROTOCOL, from SnapTrade's own OpenAPI document:
//
//   Base URL   https://api.snaptrade.com/api/v1
//   Header     Signature: <base64 HMAC-SHA256>
//   Query      clientId, timestamp   (always)
//              userId, userSecret    (on user-scoped endpoints)
//
//   The signed content is one JSON object with its keys in alphabetical
//   order and no whitespace:
//
//       {"content":<request body or null>,"path":<url path>,"query":<query string>}
//
//   signed with HMAC-SHA256 under the consumer key, UTF-8 in, base64 out.
//
// TWO THINGS THAT MUST NOT DRIFT, because either one produces a 401 that looks
// like a credential problem and is not:
//
//   1. `path` includes the /api/v1 prefix -- it is the URL's path, not the
//      endpoint's name.
//   2. The query string SIGNED must be byte-identical to the query string
//      SENT. So it is built exactly once, sorted, and used for both. Sorting
//      is not required by them; determinism is required by us.
//
// Nothing here throws on an HTTP error. A capability probe's whole job is to
// report what came back, and a client that turns a 403 into an exception
// turns "this broker needs approval" into "the run failed".

const HOST = "https://api.snaptrade.com";
const PREFIX = "/api/v1";

export interface SnapCreds {
  clientId: string;
  consumerKey: string;
}

/**
 * The keys, or null when they are not configured.
 *
 * Deliberately null rather than throwing: "not set up yet" is an ordinary
 * state for an evaluation, and the caller says so in plain words instead of
 * returning a 500 that reads like a defect.
 */
export function snapCredentials(): SnapCreds | null {
  const clientId = (Deno.env.get("SNAPTRADE_CLIENT_ID") || "").trim();
  const consumerKey = (Deno.env.get("SNAPTRADE_CONSUMER_KEY") || "").trim();
  if (!clientId || !consumerKey) return null;
  return { clientId, consumerKey };
}

/**
 * The exact string that gets signed. Exported because it is the one part of
 * this file a test can pin without a network or a secret.
 *
 * Key order is content, path, query -- already alphabetical, and written out
 * in that order rather than sorted at runtime so the ordering is visible in
 * the source rather than implied by a helper.
 */
export function signedContent(path: string, query: string, content: unknown): string {
  return JSON.stringify({ content: content ?? null, path, query });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The Signature header's value. */
export async function signRequest(
  consumerKey: string,
  path: string,
  query: string,
  content: unknown
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(consumerKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent(path, query, content))
  );
  return toBase64(new Uint8Array(signature));
}

/**
 * The query string, sorted and encoded, used for BOTH the signature and the
 * request. Exported for the test that proves those two are the same string.
 */
export function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const clean: [string, string][] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    clean.push([k, String(v)]);
  }
  clean.sort((a, b) => a[0].localeCompare(b[0]));
  return clean.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

export interface SnapCall {
  /** Endpoint path WITHOUT the /api/v1 prefix, e.g. "/brokerages". */
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  userId?: string | null;
  userSecret?: string | null;
  creds?: SnapCreds | null;
  /** Milliseconds before giving up. Their API is not slow; a hung probe is. */
  timeoutMs?: number;
}

export interface SnapResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  /** One sentence, from their body when they gave one. */
  error: string | null;
  /** How long the call took, because latency is part of what is being judged. */
  ms: number;
}

export async function snapFetch<T = unknown>(call: SnapCall): Promise<SnapResult<T>> {
  const started = Date.now();
  const creds = call.creds ?? snapCredentials();
  if (!creds) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY are not set on this project.",
      ms: 0
    };
  }

  const path = `${PREFIX}${call.path}`;
  const method = call.method || "GET";
  // A body is signed as an OBJECT nested inside the signature payload and sent
  // as its own JSON document. Same object, same key order, so the two agree.
  const content = method === "GET" || method === "DELETE" ? null : (call.body ?? null);

  const query = queryString({
    ...(call.query || {}),
    clientId: creds.clientId,
    timestamp: Math.floor(Date.now() / 1000),
    userId: call.userId || undefined,
    userSecret: call.userSecret || undefined
  });

  let signature: string;
  try {
    signature = await signRequest(creds.consumerKey, path, query, content);
  } catch (e) {
    return { ok: false, status: 0, data: null, error: `could not sign the request: ${e?.message || e}`, ms: Date.now() - started };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs ?? 20000);
  try {
    const res = await fetch(`${HOST}${path}${query ? `?${query}` : ""}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Signature: signature
      },
      body: content === null ? undefined : JSON.stringify(content),
      signal: controller.signal
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const body = parsed as Record<string, unknown> | null;
      const detail =
        (body && (body.detail || body.message || body.error)) ||
        (text ? text.slice(0, 300) : "");
      return {
        ok: false,
        status: res.status,
        data: (parsed as T) ?? null,
        error: String(detail || `HTTP ${res.status}`),
        ms: Date.now() - started
      };
    }

    return { ok: true, status: res.status, data: (parsed as T) ?? null, error: null, ms: Date.now() - started };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: aborted ? "timed out" : String(e?.message || e),
      ms: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}
