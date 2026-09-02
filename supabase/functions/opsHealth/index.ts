// Read-only health for the duty engineer: last-24h order errors, alerts, connection issues and the watch's last runs, as counts and messages, never user data.
import { adminClient } from "../_shared/supabaseClients.ts";

// Authenticated by a bearer token the owner sets as OPS_TOKEN on the project
// and as DELTAMINT_OPS_TOKEN on the agents' environment. Compared in constant
// time; absent secret means the endpoint is closed, not open. Nothing here
// identifies a user: rows are reduced to counts, rule names, error strings
// and timestamps, which is what "is anything broken" needs and no more.
function timingSafeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x[i] ^ y[i];
  return out === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("OPS_TOKEN");
  const given = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !given || !timingSafeEqual(secret, given)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = adminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [attempts, alerts, issues, digests, watchRuns] = await Promise.all([
    admin.from("order_attempts").select("intent, status, error, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    admin.from("alerts").select("rule, severity, resolved_at, created_at, last_seen_at").is("resolved_at", null),
    admin.from("broker_connection_issues").select("broker, environment, status, created_at").gte("created_at", since),
    admin.from("digest_sends").select("subject, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    admin.from("alerts").select("last_seen_at").order("last_seen_at", { ascending: false }).limit(1)
  ]);

  const errored = (attempts.data || []).filter((a: any) => a.error);
  const byError: Record<string, number> = {};
  for (const a of errored) byError[String(a.error).slice(0, 160)] = (byError[String(a.error).slice(0, 160)] || 0) + 1;
  const unfilled = (attempts.data || []).filter((a: any) => ["canceled", "expired"].includes(String(a.status || "")));
  const byRule: Record<string, number> = {};
  for (const al of alerts.data || []) byRule[`${al.rule}·${al.severity}`] = (byRule[`${al.rule}·${al.severity}`] || 0) + 1;

  return Response.json({
    since,
    orderAttempts: { total: (attempts.data || []).length, errored: errored.length, byError, unfilled: unfilled.length },
    openAlerts: { total: (alerts.data || []).length, byRule },
    connectionIssues: (issues.data || []).length,
    digestsSent: (digests.data || []).map((d: any) => ({ subject: d.subject, at: d.created_at })),
    watchLastSeen: watchRuns.data?.[0]?.last_seen_at || null,
    errors: [attempts.error, alerts.error, issues.error, digests.error, watchRuns.error].filter(Boolean).map((e: any) => e.message)
  });
});
