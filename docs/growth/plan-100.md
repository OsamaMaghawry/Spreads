# One hundred paying users

Owned by `vp-growth`. Revised every Monday with measured rates in place of
the benchmarks below; reported against every Friday in the board pack. The
KPI panel in Admin shows actual against this line every day.

## The target, stated plainly

**100 paying users by 31 December 2026.**

"Paying" = one Stripe subscription in `active` status, past its first
successful invoice, on the Live plan, one per account owner. Trials, the
90-day grandfather window, paper users and the owner's own accounts do not
count. (Definition from `docs/product/pricing.md` §5.)

Why December and not the end of this quarter: 30 September is 28 days away
and billing does not exist in production yet. The code is on staging as of
2 September; the Stripe account, the prices and the switch are the owner's.
A target with no way to pay is not a target.

## What has to be true first

1. **The unit is decided.** Live trading paid, paper free (decided 2 Sep,
   `pricing.md`). This makes *live account connected* the conversion event
   the funnel already measures.
2. **Billing is live.** Stripe keys on production, the switch flipped. Owner.
3. **The broker's live approval.** Without it there is no live account to
   sell a plan for. Pending; possibly this week.

Until all three, every number below is a plan, not a forecast.

## The chain, reverse-engineered

Benchmark rates, to be replaced by measured ones by week three of the
switch. The arithmetic is shown so the replacement is one edit. **Revised
2026-09-21** (vp-growth, Monday run) against the 2026-09-21 metrics snapshot
— read from `origin/main`'s `docs/growth/metrics/2026-09-21.json`, since this
branch's own copies (started from `staging`) stop at 2026-09-14; see this
week's play appendix, `growth/plays/2026-W39.md`. The only row with any
measured data behind it is signup → live; the other two stay benchmarks
because nothing measurable exists yet for either (see notes under the
table).

| Step | Rate | Needed |
| --- | --- | --- |
| Paying (Live, active) | — | **100** |
| ← Live accounts connected, converting to paid | 15 % benchmark, unrevised (paper-free products with a paid live tier) | **~670 live connections** |
| ← Signups connecting a live account | **50 % measured** (2 of 4 signups since tracking began have traded live), replacing the 25 % benchmark | **~1,340 signups** |
| ← Visitors signing up | 3 % benchmark, unrevised (intent-matched educational traffic) | **~44,700 visitors** over the ~14.4 weeks to 31 Dec ≈ **~3,100 a week** ≈ **~440 a day** |

**Read the 50 % with real caution.** It is 2 of 4 — the entire signup count
to date, not a sample of a larger measured population. It replaces the
benchmark because this week's instruction was to use measured rates where
the data exists, and this is the only cell where it does. It is not evidence
the true rate is 50 % rather than 25 % — at n=4 those are barely
distinguishable. Treat the ~1,340/~44,700 figures as provisional and revisit
the moment signups move past single digits; do not plan spend against them.

**Why the other two rows are still benchmarks:**

- **Live → paid** — `paying: 0` in every snapshot, but billing is still not
  live in production (`docs/ops/queue.md`, Stripe ticket open since
  2026-09-02). Zero here reflects "there is no way to pay yet," per this
  document's own caveat below, not a conversion measurement. Revise once
  billing is live and at least a few users have had a trial run its course.
- **Visitor → signup** — Search Console and GA4 are still not configured
  (`docs/ops/queue.md`, needs-owner since 2026-09-02, 19 days open). There is
  no visitor count anywhere in `docs/growth/metrics/` to divide signups by.

Two levers still change this by more than any channel does:

- **Signup → live**: already running above benchmark on paper (50 % vs. the
  25 % this row used to carry) — see the caution above before treating that
  as durable.
- **Live → paid**: the 30-day free trial and the "you can always close"
  promise are there to push 15 % toward 25 %. At 25 %, 400 live connections
  suffice. Unmeasurable until billing ships.

## Where 760 visitors a day come from

Organic search from a domain this young, with ~100 posts by December,
plausibly delivers 100–300 clicks a day by the end and far less at the
start. Organic alone gets a fifth to a half of the way. The rest:

| Channel | Owner | Weekly number | Kill number (two weeks) |
| --- | --- | --- | --- |
| Daily educational articles, six series, hub pages, feed | content-engine + seo-editor | 7 posts/week; impressions and clicks from Search Console | impressions flat for two weeks after 20 posts → the keyword map is wrong |
| The reply queue (r/options, r/thetagang threads the owner posts to) | channel-scout + reply-drafter, the owner posts | 5 replies/week; signups with `signup_source` = reddit | under 2 signups from 10 replies → change the threads, not the replies |
| Guest appearances and mentions (podcasts, YouTube, newsletters in the options space) | vp-growth | 1 pitch/week | none accepted in four weeks → drop |
| Paid search on the long-tail queries the posts target | owner sizes the budget | budget-dependent | cost per signup above $15 → pause |

## Checkpoints

| Date | Must be true | Owner |
| --- | --- | --- |
| 15 Sep | Stripe live on production, switch ready; 12 posts live in three hubs | owner, content |
| 30 Sep | 25 posts live; Search Console verified and pulling; first live connections counted | content, owner |
| 31 Oct | Measured rates replace every benchmark above; weekly signups at or above the line | vp-growth |
| 30 Nov | Paying > 25 | all |
| 31 Dec | Paying = 100 | all |

## What the Friday pack reports

Actual vs the line for: visitors (GA4), signups, live connections, paying —
from `docs/growth/metrics/README.md`. Each channel's weekly number against
its kill number. The one decision, if any, the owner needs to make.
