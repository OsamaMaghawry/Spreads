# Content plan — the syllabus

What DeltaMint writes about, in what order, and what has been published.
`content-engine` reads this before writing; the daily pipeline takes the next
unwritten topic in order. Keep it current or the agent works from a stale
brief.

## The change on 2 September

The blog now publishes **one article every day**, as an educational
curriculum that starts at "what is an option" and works through every family
of strategy — income, hedging, investing — before the after-the-fill material
that was the original plan. Beginners are the top of the funnel; a reader who
learns the mechanics here is the reader who later runs more positions than
they can hold in their head. The register does not change: trader to trader,
plain, specific, honest about limits. The compliance rules do not change.

Two pillars still shape every post: **return on risk as the stance** and
**what happens after the fill**. A foundations post about a covered call
still ends by saying what the position looks like the day after assignment.

## Categories

Six, and every post carries exactly one in its front matter (`category:`).
The blog is organised by them: each has a hub page at `/blog/<category>`.

| Slug | Hub title | What lives here |
| --- | --- | --- |
| `foundations` | Options, from the start | Contracts, prices, Greeks, volatility, assignment, margin — the vocabulary everything else uses |
| `income` | Income strategies | Selling premium: covered calls, cash-secured puts, the wheel, credit spreads, condors, calendars |
| `hedging` | Hedging with options | Protecting what you hold: protective puts, collars, spreads as insurance, what volatility products do |
| `investing` | Options for investors | Long-dated positions and stock replacement for people who hold for years |
| `managing` | After the fill | Holding, rolling, adjusting, closing, and the failure of attention at scale |
| `measuring` | Measuring results | What a result is, return on risk, capital at risk, records that mean something |

`series_order` in the front matter is the post's position inside its
category; hub pages list in that order, and "Read next" follows it.

## The syllabus

In publication order. One per day. Each line: topic — the long-tail query it
targets (from `docs/seo/keywords.md`; seo-editor keeps that map).

### Foundations (1–14)

1. What an option actually is — "what is an options contract"
2. Calls and puts, from the buyer's side and the seller's — "call vs put option explained"
3. Strike, expiry and premium — the three numbers on every contract — "option strike price expiration premium"
4. Intrinsic value and time value — "intrinsic vs extrinsic value options"
5. What a bid-ask spread costs you on an option — "options bid ask spread"
6. Delta: what it measures and what people use it for — "option delta explained"
7. Theta: why an option loses value every day — "theta decay explained"
8. Vega and implied volatility — "implied volatility options explained"
9. Gamma, briefly and honestly — "gamma options meaning"
10. Assignment: what actually happens in your account — "option assignment what happens"
11. Exercise, early exercise and why it is rare — "early exercise options"
12. Expiration day mechanics — "what happens options expiration"
13. Buying power, margin and collateral for options — "options buying power requirement"
14. Reading an option chain without guessing — "how to read an option chain"

### Income (15–30)

15. The covered call, mechanically — "covered call explained"
16. The cash-secured put, mechanically — "cash secured put explained"
17. The wheel: put, assignment, call, repeat — "wheel strategy options"
18. What a put credit spread is — "put credit spread explained"
19. What a call credit spread is — "call credit spread explained"
20. The iron condor as two spreads — "iron condor explained"
21. Width: why a $5-wide spread is not five $1-wide spreads — "credit spread width"
22. Choosing a strike by delta — "credit spread delta strike selection"
23. Days to expiry: the trade-off nobody states plainly — "best dte for credit spreads"
24. Earnings and short premium — "selling options before earnings"
25. Calendar spreads — "calendar spread explained"
26. Diagonal spreads — "diagonal spread explained"
27. The poor man's covered call as an income structure — "poor mans covered call"
28. Rolling a short option: what it is and what it is not — "rolling options explained"
29. Covered calls on shares you were assigned — "covered call after assignment"
30. Cost basis on the wheel: adjusted for every premium — "wheel strategy cost basis"

### Hedging (31–40)

31. The protective put — "protective put explained"
32. The collar — "collar option strategy"
33. Put spreads as cheaper insurance — "put spread hedge"
34. Hedging a concentrated stock position — "hedge concentrated stock position options"
35. What VIX products do and do not do — "vix hedge explained"
36. Hedging an income portfolio of short puts — "hedge cash secured puts"
37. Tail risk: the cost of always being hedged — "tail risk hedge cost"
38. When a hedge expires: rolling insurance — "roll protective put"
39. Hedging with index options vs single stock — "spx vs spy options hedge"
40. The married put and the tax framing (with the disclaimer) — "married put tax"

### Investing (41–48)

41. LEAPS, explained — "leaps options explained"
42. Stock replacement with deep calls — "stock replacement strategy options"
43. The poor man's covered call as an investor — "pmcc vs covered call"
44. Selling puts to buy stock you want anyway — "sell puts to buy stock"
45. Buy-writes on long-term holdings — "buy write strategy"
46. Dividends and short calls — "covered call dividend risk assignment"
47. Position sizing for years, not weeks — "leaps position sizing"
48. What a long-dated option's Greeks look like — "leaps delta theta"

### Managing (49–58) — the original pillar 2

49. Twenty open spreads and one afternoon — "managing multiple option positions"
50. A spread is one position, not two legs — "broker shows option legs separately" (published 29 Aug as `options-journal-splits-spreads-into-legs`)
51. What assignment costs, and when it stops being theoretical — "assignment risk credit spread"
52. Closing early vs holding to expiry — "close credit spread early or hold"
53. Managing a short leg that goes through the strike — "credit spread in the money what to do"
54. Adjusting an iron condor — "adjust iron condor"
55. Partial fills and what they do to a spread — "partial fill options spread"
56. Working a limit order: price walking — "options limit order not filling"
57. Watching a book: what to alert on — "options position alerts"
58. The naked short call you did not know you had — "naked call risk"

### Measuring (59–65) — the original pillar 1

59. Return on risk vs return on capital — (published 29 Aug as `return-on-risk-vs-return-on-capital`)
60. What a closed-position record has to contain — "options trade record realized pl"
61. Peak concurrent collateral — "capital at risk options portfolio"
62. Win rate is not a result — "options win rate misleading"
63. Credit captured: held vs closed early — "premium capture credit spreads"
64. Annualised returns on small samples — "annualized return options small sample"
65. Reading the chain is not the hard part — "options screener limitations"

## Rules a writer keeps hitting

Full list in `docs/context/compliance.md`; these are the ones that bite:

- Explaining how a structure behaves is fine. Suggesting anyone put one on is
  not. "Here is what a covered call does" — yes. "Sell covered calls on your
  Apple shares" — no.
- No return figures, real or illustrative, and nothing "typical". Hypothetical
  numbers are for mechanics, never for outcome.
- The broker is not named unless the post is genuinely about the integration.
- No feature that does not exist. Automation is **not built**. The wheel's
  scanner and order placement are on staging as of 2 Sep; say "the wheel"
  only once they are live.
- Every post ends with a plain line saying it is not investment advice.
- Every post links to its category hub and to at least one earlier post it
  builds on; the earlier post gets a "Read next" back to it.

## Published

| Date | Slug | Category · order | Notes |
| --- | --- | --- | --- |
| 2026-08-29 | `return-on-risk-vs-return-on-capital` | measuring · 59 | live |
| 2026-08-29 | `options-journal-splits-spreads-into-legs` | managing · 50 | live |
| 2026-09-02 | `credit-spread-max-loss` | managing · 48 | on staging. Rewritten 2 Sep from a 150-word stub; desk-editor, investment-analyst, seo-editor and compliance-gate findings applied |
| 2026-09-05 | `what-is-an-options-contract` | foundations · 1 | draft, `draft: true`. Targets "what is an options contract"; angle is what the account holds after the fill. seo-editor pass applied (slug, two headings, meta, tags). desk-editor and compliance-gate still to run |
