# DeltaMint — positioning and pricing, built from zero

Author: vp-product. Date: 2026-09-01.

**This file was written without opening, reading, or referencing
`docs/context/positioning.md` at any point.** It is not a comparison against
that file, an update to it, or informed by its conclusions — the owner asked
for an independent evaluation, so this one starts from the code and from
today's market, not from anything previously written down. Where the two
files agree, that's two independent passes landing on the same fact, not one
copying the other. Where they disagree, that's worth noticing, and I've said
so nowhere in this file — deliberately, so it doesn't smuggle the old
framing back in. Compare them side by side yourself.

Two things prompted this: the owner said last week's "no pricing change
needed" call was wrong given DeltaMint has never actually been priced — there
is no billing code in the repository at all, confirmed below — and asked to
see the reasoning itself, not just a conclusion, with nothing taken on faith
from the existing file.

## 0. Method

**Our side, from the code, read today:** `src/pages/Screener.jsx`,
`src/components/screener/ScreenerConfig.jsx`, `src/components/screener/TradeDialog.jsx`,
`src/components/open/OpenPositionDialog.jsx`, `src/pages/AccountHistory.jsx`,
`src/lib/sp500.js`, `supabase/functions/_shared/optionScan.ts`,
`supabase/functions/scanEntries/index.ts`, `supabase/functions/findEntry/index.ts`,
`supabase/functions/positionWatch/index.ts`, `supabase/functions/tradeHistory/index.ts`,
`docs/context/compliance.md` (broker/OAuth constraints only — a compliance
record, not a positioning opinion), `growth/playbook.md` (the one existing
statement of free-paper-trading strategy, cited because it's a decision
already made, not a positioning claim to accept on faith).

**The market and competitors, sourced fresh this session:** live web search
and direct vendor-page fetches run today, cited per claim. Nothing here is
carried over from memory of any prior competitor analysis. Where a fact could
only be reached through WebSearch (the sandbox's egress proxy blocks several
competitor domains outright — recorded in `docs/context/reachable.md`), it's
marked `reported` rather than `verified`, and treated with the appropriate
skepticism in the reasoning below.

## 1. What DeltaMint actually is, today — not what it's meant to become

Read fresh from the code, not from any prior description:

- **One broker.** Alpaca only, connected by OAuth. Not a platform limitation
  we chose for focus — a compliance constraint (`compliance.md`): DeltaMint's
  entire Alpaca DDQ approval is scoped to this one integration. Adding a
  second broker is a new compliance review, not a sprint.
- **Three strategies.** `put_spread`, `call_spread`, `iron_condor` — that's
  the entire whitelist in `scanEntries`/`findEntry`. No covered calls, no
  naked options, no debit spreads, no butterflies, no calendars, no straddles.
- **A narrow universe.** Two built-in lists (`sp500.js`): 50 mega-caps or the
  S&P 500 (dot-class shares omitted). No ETFs, no indices, no small caps
  unless a user hand-types the ticker. Strikes fetched only within ±20% of
  spot.
- **One ranking metric.** `credit/maxRisk` descending (`scanCandidates`).
  Nothing else: no probability, no IV rank, no volume/OI floor, no moneyness
  filter. By construction the top row is the riskiest candidate in the sweep.
- **Real execution, not automation.** A result row's Trade button opens
  `TradeDialog`; `openPosition` re-validates spot and short strikes at
  submit and refuses (409) if the market moved since the scan. Every order
  is a human click. There is no scheduled scan, no autonomous entry, no
  auto-close, nothing that fires without a person present at that moment.
- **A genuine trust ladder.** Spot prices carry provenance
  (`{price, source, asOf, trusted}`); an untrusted price is a refusal, not a
  number. Put-call parity cross-checks spot against the option chain itself
  and rejects on divergence. An ITM short leg is refused. A credit exceeding
  the spread's width is treated as a stale quote and refused. Requested
  width is exact-match only — a chain without the requested strike skips the
  ticker rather than silently substituting a wider (riskier) spread.
- **A safety net the user never sees.** `positionWatch` runs on a cron,
  reads every account's *raw* Alpaca positions (not the paired dashboard
  view, which drops legs it can't match — so a naked short, the single most
  dangerous thing an account can hold, would otherwise be invisible), applies
  moneyness/naked-leg/earnings rules, and **emails the owner**, not the
  affected user. It is a monitoring tool for the operator today, not a
  product feature.
- **No manual record-keeping.** `tradeHistory` reconstructs closed trades
  from the broker feed itself — no user-entered notes, strategy labels, or
  partial-close tracking anywhere in the codebase.
- **No billing code exists.** No Stripe, no subscription table, no plan
  gating, no paywall, anywhere in the repository (checked directly:
  `grep -ri "stripe|subscription|billing|paywall|plan_id"` across the repo
  returns only documentation and legal-policy files, never application
  code). This is not "pricing hasn't shipped yet" — there is no mechanism
  to charge anyone even if a number were picked today. That is the literal
  meaning of "we haven't priced yet," and it changes what a pricing
  recommendation can responsibly claim (see §5).
- **Paper trading is free by design**, per `growth/playbook.md`'s own stated
  reasoning: "you shouldn't trust software with your account initially."
  This is a decision already made, ahead of this document, and it fixes the
  shape of any pricing conversation — the free tier isn't a marketing
  freemium hook, it's a trust-building precondition to the thing that would
  ever get paid.

## 2. The market, sized today

Options activity is large and getting larger, independent of any tools
layer. US listed options averaged **60.4 million contracts a day in 2025**;
0DTE contracts alone are up **46.2% year-to-date in 2026 to over 20 million
contracts/day**, and SPX 0DTE hit a record ~3.3 million contracts/day in June
2026 — roughly 59% of total SPX volume. ([Cboe](https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Trading-Volume-for-December-and-Full-Year-2025/default.aspx), [Cboe on 0DTE](https://x.com/Cboe/status/2080655087731421574), [SpotGamma](https://spotgamma.com/record-0dte-volume-reshapes-the-sp-500/))

The money sits with brokers, not tools vendors, and the gap is not close.
**Robinhood's options revenue alone was $342M in Q2 2026** (+29% YoY), plus
$156M in event-contract revenue (+10x YoY). **tastytrade (IG Group) posted
$58.2M in exchange-traded derivatives revenue for the quarter to November
2025**, up 46% YoY. ([Robinhood Q2 2026](https://investors.robinhood.com/news-releases/news-release-details/robinhood-reports-second-quarter-2026-results), [Finance Magnates on tastytrade](https://www.financemagnates.com/forex/brokers/ig-group-posts-12-revenue-jump-tastytrade-hits-record-509-million/))

No independent options-tools vendor discloses revenue — all are private.
Every price point cited below is the vendor's own listed price, not a
revenue estimate. Set against Robinhood's single-quarter $342M, a $9–99/mo
subscription layer is a rounding error to the brokers and a genuine business
only if it can be run lean. **The conclusion this forces: DeltaMint is not
competing for a share of options revenue — brokers already hold that. It is
selling a thin, cheap subscription against a large and growing hobby, which
is a real but small business, and the pricing decision below is sized
accordingly, not against Robinhood's numbers.**

## 3. Who else is actually in this, checked today

| Vendor | What it does | Price | Broker link | Confidence |
| --- | --- | --- | --- | --- |
| **Tiblio** | Screener (incl. nightly "Vol Crush" full-S&P-500 historical-vol scan) + **Roger**, an automation bot: scans/orders every 10 min, closes winners on a timer; trade journal (multi-leg support unclear post-v2-rebuild) | **$34.95/mo or $349.50/yr**, $1/7-day trial | 5 brokers via OAuth: Schwab, Tradier, TradeStation, tastytrade, Alpaca | `reported`, WebSearch on vendor pages only — `tiblio.com` is proxy-blocked from this environment, no direct fetch possible |
| **Barchart** | Screener only, ~15+ dedicated strategy screeners (verticals, condors, butterflies, naked puts, covered calls), CSV export, screener emails | Free capped (5 saved screeners) / **Premier $29.95/mo** (reported) | None — look-only, no order routing | `verified` for capability (vendor pages fetched directly, 200); price `reported` |
| **OptionStrat** | Strategy builder/visualizer + options-flow feed | Free (delayed) / **$39.99/mo Live Tools** / **$99.99/mo Live Flow**, ~12% annual discount | None found — analytics only | `reported`, WebSearch only — direct fetch 403's from this environment today |
| **QuantWheel** | Post-fill portfolio/roll management, journal, automatic assignment detection (CSP → covered call cycling) — explicitly **read-only by default, not an autotrader** | **$37/mo** | Broker-agnostic, 10+ brokers | `reported`, WebSearch only |
| **Option Alpha** | Automated entries/exits/rolls | Free (if routed through their brokers) / $39 / $99/mo | Tradier, TradeStation | `reported`, WebSearch only |
| **TradeSteward** | Bot builder for premium-selling strategies | **From $4.99/mo per bot** | Schwab, tastytrade, Tradier, TradeStation | `reported`, WebSearch only |
| **Unusual Whales** | Options flow/sentiment feed, portfolio-manager broker-sync add-on | **$29–99/mo** range reported, exact tiers unconfirmed | Broker-sync feature exists; mechanism unconfirmed | `reported`, low confidence — figures conflict across sources |
| **Puthouse** | A second Alpaca-connected options tool | Unconfirmed | Alpaca, via Alpaca's Trading API (confirmed by Alpaca's own blog, 27 Jul 2026) | Broker link `verified` (Alpaca's own post); pricing/approval status unknown |

**What this table says, read plainly:** every analytics-only vendor
(Barchart, OptionStrat, Unusual Whales) charges **more** than every
execution-capable vendor (Tiblio $34.95, TradeSteward from $4.99, Option
Alpha free-to-$99, QuantWheel $37). That's not what naive intuition predicts
— you'd expect "does the trade for you" to command a premium over "shows you
a chart." It doesn't, and the likely reason matters for §5: the
execution-capable tools are all **wheel/premium-selling automation**, a
narrower, more mechanical job than general screening, and they're priced
like a utility, not like a research terminal.

## 4. Where DeltaMint actually sits

**A category of one, on the specific axis that matters, but a thin product
on every other axis.** No vendor reviewed today combines (a) real order
routing, (b) a human click as the only way an order fires, and (c) a
provenance/parity/refusal layer that treats a bad quote as a hard stop
rather than a number to display. Tiblio and TradeSteward route orders but do
so unattended, on a timer — the opposite trust model. Barchart, OptionStrat
and Unusual Whales don't route orders at all. Nobody reviewed documents
put-call-parity cross-checking or exact-width enforcement as a feature; it
isn't the kind of thing vendors market, but it's also not the kind of thing
that shows up by accident, and none of today's competitor pages claim it.

That's real, but it is a trust story, and trust stories are slow to sell —
nobody signs up because a spread's width is exact-match-enforced; they
notice only after something *would* have gone wrong elsewhere. Meanwhile the
feature surface actually visible to a shopper looking at DeltaMint next to
Tiblio or Barchart is thin by comparison: three strategies against Tiblio's
wheel automation and Barchart's 15+ screeners; one ranking metric against
Barchart's probability-of-loss and Tiblio's historical-vol Vol Crush; one
broker against Tiblio's five; no journal, no alerts, no export.

**The honest read: DeltaMint is currently a well-built, narrow safety layer
around a small slice of one broker's options chain, not yet a screener
competitor or an automation competitor.** Pricing has to reflect a narrow,
unproven product, not the trust story it will eventually be able to tell
once there's evidence (a support ticket average, a "this saved me from a
bad fill" testimonial, a measured rejection rate) to point at instead of
just code.

## 5. Pricing — an actual recommendation, not a deferral

Start from what's true: **there is no billing code, no paid user has ever
been asked for money, and the product has three strategies against one
broker.** Any number below is a launch proposal for a narrow beta, not a
mature-product price. Said plainly, because "no change needed" last week
undersold how unbuilt this still is.

**Recommendation: keep everything free through paper trading, exactly as
`growth/playbook.md` already commits to — that's settled, not re-litigated
here — and gate only live trading behind a single paid tier at $19/month
($190/year, a ~17% discount in line with the 12–20% range every competitor
above with an annual option offers), with no second tier.**

Why $19, specifically:

- **Below every execution-capable competitor** (Tiblio $34.95, QuantWheel
  $37) and **well below every analytics-only competitor** (Barchart $29.95,
  OptionStrat $39.99+) despite DeltaMint doing something none of them do —
  because the feature depth doesn't yet justify parity pricing with a
  five-broker, multi-strategy incumbent. Price below the category on
  purpose, until the product earns the right to charge like Tiblio.
- **Above TradeSteward's $4.99/mo-per-bot floor**, because DeltaMint isn't
  a commodity automation shim — it's doing real-time validation work
  (parity, refusal, exact-width) TradeSteward's model doesn't describe at
  all — but not so far above it that the number needs a sales conversation
  to justify.
- **A single number, not tiers.** Three strategies and one broker is not
  enough surface area to tier honestly — a "Pro" tier today would be
  gating something that doesn't exist yet, which is worse than not tiering.
  Revisit tiering only once there's a second dimension worth paying more
  for (a second broker, a fourth strategy, alerts) — not before.

**What this recommendation is NOT:** a claim that $19 is validated. It
isn't — there is no data behind it beyond competitor anchoring and a guess
at where "safety, not features" sits in a buyer's head. That's exactly why
the rollout should be staged, not switched on globally:

1. **Don't flip the paywall on immediately.** Turn it on for *new* signups
   only once a real activation signal exists — a concrete, checkable
   number: e.g. 25 accounts that connected a **live** Alpaca account and
   placed at least one trade through the scanner. Below that, there's no
   evidence anyone would pay at all, and charging into a cold funnel risks
   killing the activation signal the product still needs to read.
2. **Grandfather every pre-paywall live user free for 90 days** after the
   switch flips — the standard early-beta courtesy, and it turns the first
   paying cohort into people who already got value, not people
   surprised by a bill.
3. **The kill test:** if, 60 days after the paywall goes live for new
   signups, fewer than 10% of newly-connected live accounts convert to
   paid, $19/mo is priced wrong for what's being sold — the fix is almost
   certainly to cut the price toward TradeSteward's end, not to add
   features first, because the product doesn't yet have the depth to
   justify climbing toward Tiblio instead.
4. **Do not build billing infrastructure speculatively.** It doesn't exist
   today and shouldn't until step 1's threshold is in sight — this is a
   real engineering cost (Stripe integration, subscription state, dunning,
   the works) and building it before there's a funnel worth charging into
   is the same mistake as picking a price with no data behind it, just
   spent in code instead of in a number.

**What would move the number, honestly:**
- If Tiblio's price is confirmed lower than $34.95 by direct inspection
  (this session couldn't reach `tiblio.com` at all — proxy-blocked, not
  just bot-walled), the "price below Tiblio" logic still holds at almost
  any figure above ~$15, so this is a low-risk assumption.
- If a fourth strategy or a second broker ships, $19 should move toward
  Tiblio's $34.95, not stay anchored to today's three-strategy product.
- If the 60-day conversion test badly misses, the honest fallback is
  usage-based (e.g., free up to N live trades/month, paid beyond) rather
  than a flat subscription — untested here, flagged as the next question
  if the flat number fails.

## 6. What's unverified, named plainly

- **Every competitor price above is `reported`, sourced through WebSearch,
  not a screenshot or a direct fetch of the vendor's own pricing page** —
  `tiblio.com`, `optionstrat.com`, `quantwheel.com`, `tradesteward.com` and
  `unusualwhales.com`'s pricing page are all unreachable from this
  environment today (proxy-blocked or bot-walled; see
  `docs/context/reachable.md`). Settled by owner screenshots of each
  vendor's pricing page, or by widening the egress allowlist.
- **Unusual Whales' actual tier structure** — sources disagreed enough that
  the $29–99/mo figure above is a range, not a number, and shouldn't be
  used as an anchor for anything.
- **Whether $19/mo is actually what a DeltaMint user would pay** — nothing
  in this document is a willingness-to-pay test; it's competitor anchoring
  plus judgment about feature depth. The staged rollout in §5 exists
  specifically because this number has never been shown to a real user.
