import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { jwtClaims, connectorClientId, isConnectorToken, bearerToken } from "./connectorToken.ts";

// A token Claude holds for the connector must never reach a function that can
// trade, close, change an account or touch billing. See connectorToken.ts.

const b64url = (s: string) =>
  Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: "ES256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.sig`;

const user = { sub: "u1", role: "authenticated", aud: "authenticated", email: "a@b.c" };

test("a DeltaMint sign-in token is not a connector token", () => {
  assert.equal(isConnectorToken(jwt(user)), false);
  assert.equal(connectorClientId(jwt({ ...user, client_id: "" })), null);
  assert.equal(connectorClientId(jwt({ ...user, client_id: null })), null);
});

test("a token issued to an approved app is, and names the app", () => {
  const t = jwt({ ...user, client_id: "9a8b7c6d-5e4f" });
  assert.equal(isConnectorToken(t), true);
  assert.equal(connectorClientId(t), "9a8b7c6d-5e4f");
});

test("claims decode through base64url and non-ASCII text", () => {
  const t = jwt({ ...user, email: "osé@exämple.com", client_id: "c/+_-1" });
  assert.equal(jwtClaims(t)?.email, "osé@exämple.com");
  assert.equal(connectorClientId(t), "c/+_-1");
});

test("garbage is not a token, and is not mistaken for one", () => {
  for (const t of ["", "abc", "a.b", "a.!!!.c", "a.b.c.d"]) {
    assert.equal(jwtClaims(t), null);
    assert.equal(isConnectorToken(t), false);
  }
});

test("bearer header parsing", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("bearer   x "), "x");
  assert.equal(bearerToken(null), "");
});

// THE GUARD ITSELF, pinned at both places a caller's token is checked. A test
// of the helper alone would still pass the day someone removed the call.
test("requireUser refuses connector tokens", () => {
  const src = readFileSync(new URL("./supabaseClients.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function requireUser"));
  assert.match(body.slice(0, body.indexOf("\n}\n")), /isConnectorToken\(/);
});

test("marketStream refuses connector tokens", () => {
  const src = readFileSync(new URL("../marketStream/index.ts", import.meta.url), "utf8");
  assert.match(src, /isConnectorToken\(token\)/);
});

// Every function that reads a token reads it through one of those two, so the
// guard covers all of them. A function that calls auth.getUser on its own is
// a third door; this fails until it applies the same rule.
test("no function checks a token any other way", () => {
  const root = new URL("../", import.meta.url);
  const allowed = new Set(["_shared/supabaseClients.ts", "marketStream/index.ts", "mcp/index.ts"]);
  const offenders: string[] = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of readdirSync(new URL(`${dir.name}/`, root))) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const rel = `${dir.name}/${f}`;
      const src = readFileSync(new URL(rel, root), "utf8");
      if (/auth\.getUser\(|auth\.getClaims\(/.test(src) && !allowed.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(existsSync(new URL("_shared/supabaseClients.ts", root)));
});

// THE DATABASE HALF. Migration 0058 gives every table with row-level security
// three restrictive policies that refuse writes from a connector token. A table
// added later is not covered unless its own migration adds them -- this fails
// the build until it does.
test("every RLS table refuses writes from connector tokens", () => {
  const dir = new URL("../../migrations/", import.meta.url);
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(new URL(f, dir), "utf8").replace(/--[^\n]*/g, ""))
    .join("\n");
  const rls = new Set(
    [...sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi)].map((m) => m[1])
  );
  const disabled = new Set(
    [...sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?\s+disable\s+row\s+level\s+security/gi)].map((m) => m[1])
  );
  const dropped = new Set([...sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)].map((m) => m[1]));
  const missing: string[] = [];
  for (const t of rls) {
    if (disabled.has(t) || dropped.has(t)) continue;
    for (const op of ["insert", "update", "delete"]) {
      const re = new RegExp(`create\\s+policy\\s+connector_no_${op}\\s+on\\s+(?:public\\.)?"?${t}"?\\s+as\\s+restrictive`, "i");
      if (!re.test(sql)) missing.push(`${t}: connector_no_${op}`);
    }
  }
  assert.ok(rls.size >= 30, `expected the RLS tables to be found, got ${rls.size}`);
  assert.deepEqual(missing, []);
});
