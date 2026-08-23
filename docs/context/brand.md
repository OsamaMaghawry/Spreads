# Brand and identity

**This file is the source of truth for how DeltaMint looks and sounds.** Change
it here and ask for it to be applied — the app (`src/index.css`), the marketing
site (`landing/public/assets/site.css`) and anything written for either should
follow this file, not the other way round.

## Name

DeltaMint. One word, capital D and M in prose. The wordmark renders lowercase as
`delta` + `mint`, with `mint` in the mint green.

Never "Spread Deck", "OptiFlow" or "Optiflow Trading" — earlier names that still
surface occasionally in older code and exports.

## Colour

The app carries the full palette; the marketing site uses a subset. Both define
a dark theme, and every value below is the light-theme value.

| Token | Value | Used for |
| --- | --- | --- |
| Accent | `#534AB7` | Primary actions, links, brand mark outline |
| Accent dim | `#7F77DD` | Hover and secondary accent |
| Accent bright | `#3C3489` | Pressed and high-emphasis accent |
| Mint | `#3FA672` | The `mint` in the wordmark, profit zones |
| Positive | `#0F6E56` | Gains, filled orders, safe states |
| Negative | `#993C1D` | Losses, max-loss wings, destructive actions |
| Ink | `#201B3A` | Primary text |
| Muted | `#6A6294` | Secondary text and labels |
| Ground | `#F6F5FB` | Page background |
| Panel | `#FFFFFF` | Cards and surfaces |
| Line | `#E1DEF2` | Borders and dividers |

Green means profit or safety, red-brown means loss or risk, violet means the
product itself. Never use the profit and loss colours decoratively — in a
trading interface they carry meaning.

## Typography

| Role | Face | Why |
| --- | --- | --- |
| Headings | Bricolage Grotesque, 600–700 | Carries personality without being a default |
| Body | IBM Plex Sans, 400–600 | Reads well at length |
| Figures | IBM Plex Mono | Columns of numbers must line up; `tabular-nums` throughout |

Mono is for data, not for atmosphere. Setting the whole interface in monospace —
as this product originally did — reads as a developer tool rather than a
trading one.

## Voice

Write the way a competent colleague explains something, not the way a brochure
sells it.

- **Plain over technical.** "We show you the condor", not "structural
  aggregation of multi-leg positions".
- **Specific over impressive.** Name the real thing. Avoid "powerful",
  "seamless", "cutting-edge", "revolutionise".
- **Short.** A homepage feature is a heading and one sentence. Parameters,
  intervals and thresholds belong in documentation.
- **Never promise outcomes.** No performance claims, no implied edge.
- **Every figure must be checkable.** A number on a marketing page is either
  rendered by the product itself or arithmetic the reader can do from what is on
  screen. Never a calculation performed offstage and presented as a product
  fact — that is how "1,800 structures" reached the homepage.
- **Never talk the product down.** Being accurate about competitors is an
  internal discipline, kept in `positioning.md`. It must not leak into public
  copy as hedging or self-deprecation. A visitor has not heard of our
  competitors; a homepage that opens by minimising a real capability is not
  honest, only weak. State plainly what the product does, and show it.

## What the product is, in one line

**A risk management layer for options income.** Everyone else helps a trader put
a trade on. DeltaMint keeps them in the game long enough for the income to
matter.

The longer version, for anyone writing copy:

- Selling premium generates income and hedges a portfolio. Managed badly, it
  also ends accounts — the losses are rare, sudden and larger than the wins.
- The product's job is awareness: what each position really risks, what the
  book really risks, and what is scheduled to happen before expiry.
- It warns. It does not decide. Every alert states a fact and leaves the call to
  the trader — which is both the honest posture and the compliant one.
- The audience is serious traders who already take risk seriously, not people
  looking for signals.

**Danger words.** Never "protect", "safe", "guaranteed", "prevent losses" or
"risk-free". The product improves *awareness* of risk; it does not reduce risk,
and claiming otherwise is both false and a compliance problem.

## Language that is not optional

Alpaca's OAuth due diligence questionnaire governs public wording. These are
compliance constraints, not style preferences — see `compliance.md`.

- Marketing pages use neutral brokerage language: "your brokerage account", not
  the broker's name. The broker may be named where an integration is genuinely
  being described, and in the legal pages where accuracy requires it.
- Never state or imply that DeltaMint is a broker-dealer, holds funds or
  securities, opens or maintains accounts, or provides brokerage services.
- Never give investment advice or recommendations. The screener lists what
  matches the user's own filters; it does not suggest trades. Any mention of a
  specific security or strategy must be worded so the reader draws their own
  conclusion.
- The authorization disclosure shown before connecting a brokerage account is
  mandated wording and must be reproduced verbatim.
