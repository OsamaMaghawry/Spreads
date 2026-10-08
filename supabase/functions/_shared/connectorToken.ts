// Is this login token one a third-party app holds on the user's behalf?
//
// THE CLAUDE CONNECTOR SIGNS IN THROUGH SUPABASE AUTH'S OAUTH 2.1 SERVER, and
// what it gets back is an ordinary DeltaMint login token: same signature, same
// `sub`, same `role: authenticated`. Supabase adds one claim, `client_id`, naming
// the app the user approved. Nothing else tells the two apart.
//
// So without a check, the token Claude holds for "read my positions" would
// open every function a signed-in person can call -- openPosition, closeSpread,
// manageOrder, saveAccount, billing -- because to those functions it IS a
// signed-in person. The connector is promised to the owner as read-only and
// unable to trade; that promise has to be kept by the functions, not by
// whatever the app holding the token chooses to call.
//
// Hence the rule: `requireUser` (every user-facing function) and marketStream's
// own check refuse any token carrying `client_id`. Only the connector's own
// function accepts one. A new function that checks tokens some other way must
// apply the same test -- see connectorToken.test.ts.

// The payload of a JWT, decoded WITHOUT verifying the signature. Only ever read
// after Supabase Auth has accepted the same token (auth.getUser), which is the
// verification; this just reads a claim that check does not return.
export function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    // atob gives one char per byte; decode as UTF-8 so a non-ASCII email does
    // not throw and make a valid token unreadable.
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

// The approved app's id, or null for a token the user got by signing in to
// DeltaMint itself.
export function connectorClientId(token: string): string | null {
  const id = jwtClaims(token)?.client_id;
  return typeof id === "string" && id.trim() !== "" ? id : null;
}

export const isConnectorToken = (token: string) => connectorClientId(token) !== null;

// "Bearer <jwt>" -> "<jwt>".
export const bearerToken = (header: string | null) =>
  String(header || "").replace(/^Bearer\s+/i, "").trim();
