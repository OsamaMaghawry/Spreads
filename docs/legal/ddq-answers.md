# Alpaca OAuth Due Diligence Questionnaire — prepared answers

Answers to paste into the form, plus the covering note. Every factual claim here
is verifiable against the codebase or the live infrastructure; nothing is
aspirational.

> **Unresolved — needs the founder before sending.** Marked `{{TOKEN}}` below.
> - `{{LEGAL_ENTITY}}`, company type, state/country of incorporation
> - Beneficial owners >25%, authorised persons and titles, organisational chart
> - `{{CONTACT_EMAIL}}` (proposed `support@deltamint.app` — mailbox must work)
> - `{{OWNER_NAME}}` for the security policy
> - The four ⚠ workstation controls in the security policy

---

## Section 1 — Company details

| Field | Answer |
|---|---|
| Full legal company name | `{{LEGAL_ENTITY}}` |
| Company type | `{{Inc / LLC / Ltd}}` |
| State or country of incorporation | `{{...}}` |
| Beneficial owners >25% | `{{...}}` |
| Authorised persons in contact with Alpaca | `{{Name, Founder}}` |
| Company website | https://deltamint.app |
| Type of entity (registered, regulated, licensed) | Not registered, regulated, or licensed. DeltaMint is a software vendor. It is not a broker-dealer, investment adviser, exchange, or custodian, holds no client funds or securities, and does not provide investment advice. It therefore does not hold and does not require a securities registration or licence. |
| Organisational chart | Single-entity, sole operator. `{{Name}}` — Founder, holding all functions (engineering, operations, security, support). No employees or contractors. A one-box chart is attached. |

## Section 2 — Documents attached

| Requested | Provided |
|---|---|
| End User Agreements / Terms and Conditions | `terms-of-service.pdf` — also published at https://deltamint.app/terms |
| Privacy Policy | `privacy-policy.pdf` — also published at https://deltamint.app/privacy |
| Fee / Pricing Schedule | `pricing.pdf` — also published at https://deltamint.app/pricing |
| Cybersecurity Policy | `information-security-policy.pdf` |
| Connection walkthrough | `connect-walkthrough.mp4` (see note in Section 6) |

---

## Section 3 — Business model, products, technology and services

DeltaMint is a subscription software tool for individual traders who sell
defined-risk option spreads — credit spreads and iron condors — in their own
brokerage accounts. It does one job: make a strategy the trader has already
chosen easier to execute consistently and easier to see the risk of.

**What the software does.**

1. **Screening.** The user sets filters — days to expiry, short-strike delta,
   spread width, minimum credit, maximum risk per position. DeltaMint reads the
   option chain through the brokerage API and lists every structure matching
   those filters, ranked by return on risk. The output is a list of what matched
   the user's own parameters. It is not a recommendation, contains no view on
   any security, and no contract is promoted, sponsored, or paid for.

2. **Order submission at the user's direction.** The user selects a structure,
   sets quantity and order type, and confirms. All legs are submitted as a
   single multi-leg order to the user's broker. Before confirming, the user is
   shown the credit, the maximum risk, the break-even range, that position's
   risk as a percentage of account equity, and a warning if the underlying
   reports earnings before the position expires.

3. **Position monitoring.** Positions are read back from the broker and grouped
   into the structures they were traded as, with live profit and loss, distance
   to the short strikes, and aggregate risk across the account.

4. **Exit.** The user closes a position from the same view. Where a working
   limit order is adjusted toward the market, it moves within bounds the user
   configured beforehand and stops at the limit the user set.

**What DeltaMint explicitly does not do.** It holds no funds or securities and
opens no accounts. It gives no investment advice and makes no recommendations.
It has **no copy trading, no mirror trading, no social trading, and no
influencer promotion** — there is no mechanism by which one user can see,
follow, subscribe to, or replicate another user's positions or trades, and no
lead-trader or signal-provider concept exists in the product. It exercises no
discretion over any account: every order originates from a specific instruction
or a rule the user configured in advance.

**Technology.** A browser application served as static assets from Cloudflare
Workers, with server-side logic in managed serverless functions and a managed
PostgreSQL database (Supabase). No company-operated servers. Brokerage
credentials are encrypted with AES-256-GCM under a key held outside the
database. Full detail in the attached Information Security Policy.

**Commercial model.** Flat monthly subscription — a free paper-trading tier,
$39/month, and $99/month — billed by a third-party payment processor. **We take
no commission, no share of trading profits, no payment for order flow, and
receive nothing contingent on trading activity or volume.** Revenue is
independent of whether or how much a user trades. We are not compensated by any
broker.

**Users.** The product is in private testing. Live use is limited to the
founder's own brokerage account, plus one acquaintance using a paper account.
There are no paying customers and no public sign-ups yet.

---

## Section 4 — Endpoint protection (production and corporate)

*(Reproduced from §9 of the Information Security Policy.)*

**Production.** There are no company-operated servers or workstations in the
production path, so there is no endpoint on which to install anti-malware
software. Production code runs in provider-managed, sandboxed, ephemeral
runtimes — Cloudflare Workers isolates and Supabase Edge Function isolates —
rebuilt from an immutable artefact on each release. Risk is reduced
structurally: no persistent host, no shell access, no long-lived process, and no
ability to install software into a running environment. Code can only reach
production through the source repository, which is gated by authenticated,
MFA-protected access plus lint and type checks in CI that block a failing build
from deploying.

**Corporate.** One workstation, the founder's. It runs full-disk encryption,
automatic OS and browser updates, and the platform's built-in endpoint
protection (macOS XProtect/Gatekeeper or Microsoft Defender) enabled. Unique
credentials are held in a password manager, and every privileged platform
account requires multi-factor authentication, so compromising the workstation
alone does not yield production access. No production data or plaintext secret
is stored locally.

---

## Section 5 — Do you currently have customers?

No paying customers. The product is in private testing: the founder trades a
live account through it, and one acquaintance is using a paper account. Public
sign-up has not opened, and will not open before OAuth approval.

---

## Section 6 — Connection walkthrough

Attached is a screen recording showing: signed-in dashboard → Accounts →
"Connect brokerage account" → the authorisation disclosure, shown in full and
legible → Continue → the broker's own sign-in page.

**Note for the reviewer:** the flow cannot be shown past the broker's sign-in
page, because the authorize endpoint returns `invalid_client` until this OAuth
application is approved. The recording covers everything up to that boundary,
including the disclosure and the user's acknowledgement of it, which is the part
under review. We will supply a complete end-to-end recording immediately after
approval if that is useful.

---

## Section 7 — Compliance with Alpaca's stated conditions

- **No copy, mirror, or social trading, and no influencer promotion.** The
  product contains no such feature and none is planned.
- **Broker name not used in marketing or agreements.** Our Terms of Service and
  marketing copy use neutral language throughout — "link your brokerage
  account", "your connected broker". Alpaca is named in exactly two places: the
  brokerage-integration section of the website, which the questionnaire permits,
  and the Privacy Policy, where naming the recipient of a user's data is
  necessary for the disclosure to be truthful. We will remove or amend either on
  request.
- **No implication of broker-dealer status.** The Terms state plainly that
  DeltaMint is not a broker-dealer, adviser, exchange, or custodian, holds no
  funds or securities, and executes nothing itself.
