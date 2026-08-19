import { createClient } from "npm:@supabase/supabase-js@2";

// Service-role client: bypasses RLS. Only ever used server-side, after the
// caller's JWT has been verified with requireUser() and an explicit
// ownership check (see loadAccount in alpaca.ts) has been applied.
export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false }
  });
}

// Verifies the caller's Authorization header and returns the authenticated user, or null.
export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
