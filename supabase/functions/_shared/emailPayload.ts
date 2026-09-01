// Building a Brevo request, kept apart from sending one.
//
// This file touches no environment and performs no I/O, so the shape of what we
// send can be tested directly. The provider swap is exactly the kind of change
// where a wrong field name fails silently in production and nowhere else.

export interface Sender {
  name?: string;
  email: string;
}

// Accepts either "DeltaMint Agents <agents@deltamint.app>" or a bare address.
// Brevo wants the two parts separately, where Resend took one string — which is
// the whole reason this parse exists.
export function parseSender(from: string): Sender {
  const raw = String(from || "").trim();
  const angled = raw.match(/^(.*)<\s*([^>]+)\s*>$/);
  if (!angled) return { email: raw };
  const name = angled[1].trim().replace(/^["']|["']$/g, "");
  const email = angled[2].trim();
  return name ? { name, email } : { email };
}

// Brevo's field names differ from Resend's throughout: sender/to objects rather
// than flat strings, htmlContent/textContent rather than html/text.
export function brevoPayload(from: string, to: string, subject: string, html: string, text?: string) {
  return {
    sender: parseSender(from),
    to: [{ email: to }],
    subject,
    htmlContent: html,
    ...(text ? { textContent: text } : {})
  };
}
