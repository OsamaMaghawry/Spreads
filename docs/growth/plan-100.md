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

**Status, 2026-10-05 (vp-growth, weekly revision):** no benchmark above is
replaced. The newest snapshot (`docs/growth/metrics/2026-10-05.json`, on
`main`; `staging` is stale on this path) shows `signedUp: 4`, `signedUpLast7: 0`
— the funnel has been flat at 4 signups, ever, since 2026-09-08 (four weeks).
Measured so far: 4 signed up → 3 connected → 3 traded → 1 traded live → 0
paying. At n=4 these are counts, not rates; substituting "75 % signup→connected"
or "25 % signup→live" for the 25 % benchmark would read as more certain than
it is. Visitors are still unmeasured (Search Console and GA4 read "not
configured" in every snapshot), so the 3 % visitor→signup step cannot be
replaced either. Next revision point: first week with ≥ 30 signups or any
GA4 session count.

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
