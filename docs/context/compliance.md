# Compliance and broker approval

State of the Alpaca OAuth application, and the rules it imposes on the product.

## Where the application stands

The OAuth connect flow is built and technically correct — the authorize request
carries a valid client ID, a registered redirect URI and valid scopes. Alpaca
still rejects it with `invalid_client`, because **the OAuth app has not been
approved**. Client ID and secret are issued at creation, but the app does not
function at the authorize endpoint until Alpaca's review passes.

There is no sandbox. Approval is a compliance review, not a technical toggle,
so the flow cannot be demonstrated end to end beforehand.

## What the questionnaire requires

**Agreements** — end user terms, fee schedule, privacy policy, cybersecurity
policy. The first three are published on the marketing site; the cybersecurity
policy is drafted and covers the seven areas Alpaca lists as minimum: data
classification, access control, encryption at rest and in transit, vulnerability
and patch management, incident response and recovery, physical security, and
vendor risk.

**Business description** — model, products and technology; customer count;
endpoint protection on production and corporate networks; and a video or
screenshots of a user connecting their account.

**Still needed from the founder:** customer count, a named incident-response
owner and contact, confirmation of workstation controls (disk encryption,
automatic updates, multi-factor authentication on GitHub, Cloudflare, Supabase
and Alpaca), and the connection walkthrough capture.

## The capture they ask for

Record: signed-in dashboard → Accounts → Connect Alpaca → **the authorization
disclosure dialog, fully legible** → Continue → the broker's own sign-in page.
The disclosure and its acknowledgement is the part under review, and it must
visibly precede connecting. State in the covering message that the final
callback cannot be shown until the app is approved.

## Rules this imposes on the product

These are not style preferences. They govern what may ship.

1. **Neutral brokerage language in marketing.** The broker's name stays off the
   site except where an integration is genuinely being described. Legal pages
   may name them where accuracy requires it — a privacy policy that hides who
   receives user data is a worse problem than the naming rule.
2. **Never imply broker-dealer status.** DeltaMint does not hold funds or
   securities, open or maintain accounts, or provide brokerage services.
3. **No investment advice, signals or recommendations.** The screener lists what
   matches the user's filters. Any mention of a specific security or strategy
   must let the reader draw their own conclusion.
4. **No copy trading, mirror trading, social trading or influencer promotion.**
   Alpaca will not approve these models at all without registered adviser or
   broker-dealer status.
5. **Automated actions are user-configured rules.** Anything that places or
   closes orders without the user present — the planned end-of-session
   de-risking, for instance — must be described as a rule the user configured and
   the software executed at their direction, never as the software deciding.
6. **Commercial model must be disclosed.** Flat monthly subscription; no
   commission, no share of profits, nothing contingent on trading activity.

## Security posture, as it can be truthfully stated

- Brokerage credentials are encrypted with AES-256-GCM before storage. The key
  lives in the edge function environment, never in the database, so a database
  dump or a leaked service role key yields ciphertext.
- Credential columns are revoked from the browser role entirely — verified
  against the live project — so a client session cannot read them even if
  application code asked.
- Row-level security scopes every table to `auth.uid()`; edge functions verify
  the caller's JWT and re-confirm account ownership before use.
- All traffic is TLS end to end. No production servers exist to patch; the
  runtime is managed.

**Outstanding:** encryption key rotation has no path yet — see
`docs/deferred-work.md`. Leaked-password protection is disabled in Supabase Auth
and is a free toggle worth enabling before review.

## Domain reputation is separate from broker approval

Alpaca's review and a browser's reputation engine share nothing. Puthouse — an
approved, Alpaca-connected competitor — is flagged **Risky / Phishing** by McAfee
WebAdvisor while fully compliant.

The reason is structural, and it applies to us identically: a young domain that
shows a login, discusses money, and redirects to a brokerage and back is the
same shape as a credential-phishing kit. Classifiers score shape, not intent, so
being approved to run an OAuth flow slightly *raises* the risk of being flagged
for running it.

Being blocked during the DDQ review would mean explaining a phishing warning to
the people deciding whether to approve us. Mitigations, checked by
`npm run site:health` and the Site health workflow:

- Trust pages published *and linked*; a reachable contact address, not a form.
- No credential form on the marketing domain — login stays on `dashboard.`.
- HSTS, `x-content-type-options`, `referrer-policy` set; Cloudflare SSL/TLS on
  Full (strict).
- SPF and DMARC present, before any mail is sent.
- Registered with Google Safe Browsing, Bing/SmartScreen, McAfee TrustedSource,
  Norton Safe Web and VirusTotal *before* launch — being known beats being
  unknown.
- Public WHOIS for the business domain rather than a privacy proxy.

If flagged, dispute with every vendor in parallel; they do not share verdicts.
