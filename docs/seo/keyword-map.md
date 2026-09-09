# Keyword map — what to write, in what order, and why that order

Owned by `seo-editor`. Written 9 Sep 2026. This is the map that should have
existed before the first article: it ranks topics by **what a domain with no
authority can actually win**, not by syllabus order.

It sits alongside `docs/seo/keywords.md` (the per-post row the daily content
run reads). Where the two disagree about a title or a target query, **this
file is the newer judgement** and `keywords.md` gets updated to match; nobody
resolves it silently in a post.

## What this map is, and what it is not

There is no rank tracker, no keyword tool and no Search Console connection in
this environment. Every "winnable" and "hard" below is read off a results page
on 9 Sep 2026 — **which kinds of pages surface for a phrasing**, nothing more.

So, plainly:

- **No search-volume figure appears anywhere in this file.** Not estimated,
  not banded, not implied. A number here would look sourced and would not be.
  Where demand shape matters, the evidence is stated as evidence: a Quora
  thread or a YouTube video holding page one means somebody is asking, because
  Google would not rank those for a query nobody enters.
- **Difficulty is a read, not a metric.** Three grades, and the rule behind
  each:
  - **Winnable** — forums, Quora, Medium/Substack, YouTube, TradingView
    chart-idea pages or one-page calculator sites hold page one. UGC ranking
    means no publisher has answered the question well.
  - **Mid** — one or two broker education hubs plus small independent blogs.
    Reachable once the cluster around it exists, not from a cold start.
  - **Hard** — Investopedia, Fidelity, Schwab, tastylive, OIC, Nasdaq, top to
    bottom. A three-month-old domain does not take these, and trying first is
    how a blog spends six months earning nothing.
- **Could not be established, for every row:** monthly search volume, keyword
  difficulty scores, current positions for anything DeltaMint has published,
  whether these results pages are personalised or localised, and whether
  Google treats any of these phrasings as YMYL-restricted beyond the general
  finance case. Assume the YMYL bar applies to all of it.

Finance is YMYL. One over-optimised title costs more than several rankings
earn, and this audience has been marketed at by a thousand scams. The register
in `growth/playbook.md` and the rules in `docs/context/compliance.md` outrank
every ranking argument in this file, without exception.

---

## 1. The first twenty articles, ranked by winnability

Ranked by what the results pages say is takeable, **not** by syllabus order.
The syllabus number is carried so `content/PLAN.md` stays reconcilable.

Titles are written to be published as-is: the searched phrasing near the
front, trader register, no recommendation, no prediction, no return figure.
Character counts are the title length.

### Tier 1 — realistic inside six months (UGC on page one today)

**1. Credit spread expiring between the strikes**
- Target query: `what happens if a credit spread expires between the strikes`
- Title: **Credit spread expiring between the strikes: what happens** (56)
- Slug: `credit-spread-expires-between-strikes` · category `managing` (syll. 52/53)
- SERP 9 Sep: a Medium post, Schaeffer's, Fidelity's bull-put page, Wikipedia,
  then TradingView chart ideas. **Winnable** — chart-idea pages in the tail
  means nothing is answering the question.
- Intent: someone holding a spread into Friday, price sitting between the
  strikes, wants to know what the account does — not a strategy lesson.
- Gap: every ranking page describes the payoff; none walks the settlement
  (short assigned, long expires, shares appear Monday, what the cap was worth).

**2. What buying power a put credit spread holds**
- Target query: `how much buying power does a put credit spread use`
- Title: **How much buying power a put credit spread holds** (47)
- Slug: `put-credit-spread-buying-power` · category `foundations` (syll. 13)
- SERP 9 Sep: StoneX and other **fixed-income** credit-spread glossaries,
  Public.com, and four TradingView chart-idea pages. **Winnable**, with a
  caveat that governs the title: the unqualified phrase "credit spread" returns
  bond spreads, so "put credit spread" or "options" must be in the title, the
  slug and the first sentence or the page competes in the wrong query space.
- Intent: sizing before sending an order; wants the number their broker will
  actually hold.
- Gap: the ranking pages give width − credit and stop. None says the hold does
  not shrink as the position wins.

**3. When the collateral is released**
- Target query: `when is collateral released after a credit spread expires`
- Title: **When the collateral behind a spread is released** (47)
- Slug: `credit-spread-collateral-released` · category `foundations` (syll. 13 sibling)
- SERP 9 Sep: two Quora threads, a 2016 blog post, Wikipedia, a YouTube video,
  TradingView, and two contract-law pages about collateral release clauses.
  **Winnable and thin** — nothing on page one is a real answer.
- Intent: expiry weekend, buying power still showing as used, mild panic.
- Gap: nobody separates "the credit is yours" from "the hold has been lifted",
  which are different events on different days.

**4. Assigned early on a spread**
- Target query: `early assignment credit spread what happens to my account`
- Title: **Assigned early on a spread: what the account shows** (50)
- Slug: `credit-spread-early-assignment` · category `managing` (syll. 51)
- SERP 9 Sep: E*TRADE, Robinhood support ×3, Schwab, TradingView scripts.
  **Winnable** — support-article SERPs are broker-specific and generic;
  a neutral account-mechanics page has room.
- Intent: assignment notice already received, at 7am, before the open.
- Gap: the shape of the account the morning after — long shares plus a long
  put, a deficit, the cap still intact, the position no longer defined-risk.
- Compliance: this post explains what changed and what the options *are*. It
  does not say which to take (rule 3). The ranking pages do; we won't.

**5. Can an iron condor lose max loss on both sides**
- Target query: `iron condor max loss both sides`
- Title: **Can an iron condor lose max loss on both sides?** (47)
- Slug: `iron-condor-both-sides-max-loss` · category `income` (syll. 20/21)
- SERP 9 Sep: Macroption, SpotGamma support, apexvol, three one-page
  calculators. **Winnable** — calculator pages ranking is a text-coverage gap.
- Intent: sizing a condor, or reconciling a broker's margin number.
- Gap: none of them connects "one side only" to what the broker actually
  holds, or to netting across a book of condors.

**6. Cost basis after a put assignment**
- Target query: `wheel strategy cost basis after assignment`
- Title: **Cost basis after a put assignment, turn by turn** (47)
- Slug: `wheel-cost-basis-after-assignment` · category `income` (syll. 30)
- SERP 9 Sep: QuantWheel (×3), OptionsMath, TradingOptionsCashflow,
  OptionWheelTracker, WheelStrategyOptions — **all small tool sites, several
  of them calculators**. **Winnable**, with a warning: the intent is partly
  "give me a calculator". A prose page needs a worked table or it loses to a
  form field.
- Intent: assigned, now holding shares, wants the number the broker doesn't show.
- Gap: every one of them does one turn. None does the second and third turn,
  and none says what happens to the basis when the shares are called away.

**7. What a high win rate hides**
- Target query: `options selling high win rate misleading`
- Title: **Win rate is not a result: what a high one hides** (47)
- Slug: `options-win-rate-misleading` · category `measuring` (syll. 62)
- SERP 9 Sep: TradeZella, LuxAlgo, OptionJournal, OptionAlpha, Barchart, small
  blogs. No Investopedia, no broker hub. **Winnable**, and it is journal-and-
  tracker adjacent, which is our commercial ground.
- Intent: a trader whose eight winners and one loser net negative.
- Gap: the ranking pages argue expectancy in the abstract. None shows the
  arithmetic against max loss on a defined-risk book.
- Compliance: this describes a metric's limits. No claim about DeltaMint users'
  results, ever (playbook claims discipline).

**8. Is delta the probability of finishing in the money**
- Target query: `is delta the probability of expiring in the money`
- Title: **Is delta the probability of finishing in the money?** (51)
- Slug: `delta-probability-in-the-money` · category `foundations` (syll. 6 sibling)
- SERP 9 Sep: a Medium post, Macroption, Quora, Schwab, OIC, a wiki-style site,
  Seeking Alpha, TradingView. **Winnable** — Medium and Quora on page one for a
  question brokers have half-answered.
- Intent: strike selection; somebody was told "15 delta is a 15% chance".
- Gap: everyone says "close but not exactly". Almost nobody says *which
  direction* it errs and where the shortcut breaks.
- Restraint: the post explains the approximation. It never suggests a delta to
  sell (playbook: "traders commonly use 15–20 delta" is fine; "sell 15 delta"
  is not).

**9. Spread against cash-secured put, on capital**
- Target query: `put credit spread vs cash secured put capital`
- Title: **Put credit spread vs cash-secured put: what each ties up** (56)
- Slug: `put-credit-spread-vs-cash-secured-put` · category `income` (syll. 18)
- SERP 9 Sep: a Substack, a Medium post, ApexVol glossary, Nasdaq syndication,
  two more Substacks. **Winnable**.
- Intent: small account, deciding how to express the same short-put view.
- Compliance: the title is deliberately **not** "which is better". A comparison
  that concludes is a recommendation (rule 3). This one states what each holds
  and what each risks and stops.

**10. Short leg through the strike**
- Target query: `credit spread short leg in the money what to do`
- Title: **Your short leg went through the strike: what changed** (52)
- Slug: `credit-spread-short-leg-itm` · category `managing` (syll. 53)
- SERP 9 Sep: OptionAlpha, OptionsTradingIQ, SoFi, Schwab, Investing.com,
  TradingView chart ideas. **Winnable**, but the closest competitors are
  explicitly advisory ("you should exit").
- Gap and restraint together: the ranking pages tell the reader what to do. We
  cannot and will not. The angle is the one nobody covers anyway — what
  *changed* the moment the strike went: assignment probability, the mark's
  relationship to the cap, what the collateral is doing. The reader draws the
  conclusion. Note the deliberate "what changed", not "what to do", in the
  title.

**11. Why a spread limit order doesn't fill**
- Target query: `options spread limit order not filling`
- Title: **Why a spread limit order doesn't fill at the mid** (48)
- Slug: `options-spread-not-filling` · category `managing` (syll. 56)
- SERP 9 Sep: OptionAlpha, Robinhood support ×4, projectfinance, a 2009
  futures-magazine page. **Winnable** — broker support pages answer the generic
  question, not the multi-leg one, and demand theme E in the playbook is this
  question verbatim.
- Intent: order sitting unfilled while the market moves.
- Gap: none of them explains that a spread quote is a derived price with no
  book of its own.

**12. Covered call assigned before the ex-dividend date**
- Target query: `covered call assigned early before ex dividend`
- Title: **Covered call assigned the day before ex-dividend** (48)
- Slug: `covered-call-assigned-ex-dividend` · category `investing` (syll. 46)
- SERP 9 Sep: Fidelity, then Option Samurai, VectorVest, Blue Collar Investor,
  optiondash, borntosell, a Substack. **Winnable** — one broker hub and a field
  of small blogs.
- Intent: shares gone, dividend missed, wants to know why it was rational for
  the holder.
- Gap: the mechanics are covered; the account view the next morning is not.

**13. Cash-secured put assigned**
- Target query: `what happens when a cash secured put is assigned`
- Title: **Your cash-secured put was assigned: what lands where** (52)
- Slug: `cash-secured-put-assigned` · category `income` (syll. 16 sibling)
- SERP 9 Sep: Fidelity ×2, OIC, Schwab, Firstrade, SoFi support, one small
  blog. **Mid, leaning hard** — this is the most contested row in tier 1 and
  sits here only because the intent is narrow and account-shaped.
- Gap: every page gives strike − premium as the effective price. None shows the
  two records the event actually creates (premium kept in full; a stock
  position at the strike) or why merging them destroys the history — which is
  ground `options-journal-splits-spreads-into-legs` already owns and can link.

**14. What days-to-expiry trades off**
- Target query: `best dte for credit spreads` (the demand), targeted through a
  non-prescriptive phrasing
- Title: **What days to expiry actually trades off on a spread** (51)
- Slug: `credit-spread-dte-tradeoff` · category `income` (syll. 23)
- SERP 9 Sep: DaysToExpiry (×3), CoveredEdge, DataDrivenOptions, JournalPlus —
  small data blogs only. **Winnable on competition.**
- **Two restraints, both binding.** The word "best" cannot go in our title: it
  implies a recommendation (rule 3). And the ranking pages win partly by
  quoting backtest win rates and "45 DTE produced the highest risk-adjusted
  returns" — we have no such study and may not present one as achievable
  (playbook claims discipline). So we compete without the thing that ranks
  them, which is why this sits at 14 and not at 4. Publish it as the
  trade-off, or don't publish it.

**15. Adding up max loss across a book**
- Target query: `total risk across multiple option positions`
- Title: **Adding up max loss across a book of spreads** (43)
- Slug: `total-max-loss-across-positions` · category `measuring` (syll. 61)
- SERP 9 Sep for the adjacent phrasing (`how much of my account should be at
  risk in options`): OptionAlpha, ImpliedOptions, OptionsTrading.org,
  OptionsPilot, SPXOptionTrader, purepowerpicks, TradingView, Scribd.
  **Winnable**, all small sites.
- **Restraint:** every page that ranks answers with a prescription — 1%, 2%,
  5%, "never more than 30–50%". We may not. The post explains how the total is
  computed, that condors net per side, and that a dozen small max losses were
  each fine and never got added up. It names no percentage as a target. This is
  the single most tempting compliance trade in the whole map and the answer is
  no.
- This is the strongest internal link into `return-on-risk-vs-return-on-capital`.

**16. Annualising a 30-day result**
- Target query: `annualized return options small sample`
- Title: **Annualising a 30-day spread return, and why it misleads** (55)
- Slug: `annualized-return-options-small-sample` · category `measuring` (syll. 64)
- SERP 9 Sep: almost entirely **fixed income** — Cambridge Associates, Bank of
  England, Moody's, arXiv — plus two generic annualised-return calculators.
- **Read: low competition, but the query space is polluted and probably thin.**
  Ranked last in tier 1 for that reason, not for difficulty. Worth writing
  because the playbook forbids us presenting annualised small-sample returns
  and this post is that position stated in public; not worth writing *for
  traffic*.

### Tier 2 — mid; reachable once tier 1 exists, not before

**17. Option assignment: what appears in the account**
- Target query: `option assignment what happens` · Title: **Option assignment:
  what actually appears in your account** (56) · slug
  `option-assignment-what-happens` · `foundations` (syll. 10)
- SERP read (9 Sep, via the early-assignment query): broker help pages and
  Robinhood support dominate, with Reddit visible. **Mid.** This is the
  cornerstone the tier-1 assignment posts (4, 12, 13) all link up to, so it
  gets written after them and inherits their internal links.

**18. Reading an option chain**
- Target query: `how to read an option chain` · Title: **How to read an option
  chain, column by column** (45) · slug `how-to-read-an-option-chain` ·
  `foundations` (syll. 14)
- SERP 9 Sep: Lightspeed, MarketChameleon, AvaTrade, Wealthsimple, TradingView.
  Broker and platform education, no UGC. **Mid, leaning hard.** Realistic at
  9–12 months, not 6.

**19. The covered call**
- Target query: `covered call explained` · Title: **What a covered call does,
  and what it does the day after** (56) · slug `covered-call-explained` ·
  `income` (syll. 15)
- **Hard.** Not SERP-read on 9 Sep; `keywords.md` records Investopedia,
  Fidelity and Schwab holding it, and nothing suggests that changed. Write it
  because the income cluster needs its spine, and expect the traffic to arrive
  through post 12 and the hub, not through this title.

**20. The put credit spread**
- Target query: `put credit spread explained` · Title: **What a put credit
  spread is, and what it holds** (46) · slug `put-credit-spread-explained` ·
  `income` (syll. 18)
- **Hard.** Nasdaq, Schaeffer's, Fidelity, Schwab and tastylive all surfaced
  across the credit-spread searches on 9 Sep. Same reasoning as 19: it is the
  cluster spine, and it is where posts 1, 2, 3, 9, 10 and 11 point up to.

### The plain answer on which of these are realistic

- **Realistic inside six months:** 1–12 and 15. Each has UGC, a calculator
  page, a chart-idea page or a broker support article on page one — the
  signature of a question nobody has answered properly. That is thirteen posts,
  which at one a day is a fortnight of writing and about four months of waiting.
- **Realistic but slower, or thin:** 13 (brokers hold it; our angle is
  genuinely different), 14 (we compete without the backtest numbers that rank
  the incumbents), 16 (low competition, probably low demand).
- **Aspirational — write for the cluster, not for the ranking:** 17, 18, 19,
  20. And the foundations head terms generally, including the one already
  published.

**The order matters more than the list.** Opening at "what is an option" put
the weakest-odds page first. Opening at "what happens if it expires between the
strikes" puts thirteen winnable pages first and lets them carry the hubs
upward.

---

## 2. Verdicts on the four live posts

**No unpublishes.** On a four-post blog, removing a post removes crawl depth,
internal links and the little history the domain has, and buys nothing: none of
these is wrong, inaccurate or non-compliant. Three are simply early. Early is
fixed by what gets published next to them, not by deletion.

**On slugs, before the individual verdicts.** `landing/src/index.js` resolves
`/blog/<slug>` by looking the slug up in the published set and returns a 404
when it misses (see the final `else` branch of the fetch handler). **There is
no redirect map anywhere in the landing Worker** — no 301 path, no alias
column. So a slug change on a live post is not a rename; it is a deletion plus
a new page, and it throws away every link and every crawl signal the old URL
had. Building a redirect table is a small change, but it is a change, and it
must ship *before* any slug moves. Every verdict below is written to avoid
needing one.

### `what-is-an-options-contract` — **keep, with one link fix**

Title, slug, meta description and first paragraph are all doing their job. The
title carries the query at the front, the opening sentence commits to the topic
in the first eight words, and the meta reads for a searcher rather than
summarising for the author. This is the model the other three should be judged
against.

Two notes, neither a retitle:

- The head term is **hard, and also ambiguous**: the 9 Sep results for `what is
  an options contract` mix trading pages (OptionAlpha, InvestingAnswers) with
  **contract-law** pages (Cornell LII, LawInsider, a Louisiana statute). Half
  the query space is not our audience. Do not spend more optimisation on it.
- One internal link is pointed at the wrong post. The sentence "when a later
  post computes the max loss on a credit spread" links to
  `/blog/return-on-risk-vs-return-on-capital`; the post that computes max loss
  is now `credit-spread-max-loss`. Re-point the anchor. Slug untouched, no
  redirect.

### `credit-spread-max-loss` — **retitle, keep the slug**

The strongest asset of the four, and the closest to search-shaped already.

- Current title: `Credit spread max loss: what it covers and what it doesn't`
- Proposed title: **Credit spread max loss before expiration: what it covers** (56)
- Slug: **unchanged** — `credit-spread-max-loss` is the head phrase, short, no
  stopwords, and the phrase this page should own. No redirect needed.
- Evidence: the 2 Sep reading in `keywords.md` graded `credit spread max loss
  before expiration` **winnable** (tastytrade, moomoo, then TradingView chart
  ideas) and the bare `credit spread max loss` **hard**. The current title
  competes only for the hard one. The proposed title puts the winnable phrasing
  in the title while the slug keeps the head phrase. The 9 Sep re-read is
  consistent: `why is my credit spread showing a loss before expiration`
  returns Quora at position one.
- The `what it doesn't` construction is fine register but carries no phrasing
  anybody types. `before expiration` does.
- One record conflict to resolve, not to guess at: `content/PLAN.md` lists this
  post as **on staging**, while the brief for this map describes four posts as
  live. If it is still on staging, the slug is not yet load-bearing and there is
  more freedom than this verdict assumes; if it is live, the verdict above
  stands as written. Someone should read the production database rather than
  either document.

### `options-journal-splits-spreads-into-legs` — **retitle, keep the slug**

- Current title: `Why your options journal splits spreads into legs`
- Proposed title: **Why your broker shows a spread as two separate legs** (51)
- Slug: **unchanged.** The matching slug would be
  `broker-shows-spread-as-two-legs`, and it would be better — but better by a
  weak ranking factor, against a live URL, with no redirect mechanism built.
  Not worth it. If a redirect table is built for another reason, revisit.
- Evidence: `options journal that groups spreads instead of legs` on 9 Sep
  returns TradesViz, StonkJournal, TraderSync, Trademetria, Tradervue,
  OptionsTradingIQ — a **commercial listicle SERP**. An educational post does
  not win a "best journal" results page; a product or comparison page might,
  and that is a landing-page question, not a blog question. Meanwhile the
  playbook's demand theme A is the pain in the reader's own words: "my journal
  splits my spread into separate legs". The retitle moves the post from the
  commercial query it cannot win to the mechanical one it can, and points the
  word "broker" — which is what the reader is actually looking at — at the
  front.
- Compliance check on the proposed title: "broker" generic, unnamed. Rule 1
  holds.

### `return-on-risk-vs-return-on-capital` — **keep as-is; stop expecting traffic**

- Title and slug unchanged. It is a pillar page and a positioning document, and
  it reads like one.
- Honest assessment: `return on risk vs return on capital` is close to a
  DeltaMint-internal framing. **Not SERP-read on 9 Sep** — but the adjacent
  reads are a warning: every unqualified "credit spread" and "annualised
  return" query on 9 Sep returned fixed-income and corporate-finance pages, and
  this phrase is shaped the same way. Someone should read it before any further
  work is spent on the page.
- Its job is not acquisition. Its job is to be the page that posts 7, 14 and 15
  link into once they bring readers, and to be the argument a visitor reads
  before they look at the product. Judge it on that.
- Fix required regardless of SEO: it links to `options-journal-...` and to
  nothing else. **It does not link to `/blog/measuring`**, which `content/PLAN.md`
  requires of every post. Add the hub link.

---

## 3. The ladder — head, mid, long tail

The mistake worth naming: treating a keyword list as a list. It is a ladder,
and the rungs carry each other. A zero-authority domain cannot buy authority,
so it has to accumulate it — and the only thing it can accumulate from a cold
start is pages that answer questions nobody else has answered, which is exactly
what the tier-1 list is.

**Rung one — long tail (months 0–6). The posts rank; the hubs don't yet.**
Fifteen-plus posts, each targeting one specific, account-shaped question:
posts 1–12 and 15 above. Signature of the target: a Quora thread, a YouTube
video, a Medium post or a calculator page holding position one. Each of these
posts links *up* to its category hub and *sideways* to one or two siblings.
Nothing here is a head term and none of these titles should be widened toward
one.

**Rung two — the hubs consolidate (months 4–12). The hubs start to rank.**
Each `/blog/<category>` hub is the page that owns the head term for its
cluster, and it earns that by receiving a link from every post in the cluster —
which is why the "every post links to its hub" rule in `content/PLAN.md` is a
ranking mechanism and not a tidiness rule, and why two of the four live posts
breaking it is a real finding. The hub targets:

| Hub | Head term it is the long-term target for | Fed by |
| --- | --- | --- |
| `/blog/income` | credit spread · covered call · cash-secured put · iron condor · the wheel | posts 5, 6, 9, 13, 14, 19, 20 |
| `/blog/foundations` | options · option delta · buying power · assignment | posts 2, 3, 8, 17, 18 + `what-is-an-options-contract` |
| `/blog/managing` | managing options positions · rolling · adjusting | posts 1, 4, 10, 11 + both live `managing` posts |
| `/blog/measuring` | return on risk · options trade record | posts 7, 15, 16 + `return-on-risk-vs-return-on-capital` |
| `/blog/hedging` | protective put · collar | nothing yet — cluster not started |
| `/blog/investing` | LEAPS · stock replacement | post 12 only |

**Rung three — mid-tail (months 9–18).** Once a hub has eight to twelve posts
under it, the mid terms come into range: `put credit spread explained`,
`cash secured put explained`, `option assignment`, `how to read an option
chain`. These are posts 13, 17, 18, 19, 20 — written *late* on purpose. A
cluster spine published into an empty cluster is a page with no support.

**Rung four — head terms (18 months+, and conditional).** `covered call`,
`credit spread`, `the wheel`, `implied volatility`. These belong to
Investopedia, Fidelity, Schwab, tastylive and the OIC because those domains
carry authority this one does not have and cannot manufacture on-page. They
become reachable only with off-site authority — which is a different play with
a different owner, not a titling decision. **Nothing in this map should be
retitled in pursuit of a head term.** The hub pages carry the head phrasing;
the posts carry the questions.

The three-rung shape in one sentence: **win the questions nobody answered, let
them feed the hubs, and let the hubs reach for the terms the posts never
could.**

---

## 4. What the register has to become for foundations posts

Not softer. Not more marketing. The playbook register — a trader explaining
something to another trader, concrete numbers, admitted uncertainty, no
adjectives doing the work of evidence — is exactly right and does not change.

What changes is **one assumption**: the current posts assume the reader already
holds the position being discussed. A foundations reader does not. The fix is
mechanical, and it costs nothing in register:

1. **Define the term in the sentence that first uses it**, not in a later post.
2. **Open on the thing itself, not on the argument about the thing.** A
   searcher and a crawler both need the topic committed to in sentence one.
3. **Keep the "after the fill" ending.** That is the differentiator; a
   foundations post that stops at the definition is Investopedia with less
   authority.

Three rewrites from the live posts, all inside `brand.md` and the playbook
vocabulary lists:

**From `return-on-risk-vs-return-on-capital`, the opening.**

> Before: "The argument over which to sort by usually stays theoretical. It
> stops being theoretical when there are twenty spreads open at once and the
> question is which of them is doing the most work for the collateral it is
> holding down."

> After: "Sell a credit spread and two numbers describe it: the credit that
> arrived, and the most it can lose. Ranking by the first one alone treats a
> spread that risks $65 and one that risks $465 as the same trade."

What changed: the sentence no longer requires the reader to have twenty open
positions to follow it, and the concrete figures from later in the post move to
the front where the searcher can see the payoff. No adjectives added, no
vocabulary softened, register identical.

**From `options-journal-splits-spreads-into-legs`, the opening.**

> Before: "You sent one order — a credit spread. The broker filled it as
> several executions, and somewhere downstream — a journal, a tracker, a
> dashboard — a piece of software has to put them back together."

> After: "A credit spread is two options traded together in one order: one
> sold, one bought. Your broker reports the fills separately, and something
> downstream — a journal, a tracker, a dashboard — has to put the pair back
> together."

What changed: "credit spread" is defined in the clause that introduces it, and
"executions" is deferred until the post has earned it. The reader who does not
yet know what a spread is can still read sentence two.

**From `credit-spread-max-loss`, the structure paragraph.**

> Before: "The structure underneath it is two options on the same underlying,
> in the same expiration, in the same class, in equal size — one sold, one
> bought further from the money."

> After: "Underneath it are two options on the same stock, expiring on the same
> day, in the same number of contracts: one you sold, and one you bought
> further from the money to cap what the first one can cost."

What changed: "class" and "equal size" — precise terms that a foundations
reader cannot decode — become "the same stock" and "the same number of
contracts", and the long leg's *purpose* arrives with its description. Nothing
is lost in precision; "in the same class" and "on the same stock" say the same
thing to this audience.

**What must not change**, and is worth writing down because the pressure will
come: no exclamation marks, no emoji, no "simple", "easy", "powerful" or
"proven", no second-person imperative that reads as instruction ("sell a
15-delta put"), and every post still ends with the not-investment-advice line.
Making a post accessible is a vocabulary change, not a register change.

---

## 5. The internal-linking plan

Hubs exist per category and are generated by `landing/src/index.js`. Two things
that file already does, which the plan depends on and nobody should duplicate
by hand: prev/next "Read next" navigation within a category, ordered by
`series_order`, and a "More to read" list. What it does **not** do is link
across categories — every cross-cluster link has to be in the body text.

**Four rules, and every one of them is a ranking mechanism.**

1. **Every post links up to its category hub, in the body.** This is how a hub
   accumulates the internal PageRank that lets it compete for a head term.
   Currently 2 of 4 live posts do it.
2. **Every post links back to one prerequisite** — the post that defines what
   it assumes.
3. **Every post is linked *to* by at least one other post.** An orphan does not
   rank and does not convert.
4. **Anchor text is the target's phrasing, in a sentence.** Not "click here",
   and not a keyword string welded into prose no trader would say.

**Findings against the live four, from `grep` of the body links:**

| Post | Hub link | Links out | Linked from |
| --- | --- | --- | --- |
| `what-is-an-options-contract` | ✅ `/blog/foundations` | 2 (one mis-pointed) | nothing |
| `credit-spread-max-loss` | ✅ `/blog/managing` | 2 | **nothing — orphan** |
| `options-journal-splits-spreads-into-legs` | ❌ **missing** | 1 | 3 posts |
| `return-on-risk-vs-return-on-capital` | ❌ **missing** | 1 | 3 posts |

Three fixes, none of which touches a slug:

- Add `/blog/managing` to `options-journal-splits-spreads-into-legs`.
- Add `/blog/measuring` to `return-on-risk-vs-return-on-capital`.
- Re-point the "max loss on a credit spread" anchor in
  `what-is-an-options-contract` from `return-on-risk-vs-return-on-capital` to
  `credit-spread-max-loss`. This fixes the mis-pointed anchor and clears the
  orphan in one edit.

**The link map for the first twenty**, written as "must link to" (in-body,
one-directional; the reciprocal is the hub or the auto-generated Read next):

- **The managing cluster** — 1, 4, 10, 11 each link to `/blog/managing`, to
  `credit-spread-max-loss` as the prerequisite that defines the cap, and to
  post 20 once it exists. Post 4 links to post 17 (assignment) and to
  `options-journal-splits-spreads-into-legs` (an assignment splits a position
  into two records). Post 11 links to `options-journal-...` for the same
  reason via partial fills.
- **The foundations cluster** — 2, 3, 8, 17, 18 each link to
  `/blog/foundations` and to `what-is-an-options-contract`. 2 and 3 are a pair
  and link to each other. 3 links to 15 (a single hold, then the sum of them).
- **The income cluster** — 5, 6, 9, 13, 14 each link to `/blog/income` and,
  once it exists, to post 20 as the spine. 6 links to 13 (assignment creates
  the basis) and to `options-journal-...` (premium and shares stay separate
  records). 5 links to `credit-spread-max-loss` and to 15.
- **The measuring cluster** — 7, 15, 16 each link to `/blog/measuring` and to
  `return-on-risk-vs-return-on-capital`. 15 additionally links to 3 and to
  `credit-spread-max-loss`; it is the page that turns one position's number
  into a book's number, so it is the natural bridge between clusters.
- **Cross-cluster spine, deliberately kept thin:** `what-is-an-options-contract`
  → `credit-spread-max-loss` → 15 → `return-on-risk-vs-return-on-capital`. That
  path takes a reader from "what is this" to "what is the product for" in three
  clicks, and every step is a genuine prerequisite rather than a funnel.

**Two things not to do.** Do not add a links block at the foot of every post —
a run of related links with no sentence around them is a footprint, and this
audience reads it as one. And do not link every post to every other post in its
cluster; a hub plus two or three earned links per post is what carries weight,
and more than that dilutes what each link says.

---

## Changes to make elsewhere, once this map is accepted

- `docs/seo/keywords.md` rows 1–20 currently follow syllabus order and list
  head terms as post targets. They need to be re-keyed to this order and these
  target queries, or the daily content run keeps writing to the old brief.
- `content/PLAN.md`'s publication order is the syllabus order. This map does
  not change the syllabus; it changes **which item the daily run takes next**.
  That is the owner's call, not this file's.
- A redirect table in the landing Worker is currently absent. Nothing in this
  map needs one, and that is by design — but it is worth building before any
  future slug decision has to be made under pressure.
