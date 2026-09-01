// Sends one composed message to the owner, as the brand.
//
// The weekly cadences already produce the content; what they lacked was a way
// to put it in front of the owner. The platform's own completion notification
// has never arrived, so a run could succeed, commit its work, and still leave
// him with nothing in his inbox — which is how a Monday play sat unread for a
// week. This closes that: any caller with the service role can hand it a
// subject and a body and it goes out through Brevo as
// `DeltaMint Agents <agents@deltamint.app>`, the same sender the position
// watch already uses.
//
// Deliberately dumb. It composes nothing and decides nothing — the caller owns
// the words. That keeps the one thing that must not break (delivery) separate
// from the thing that changes every week (content).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { adminClient } from "../_shared/supabaseClients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { subject, html, text, to } = await req.json().catch(() => ({}));
    if (!subject || !html) {
      return jsonResponse({ error: "subject and html are required" }, 400);
    }

    // Default to the same address the watch reports to, so there is one place
    // that decides where owner mail goes rather than a literal in each caller.
    let recipient = to;
    if (!recipient) {
      const admin = adminClient();
      const { data } = await admin
        .from("watch_settings")
        .select("recipient_email")
        .eq("id", true)
        .maybeSingle();
      recipient = data?.recipient_email;
    }
    if (!recipient) return jsonResponse({ error: "no recipient configured" }, 400);

    const result = await sendEmail(recipient, subject, html, text);
    // sendEmail returns rather than throws; surface its verdict so a caller
    // (or a log) can tell a real send from a silent skip.
    return jsonResponse({ ...result, to: recipient }, result.sent ? 200 : 502);
  } catch (error) {
    console.error("sendDigest failed", error?.message || error);
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
