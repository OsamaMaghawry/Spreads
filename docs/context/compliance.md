# Compliance and broker approval

State of the Alpaca OAuth application, and the rules it imposes on the product.

## Where the application stands

**The connect flow works end to end, on production, today.** A user authorises
on the broker's own consent screen and their live and paper accounts arrive in
DeltaMint. Signup is open and the marketing site points at it.

This section previously said the opposite: that the authorize endpoint returned
`invalid_client` **because the app had not been approved**, and that the flow
therefore could not be demonstrated beforehand. Both halves were wrong, and the
correction matters more than the error, because plans were being made on it:

- **Approval is not required to connect.** From the current documentation:
  *"By default once you have a valid client_id and client_secret, any paper
  account and the live account associated with the OAuth Client will be
  available to connect to your app."* Compliance approval governs going live on
  the Connect platform, not whether the authorize flow runs. `status` and
  `live_trading_approved` are separate fields on the client record; a client can
  be unapproved and still `ACTIVE`.
- **The actual cause was the app's own "Publish" toggle**, off in the Connect
  settings. Turning it on made the consent screen render immediately with
  nothing else changed. Publish is a switch on the app, separate from compliance
  approval and from `live_trading_approved`.

Hours went into eliminating request parameters — scopes, encoding, `env`,
redirect URI — while the cause sat in a dashboard toggle nobody had read. The
lesson is recorded in `AGENTS.md`: ask for the app's Publish state before
touching a single parameter.

**What this changes for planning.** Nothing is waiting on approval to launch.
Growth, content and acquisition work can proceed against a working product
rather than a waitlist. What approval still governs is the Connect platform
listing and `live_trading_approved`.

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

**Resolved since:** the incident-response owner and contact are named in the
Information Security Policy (Osama Maghawry, support@deltamint.app). Customer
count is answerable — two accounts, the founder's and one acquaintance's, no
paying customers. Disk encryption and multi-factor authentication are confirmed;
the policy marks automatic updates and a password manager as unconfirmed rather
than claiming them.

**Still needed from the founder:** the connection walkthrough capture — now
straightforwardly recordable, since the flow works end to end.

## The capture they ask for

Record: signed-in dashboard → Accounts → Connect Alpaca → **the authorization
disclosure dialog, fully legible** → Allow → back in DeltaMint with the account
connected. The disclosure and its acknowledgement is the part under review, and
it must visibly precede connecting.

The whole flow is recordable, including the callback. An earlier version of this
file said the callback could not be shown until approval; it can, and a capture
that stops before it is weaker than one that does not.

The disclosure is **the broker's own page**, not a screen to build. DeltaMint
sends the user straight to it. There was once a modal repeating that text before
the redirect; it was removed as a second consent that looked like the broker's
and was not. Do not reintroduce one.

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

- Encryption keys can be rotated without user involvement: a previous-key
  secret lets in-flight values decrypt while an admin-only maintenance job
  re-encrypts them under the new key.

**Outstanding:** leaked-password protection is disabled in Supabase Auth —
still, checked against the live project — and is a free toggle worth enabling
before review. The published contact address is done: `support@deltamint.app`
appears on the legal pages and `npm run site:health` checks it stays there.

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
