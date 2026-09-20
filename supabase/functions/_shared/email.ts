// Transactional email, sent through Brevo.
//
// The owner already runs Brevo, and deltamint.app is authenticated there —
// brevo1/brevo2 DKIM CNAMEs and the brevo-code TXT are on the domain — so this
// sends as the brand rather than through a second vendor. It replaces an
// earlier Resend implementation; Resend was never keyed, so nothing depended
// on it and carrying two providers would only have been surface to get wrong.
//
// Deliberately a no-op when unconfigured. The position watch must run and
// record alerts whether or not mail is wired: a missing key is a logged skip,
// never a failed run. A monitor that dies because email is not set up is worse
// than one that quietly records and waits.

import { brevoPayload } from "./emailPayload.ts";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY");

// TWO SENDERS, BECAUSE THERE ARE TWO AUDIENCES.
//
// The owner asked for one change: *"can we remove Agents from this email. I
// want to send with the Support email not Agent. Agents is internal only."*
// The second sentence is a boundary, and the first pass read only the first
// sentence and moved EVERYTHING to support@ -- including the mail that exists
// to tell us our own machinery broke. *"Agents is internal email for our
// agentic workflow. Now everything has changed to Support!!!!!"*
//
// So the rule is by READER, not by sender:
//
//   SUPPORT  Anything a customer receives -- the weekly digest, position-watch
//            alerts, sign-in mail. `support@deltamint.app` is the address
//            already published in the privacy policy, the terms, the security
//            policy and the site's structured data, so it is a mailbox that
//            exists and a reply actually reaches. A customer has no
//            relationship with "Agents" and should never be handed it as a
//            reply-to.
//
//   AGENTS   Anything the build and the review bench send to ourselves -- a
//            publish that failed, stored history that drifted. Nobody outside
//            the team reads these, they name internal jobs and branches, and
//            filing them under support@ buries real customer mail under our
//            own cron output.
//
// The default is SUPPORT, so a new caller that says nothing sends as the
// brand. Internal callers opt in explicitly, which is the safer direction to
// get wrong.
export const SENDER = {
  support: Deno.env.get("ALERT_EMAIL_FROM") || "DeltaMint <support@deltamint.app>",
  agents: Deno.env.get("AGENT_EMAIL_FROM") || "DeltaMint Agents <agents@deltamint.app>"
} as const;

export interface EmailResult {
  sent: boolean;
  skipped?: string;
  error?: string;
}

// Returns rather than throws, so a delivery problem never takes the caller down.
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  // Which of the two mailboxes this is from. Omitted means SUPPORT — see
  // SENDER above for why the customer-facing address is the default.
  from: string = SENDER.support
): Promise<EmailResult> {
  if (!BREVO_KEY) {
    console.warn(`email: BREVO_API_KEY not set; would have sent "${subject}" to ${to}`);
    return { sent: false, skipped: "no provider key configured" };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        // Brevo authenticates with its own header, not Authorization: Bearer.
        "api-key": BREVO_KEY,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(brevoPayload(from, to, subject, html, text))
    });
    // Brevo answers a successful send with 201, not 200.
    if (!res.ok) {
      const body = await res.text();
      console.error(`email: provider ${res.status}: ${body}`);
      return { sent: false, error: `provider ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error(`email: send failed: ${e?.message || e}`);
    return { sent: false, error: String(e?.message || e) };
  }
}
