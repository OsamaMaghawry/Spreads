// The one way an agent reaches the owner.
//
// Every weekly cadence produces a report and none of them could deliver it.
// Routine sessions run without MCP tools and without service-role credentials,
// so "email the owner when you finish" was an instruction no agent could obey,
// and the platform's own completion notification has never arrived once. The
// result was a month of work that ran, committed, and told nobody.
//
// The key an agent DOES hold is the anon key -- it is in .env.production
// because the browser needs it. So this function accepts it. That is the whole
// point: no branch to merge, no secret to paste, nothing for the owner to do
// between an agent finishing and the mail landing.
//
// The anon key is public, so two limits make that safe enough:
//
//   1. The recipient is never taken from the request. It is read from
//      watch_settings, the same row the position watch reports to. A caller
//      cannot aim this at anyone else, so it can never become an open relay.
//   2. Sends are counted in digest_sends and capped per hour. Seven cadences
//      plus retries sit far below the cap; a flood does not.
//
// Worst case is therefore a bounded number of unwanted messages to the owner's
// own address -- annoying, recoverable, and much cheaper than a system where
// the reports never arrive at all.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { adminClient } from "../_shared/supabaseClients.ts";

// Generous next to real use (7 cadences a week), tight next to abuse.
const MAX_PER_HOUR = 12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { subject, html, text } = await req.json().catch(() => ({}));
    if (!subject || !html) {
      return jsonResponse({ error: "subject and html are required" }, 400);
    }

    const admin = adminClient();

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from("digest_sends")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      // Deliberately not silent: a cadence that gets rate limited should be
      // able to say so rather than appear to have succeeded.
      console.warn(`sendDigest: rate limit hit (${count} in the last hour); refusing "${subject}"`);
      return jsonResponse({ sent: false, error: "rate limited", limit: MAX_PER_HOUR }, 429);
    }

    // Never from the request. The caller says what to send, never to whom.
    const { data: settings } = await admin
      .from("watch_settings")
      .select("recipient_email")
      .eq("id", true)
      .maybeSingle();
    const recipient = settings?.recipient_email;
    if (!recipient) return jsonResponse({ error: "no recipient configured" }, 500);

    const result = await sendEmail(recipient, subject, html, text);
    if (result.sent) await admin.from("digest_sends").insert({ subject });

    // sendEmail returns rather than throws; surface its verdict so a caller
    // can tell a real send from a silent skip.
    return jsonResponse({ ...result, to: recipient }, result.sent ? 200 : 502);
  } catch (error) {
    console.error("sendDigest failed", error?.message || error);
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
