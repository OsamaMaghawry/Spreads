// Is this request the platform itself, or a signed-in person?
//
// `verify_jwt = true` answers "is this SOMEBODY", which is the wrong question
// for a scheduled endpoint. A job that rebuilds every connected account, or
// reports on every user, must run for the cron and for nobody else -- and any
// signed-in user holds a JWT that passes verify_jwt perfectly well.
//
// The service-role key is the credential only the platform has: it lives in
// the function's own environment and in the Vault row pg_cron reads. Comparing
// the bearer against it is therefore the actual test.
//
// Compared in constant time. The comparison is against a secret, and a
// short-circuiting `===` on a long string leaks its prefix to anything that
// can time the response. Cheap to do right, so it is done right.

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isServiceRole(req: Request): boolean {
  if (!SERVICE_KEY) return false;
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return sameSecret(token, SERVICE_KEY);
}
