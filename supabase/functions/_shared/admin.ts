import { adminClient, requireUser } from "./supabaseClients.ts";
import { jsonResponse } from "./cors.ts";

// Server-side administrator check.
//
// The browser also checks `profiles.role` (see AdminMaintenance.jsx and the
// admin routes), but that is a UI affordance — it decides what to render, not
// what a request is allowed to do. Anything that reads or writes across users
// must call this, because a client-side flag is trivially bypassed by calling
// the function directly with an ordinary user's token.
//
// One implementation on purpose: an authorization check copied into each
// endpoint is an authorization check that eventually drifts in one of them.
//
// Always returns the same shape rather than a union of two shapes: a caller
// doing `if (gate.response) return gate.response` should not have to narrow a
// type to read the field, and a union here makes that a compile error.
//
// `response` non-null means the request was rejected — return it unchanged.
// `response` null means `user` and `admin` are populated.
interface AdminGate {
  response: Response | null;
  user: Awaited<ReturnType<typeof requireUser>>;
  admin: ReturnType<typeof adminClient> | null;
}

export async function requireAdmin(req: Request): Promise<AdminGate> {
  const user = await requireUser(req);
  if (!user) {
    return { response: jsonResponse({ error: "Unauthorized" }, 401), user: null, admin: null };
  }

  const admin = adminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { response: jsonResponse({ error: error.message }, 500), user, admin: null };
  }
  if (!profile || profile.role !== "admin") {
    // Deliberately the same message whether the profile is missing or simply
    // not an admin — the difference is not the caller's business.
    return {
      response: jsonResponse({ error: "Administrator access is required" }, 403),
      user,
      admin: null
    };
  }

  return { response: null, user, admin };
}
