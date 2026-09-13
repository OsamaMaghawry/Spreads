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
//
// NOT `agents@`, at the owner's word: *"can we remove Agents from this email.
// I want to send with the Support email not Agent. Agents is internal only."*
// He is right, and it matters more than a label. "Agents" is the name of the
// review bench -- systems-engineer, investment-analyst, compliance-gate and
// the rest -- which is how this product is BUILT, not a party a customer has
// any relationship with. A weekly digest arriving from it tells the reader
// their account is being handled by something they have never been introduced
// to, and gives them an address to reply to that nobody reads.
//
// `support@deltamint.app` is the address already published in the privacy
// policy, the terms, the security policy and the site's own structured data,
// and it is already the authenticated sender for sign-in mail
// (`.github/workflows/auth-config.yml`). So it is a mailbox that exists, that
// a reply reaches, and that the reader has already been given -- which is the
// whole of what a from-address is for.
//
// This is the sender for EVERY email the product sends, the position-watch
// alerts included, because they share this module. That is the right outcome:
// the alerts had no more business coming from `agents@` than the digest did.
const FROM = Deno.env.get("ALERT_EMAIL_FROM") || "DeltaMint <support@deltamint.app>";

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
