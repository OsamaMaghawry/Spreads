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
switch. The arithmetic is shown so the replacement is one edit.

| Step | Rate (benchmark) | Needed |
| --- | --- | --- |
| Paying (Live, active) | — | **100** |
| ← Live accounts connected, converting to paid | 15 % (paper-free products with a paid live tier) | **~670 live connections** |
| ← Signups connecting a live account | 25 % (the rest stay on paper, at least at first) | **~2,700 signups** |
| ← Visitors signing up | 3 % (intent-matched educational traffic) | **~90,000 visitors** over 17 weeks ≈ **5,300 a week** ≈ **760 a day** |

### Measured rates — revised Mon 16 Nov 2026 (W47)

Source: `docs/growth/metrics/2026-11-15.json` on `main`, the newest snapshot.
The sample is four signups. These are counts, not rates anyone should plan
on yet. They replace a benchmark only where the data exists.

| Step | Benchmark | Measured (n) | Used for planning |
| --- | --- | --- | --- |
| Visitors → signup | 3 % | **not measurable**: GA4 not configured; Search Console shows 2 clicks in 28 days and 0 signups since 22 Sep | 3 % (benchmark kept) |
| Signup → broker connected | — | **75 %** (3 of 4) | — |
| Signup → live account trading | 25 % | **25 %** (1 of 4) | 25 %, now measured |
| Live → paid | 15 % | **no data**: 0 of 1, and `billing_enforced` is not flipped, so no one can pay | 15 % (benchmark kept) |

Actual against the line:

- Visitors: about **0.07 search clicks a day**, against 760 a day.
- Signups: **4 in total**, and none in the 8 weeks since 22 Sep.
- Paying: **0**.

At the measured rates, the chain above still needs about 90,000 visitors.
The 30 Nov checkpoint (Paying > 25) and the 31 Dec target will both be
missed. Restating the target and its date is an owner decision for the
Friday pack.

Two levers change this by more than any channel does:

- **Signup → live**: if the product's own paper experience pushes the rate
  from 25 % to 40 %, the visitor requirement drops to ~56,000.
- **Live → paid**: the 30-day free trial and the "you can always close"
  promise are there to push 15 % toward 25 %. At 25 %, 400 live connections
  suffice.

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
