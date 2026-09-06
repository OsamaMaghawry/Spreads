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
| 1 | What an option actually is | what is an options contract (mixed intent — see reading, 6 Sep) | options | contract-law pages (Cornell LII, FindLaw, LawInsider) share page one with Option Alpha, StoneX; broker hubs own the "in stocks" variant | the four account lines after the fill — cash, position row, cost basis of record, collateral — not a definition |
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

Rows 21–65 are added by the Wednesday run as their turn approaches.

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

## Reading for post 1 — what is an options contract (read 6 Sep 2026)

Results pages read that day, not measured. No rank tracker, no volume tool,
no Search Console: this records **which domains surface**, not positions and
not demand size.

| Phrasing | What surfaces | Read as |
| --- | --- | --- |
| what is an options contract | Cornell LII, FindLaw, LawInsider, a state statute — then Option Alpha, StoneX, InvestingAnswers | **hard, and half of it is the wrong intent** — see the ambiguity note below |
| what is an options contract in stocks / for beginners | SoFi, Ally, Yahoo Finance, LuxAlgo | hard-ish; disambiguated but owned by money-site education hubs |
| how does an options contract work (example, 100 shares) | tastytrade, Schwab, Desjardins, Longbridge, TradingView chart ideas padding the tail | hard-ish head; the tail padding says the long form is thin |
| how much does one options contract cost / contract multiplier | optionstrading.org, optionspilot.app, Longbridge, protraderdashboard, Zacks, Option Alpha | **winnable** — small affiliate and app blogs, no authority page |
| cost basis of an option premium plus commission | QuantWheel, SmartAsset, budgeting.thenest.com, great-option-trading-strategies.com | **winnable** — thin and old; note QuantWheel is a named competitor |
| does buying a call reduce buying power / hold collateral | a DeFi protocol's research page, Quora, a broker help-centre article, TradingView chart ideas | **winnable**, and the ranked answers disagree with each other |
| what do you actually own when you buy an option | TradingView chart-idea pages, the same one in ten locales | **wide open** — nothing is answering it in text |

**The ambiguity.** Unqualified, "option contract" is a contract-law doctrine
(an offer held open for consideration), and half of page one is legal
reference. Same shape as M48's "credit spread risk" meaning bond spreads. The
consequence is not to drop the phrase — it is the topic and the slug — but
that the title, first paragraph and headings must carry finance tokens
(right/obligation, 100 shares, premium, account) early enough that neither a
searcher nor a crawler has to guess which contract is meant.

**The gap.** Every finance page that ranks stops in the same place: right not
obligation, premium × 100, one P/L example. None of them says what the fill
leaves behind — the cash debit, a position row that is not a share, the cost
basis of record including commission, and whether anything is held as
collateral. That gap is the angle the title and meta carry.

**Could not establish:** volume, difficulty and positions for every phrasing
above; whether these results are personalised or localised; and whether the
"what do you actually own" intent has a phrasing with real demand behind it
or is simply an unasked question.
