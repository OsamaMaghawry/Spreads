// A thin transactional-email sender, provider behind one env var.
//
// There is no email infrastructure in this project yet — auth mail goes through
// Supabase's own service. The position watch needs to send its own, so this is
// the one place that talks to a provider.
//
// Deliberately a no-op when unconfigured. The watch must run and record alerts
// from day one; the email switches on the moment RESEND_API_KEY (or an SMTP set)
// is added to the function's secrets. A missing key is a logged skip, never a
// failed run — a monitor that crashes because email is not wired is worse than
// one that quietly records and waits.

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
// The verified sender. Until the domain is verified with the provider, this
// stays whatever the provider allows; the recipient is the owner's inbox.
const FROM = Deno.env.get("ALERT_EMAIL_FROM") || "DeltaMint <alerts@deltamint.app>";

export interface EmailResult {
  sent: boolean;
  skipped?: string;
  error?: string;
}

// Sends one email. Returns rather than throws, so a delivery problem never
// takes the watch down with it.
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<EmailResult> {
  if (!RESEND_KEY) {
    console.warn(`email: RESEND_API_KEY not set; would have sent "${subject}" to ${to}`);
    return { sent: false, skipped: "no provider key configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
        ...(text ? { text } : {})
      })
    });
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
