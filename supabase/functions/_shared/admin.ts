import { adminClient, requireUser } from "./supabaseClients.ts";
import { jsonResponse } from "./cors.ts";

// Server-side administrator check.
//
// Two ways to hold admin, and the distinction matters:
//
//   1. The ADMIN_EMAILS secret — the owner allowlist. This lives in the
//      Supabase dashboard, outside the application entirely. Nothing in the
//      app, the database, or a compromised admin session can add to it, which
//      is what makes it safe as the bootstrap: the owner sets it themselves
//      and signs in, with no SQL and no dependency on anyone else's database
//      access.
//
//   2. `profiles.role = 'admin'` — granted from inside the panel, for adding
//      a teammate without handing over dashboard credentials.
//
// Every row in `auth.users` is a customer who signed up to trade. Operating
// the product is a different thing from using it, so operator access is not
// something a customer row can grant itself; (1) is the root of trust and (2)
// only ever flows down from someone who already had it.
//
// The browser also checks the role (see useIsAdmin.js), but that is a UI
// affordance — it decides what to render, not what a request may do. Anything
// reading or writing across users must call this, because a client-side flag
// is trivially bypassed by calling the function directly.
//
// One implementation on purpose: an authorization check copied into each
// endpoint is one that eventually drifts in one of them.

// Comma-separated, compared case-insensitively — an email is not case
// sensitive in practice and "Osama@..." failing to match "osama@..." would be
// a lockout with no visible cause.
export function ownerEmails(): string[] {
  return (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}

// Always the same shape rather than a union: a caller doing
// `if (gate.response) return gate.response` should not have to narrow a type
// to read the field, and a union makes that a compile error.
//
// `response` non-null means rejected — return it unchanged.
// `response` null means `user` and `admin` are populated.
interface AdminGate {
  response: Response | null;
  user: Awaited<ReturnType<typeof requireUser>>;
  admin: ReturnType<typeof adminClient> | null;
  isOwner: boolean;
}

// The rule itself, with no HTTP framing around it. requireAdmin() below is
// this plus the 401 and 403 responses; a handler that has already
// authenticated its caller and only needs the answer — saveAccount deciding
// whether manual credentials may be stored — calls this instead of restating
// either half of the rule.
export async function isAdminUser(
  user: Awaited<ReturnType<typeof requireUser>>,
  admin: ReturnType<typeof adminClient>
): Promise<{ isAdmin: boolean; isOwner: boolean }> {
  if (!user) return { isAdmin: false, isOwner: false };

  // The email comes from the verified JWT, not from the request body, so it
  // cannot be spoofed by the caller. Checked before the profile lookup so the
  // owner can still get in when the profiles row is missing or the table is
  // unreachable — the whole point of an out-of-band allowlist is that it does
  // not depend on app state.
  if (isOwnerEmail(user.email)) return { isAdmin: true, isOwner: true };

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return { isAdmin: profile?.role === "admin", isOwner: false };
}

export async function requireAdmin(req: Request): Promise<AdminGate> {
  const user = await requireUser(req);
  if (!user) {
    return { response: jsonResponse({ error: "Unauthorized" }, 401), user: null, admin: null, isOwner: false };
  }

  const admin = adminClient();

  let verdict: { isAdmin: boolean; isOwner: boolean };
  try {
    verdict = await isAdminUser(user, admin);
  } catch (error) {
    return { response: jsonResponse({ error: error.message }, 500), user, admin: null, isOwner: false };
  }

  if (!verdict.isAdmin) {
    // Deliberately the same message whether the profile is missing or simply
    // not an admin — the difference is not the caller's business.
    return {
      response: jsonResponse({ error: "Administrator access is required" }, 403),
      user,
      admin: null,
      isOwner: false
    };
  }

  return { response: null, user, admin, isOwner: verdict.isOwner };
}
