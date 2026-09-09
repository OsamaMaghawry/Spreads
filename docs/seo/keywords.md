# Keyword map

Owned by `seo-editor`; updated every Wednesday from Search Console (once
connected) and from reading the results pages. The daily content run reads
the row for its topic before writing.

Rules: a three-month-old domain does not rank for a head term owned by
Investopedia or a broker's education hub. Every post targets **one long-tail
query** in its title and first paragraph; the head term belongs to the
category hub page. "Competing" is who holds page one today, read from the
results, not a metric. Never dress reading a results page up as volume data.

| # | Topic | Target query (long tail) | Head term (hub) | Competing today | Our angle |
| --- | --- | --- | --- | --- | --- |
| 1 | What an option actually is | what is an options contract | options | Investopedia, broker education hubs | what is in your account after the fill, not a definition |
| 2 | Calls and puts | call vs put option explained | call option, put option | Investopedia, NerdWallet | both sides of the same contract, seller included |
| 3 | Strike, expiry, premium | option strike price expiration premium | strike price | Investopedia | the three numbers on one real-looking chain row |
| 4 | Intrinsic and time value | intrinsic vs extrinsic value options | time value | Investopedia, tastylive | why the same strike costs different amounts on different days |
| 5 | Bid-ask on options | options bid ask spread | bid ask spread | forums, broker pages | what the spread costs a seller at the executable price |
| 6 | Delta | option delta explained | delta | Investopedia, OIC | what people use it for: strike selection, not a formula |
| 7 | Theta | theta decay explained | theta | tastylive, Investopedia | what decay looks like on a short and a long the same week |
| 8 | Vega and IV | implied volatility options explained | implied volatility | Investopedia, CBOE | why a chain reprices before earnings |
| 9 | Gamma | gamma options meaning | gamma | Investopedia | short, honest, when it matters and when it does not |
| 10 | Assignment | option assignment what happens | assignment | broker help pages, Reddit | the account the morning after, line by line |
| 11 | Early exercise | early exercise options | exercise | Investopedia, forums | why it is rare and the one case it is not |
| 12 | Expiration mechanics | what happens options expiration | expiration | broker help pages | ITM by a cent, OTM by a cent, the cutoff |
| 13 | Buying power | options buying power requirement | buying power | broker help pages, Reddit | what a CSP and a spread each hold in reserve |
| 14 | Reading a chain | how to read an option chain | option chain | Investopedia, broker pages | reading without guessing the spot |
| 15 | Covered call | covered call explained | covered call | Investopedia, Fidelity, Schwab | mechanics, then the day after assignment |
| 16 | Cash-secured put | cash secured put explained | cash secured put | Investopedia, Fidelity | what "secured" means in a margin account |
| 17 | The wheel | wheel strategy options | wheel strategy | Reddit, YouTube, QuantWheel | the cost basis after each turn |
| 18 | Put credit spread | put credit spread explained | credit spread | tastylive, Investopedia | width, credit and the executable price |
| 19 | Call credit spread | call credit spread explained | credit spread | tastylive | the mirror, and what is different about upside |
| 20 | Iron condor | iron condor explained | iron condor | Investopedia, tastylive, OptionStrat | two spreads, one risk, per-side netting |
| M48 | What a credit spread actually risks | credit spread max loss before expiration | credit spread max loss | tastytrade (short put vertical), moomoo, Schwab, broker learn hubs; TradingView chart-idea pages padding the tail | max loss is the expiration number — what the collateral holds, what the mark does, and what assignment changes in between |
| 21 | Width: why a $5-wide spread is not five $1-wide spreads | $1 vs $5 wide credit spread | credit spread | optionalpha, theoptionpremium, aeromir, steadyoptions, a YouTube video; plus bond-market contamination on the bare phrase (CME OpenMarkets, finchtrade, TradingView) | the same credit on two widths holds different collateral — width prices the buying power, not the credit |
| 22 | Choosing a strike by delta | credit spread delta strike selection | credit spread / delta | optionstradingiq, theoptionpremium, creditspread.net, datadrivenoptions, journalplus, daystoexpiry, strike.money | delta read as a rough standing probability for strike selection, not a "sweet spot" table to copy |
| 23 | Days to expiry: the trade-off nobody states plainly | best dte for credit spreads | DTE | daystoexpiry, datadrivenoptions, advancedautotrades, YouTube/TradingView; theoptionpremium, coveredge, optionspilot on the theta/gamma variant | theta gets faster and gamma gets meaner on the same curve — the mechanism, not a "best" number |
| 24 | Earnings and short premium | selling options before earnings | earnings / implied volatility | Fidelity, Schwab, optionalpha, optionsamurai, Yahoo Finance, Barchart; optionalpha, spotgamma, optionstradingiq on IV crush | what an earnings date does to IV on a short-premium position already open and spanning it |
| 25 | Calendar spreads | calendar spread explained | calendar spread | Wikipedia, Fidelity, CME, optionalpha, alpaca.markets, optionsplaybook, tradingblock, NCSU | same strike, two expirations — the handoff week when the front leg leaves and something is still open |
| 26 | Diagonal spreads | diagonal spread explained | diagonal spread | optionalpha, SoFi, TradeStation, Wikipedia, Nasdaq glossary, optionsplaybook, tradingblock, stockgro | a calendar that also moved the strike — the one change and what it does to collateral and shape |
| 27 | The poor man's covered call as an income structure | poor mans covered call | poor man's covered call | optionalpha, strike.money, IG, moomoo, tradingblock, TradeStation, optionsamurai, marketbeat, a skeptical Medium post; tastytrade/Fidelity own the adjacent "long call diagonal" | the long call standing in for the shares — what it costs and how it can break, not the capital-saving pitch |
| 28 | Rolling a short option: what it is and what it is not | rolling options explained | rolling | Britannica Money, Saxo, Robinhood, Wealthsimple, TradeStation, optionalpha, options.cafe | a roll is a close plus a new open — the old trade is realised, not extended |
| 29 | Covered calls on shares you were assigned | covered call after assignment | covered call / wheel strategy | SpotGamma, quantwheel, VectorVest, cashflowmachine, optionstradingiq, a forum thread, a Substack comments page, Blue Collar Investor — no Investopedia, no big broker | the put-assignment-to-covered-call handoff, and the strike-vs-basis bind when the stock sits below it |
| 30 | Cost basis on the wheel: adjusted for every premium | wheel strategy cost basis | wheel strategy | an entirely commercial SERP of tracking products — quantwheel, optionwheeltracker, gammaledger, optionwheellogic, tradingoptionscashflow, marketxls, thewheelstrategy.com | the basis compounded across every turn — put credit, assignment, every call credit, every roll — not the one-cycle formula |

Rows 31–65 are added by the Wednesday run as their turn approaches.

## Off-syllabus rows

`M48` is not a syllabus number. That post is not in the numbered list in
`content/PLAN.md`; it is `managing` / `series_order: 48`, so the row is keyed
by category and series order instead. Any future off-syllabus post gets the
same treatment rather than a made-up integer that collides with the syllabus.

## Reading for M48 — credit spread max loss (read 2 Sep 2026)

Results pages read that day, not measured. There is no rank tracker, no
volume tool and no Search Console connection here, so this records **which
domains surface**, not positions and not demand size.

| Phrasing | What surfaces | Read as |
| --- | --- | --- |
| credit spread max loss | Schwab, moomoo, Nasdaq, broker learn hubs | **hard** — head-ish; belongs to the `income` hub, not a post |
| how much can you lose on a credit spread | Schwab (twice), moomoo, Nasdaq, OptionsPlay, small affiliate blogs | hard-ish; every result stops at the formula |
| credit spread max loss before expiration | tastytrade short-put-vertical page, moomoo, a broker learn page, then TradingView chart ideas | **winnable** — chart-idea pages in the tail means nothing is answering it |
| can you lose more than max loss on a credit spread | a YouTube video, moomoo, Schwab, two small affiliate blogs | **winnable** — a video ranking is a text-coverage gap |
| why is my credit spread showing a loss before expiration | Quora, Fidelity, tastytrade support article | **winnable** — forum ranking is winnable intent |
| credit spread collateral / buying power held until expiration | Quora, a broker help-centre article, Wikipedia | **winnable**, thin |
| credit spread expires between the strikes | a Medium post, Fidelity, Schaeffer's, Wikipedia | winnable, but this is post 51/52's ground, not M48's |
| credit spread risk (no "options", no "max loss") | wallstreetmojo, risk.net, study.com, peakframeworks — **all fixed income** | **do not target**: the unqualified phrase means bond spreads |

**The gap.** Every page that ranks gives `width − credit` and stops at
expiration. None of them says the collateral does not shrink as the position
wins, that the mark before expiration can sit well past the credit against
you, or that assignment leaves the cap intact while destroying the shape of
the position. That gap is the angle the title and meta carry.

**Could not establish:** search volume, difficulty, and current positions for
any phrasing above; whether these results are personalised or localised; and
whether a distinct query exists for "defined risk is less defined than it
looks" — searches for it returned only generic spread explainers, so the post
owns the idea but there is no phrasing to target with it.

## Reading for rows 21–30 — income syllabus (read 9 Sep 2026)

Results pages read that day, not measured. No rank tracker, no volume tool,
no Search Console connection — this records which domains surface, not
positions and not demand size.

- **21 (width).** The bare head term `credit spread width` is split by
  fixed-income results (CME OpenMarkets, TradingView LIBOR/OIS charts) the
  same way `credit spread risk` was in the M48 reading — do not title on it.
  `$1 vs $5 wide credit spread` / `how wide should a credit spread be` surface
  a forum thread and a video: winnable.
- **22 (delta strike).** No Investopedia, no broker hub on page one — thin
  affiliate SERP (optionstradingiq, theoptionpremium, creditspread.net).
  Every ranking page hands out a prescriptive delta table with POP/ROC
  figures; that's the gap, not the phrasing.
- **23 (DTE).** Page one answers "45" citing the tastytrade backtest and
  stops; nobody states the mechanism. A video ranks on the head phrasing —
  text-coverage gap. `theta vs gamma as expiration approaches` is the winnable
  variant.
- **24 (earnings).** Head phrasing is hard — Fidelity Viewpoints and Schwab
  Learn both rank. The SERP splits into "harvest IV crush" and "close before
  earnings"; nothing covers noticing earnings inside a position already open.
  Target `holding a credit spread through earnings` instead.
- **25/26 (calendar, diagonal).** Both hard head terms — Wikipedia, Fidelity,
  CME on 25; SoFi, TradeStation, Wikipedia, Nasdaq on 26. Comparison pages
  assert "calendar = neutral, diagonal = directional" without showing the
  single edit (same strike vs. moved strike) that turns one into the other —
  that's the angle for both, and the reason they stay two posts rather than
  one (see "could not establish" below).
- **27 (PMCC).** Commercially crowded (optionalpha, IG, moomoo, marketbeat)
  but no Investopedia lock. A skeptical Medium post ranking is the tell that
  the risk side — the long call itself can be the thing that breaks — is
  under-served against the capital-saving pitch every other page runs.
- **28 (rolling).** Britannica Money and two broker support pages hold the
  head term. The close-realizes-a-result point only surfaces in tax articles,
  not in trading explainers. `is rolling an option closing the trade` is
  winnable.
- **29 (covered call after assignment).** No Investopedia, no big broker — a
  forum thread and a Substack comments page rank. Most winnable of the ten:
  pages cover assignment *on* a covered call, not the put-assignment-into-a-
  covered-call handoff this post targets.
- **30 (wheel cost basis).** The SERP here is direct tracking-tool
  competitors (quantwheel, optionwheeltracker, gammaledger, marketxls,
  thewheelstrategy.com), not publishers — everyone states the one-cycle
  formula, nobody carries it across multiple turns with rolls in between.

**Chosen not to optimize for, on purpose:**

- **23** — will not title or head this "the best DTE is 45." That borrows a
  performance claim from someone else's backtest; forbidden under
  `docs/context/compliance.md` and the playbook's claims discipline regardless
  of how well it would rank.
- **22** — no "sell 0.20 delta" imperative in the title or an H2, despite
  every ranking page doing it. The playbook's own line — "traders commonly
  use 15–20 delta short strikes" — is descriptive; the imperative is not, and
  every SERP winner right now is the imperative.
- **24** — will not frame this as an earnings *play* or an IV-crush edge, even
  though that phrasing owns the SERP. Demand theme C (`growth/playbook.md`) is
  "got burned holding through earnings" — selling the trade would break
  register with the exact reader this targets.
- **27** — no capital-saving percentages or ROC-vs-covered-call comparison in
  title or meta. Those are the numbers the affiliate pages rank with, and on
  this audience they read as a pitch, not an explanation.
- **28 / 30** — tax treatment (wash sales, basis adjustment under IRS rules)
  ranks well on both phrasings and is being left alone. Tax framing is
  advice-adjacent territory a software tool should not assert into; a married
  put's tax post (syllabus #40) already carries the one disclaimed exception.

**Could not establish:** search volume, keyword difficulty, CPC or current
ranking positions for any phrasing above; whether results were personalised
or localised to this session; how much of any SERP was paid or
freshness-boosted; and whether 25 and 26 have distinct enough query space to
stay two posts — the phrasings overlap heavily and nothing in the results
settled it either way, so the syllabus split is being kept as written rather
than merged on a guess.
