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
// The verified sender on the authenticated domain.
const FROM = Deno.env.get("ALERT_EMAIL_FROM") || "DeltaMint Agents <agents@deltamint.app>";

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
  text?: string
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
      body: JSON.stringify(brevoPayload(FROM, to, subject, html, text))
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
