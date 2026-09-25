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
they can hold in their head. The register CHANGED on 9 Sep: the blog is
written in the Investopedia shape — definition first, Key Takeaways, plain
question headings, one worked example, FAQ, 900-1,200 words. See
`docs/context/brand.md`. The compliance rules do not change.

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
| 2026-09-09 | `call-vs-put-option-explained` | foundations · 2 | draft. Options 101 shape: definition first sentence, key takeaways, question headings, worked example, FAQ, bottom line. Unreviewed — desk-editor, seo-editor, compliance-gate all outstanding |
| 2026-09-09 | `option-strike-price-expiration-premium` | foundations · 3 | draft, same shape. Unreviewed — desk-editor, seo-editor, compliance-gate all outstanding |
| 2026-09-09 | `intrinsic-vs-extrinsic-value-options` | foundations · 4 | draft, same shape. Unreviewed — desk-editor, seo-editor, compliance-gate all outstanding |
| 2026-09-11 | `options-bid-ask-spread` | foundations · 5 | draft, same Investopedia shape. Reviewed — desk-editor (3 blocking arithmetic/mechanics findings fixed: Key Takeaways money-flow direction, "paid twice" exception on expiry/assignment, order-book-per-exchange overstatement; cautions applied), seo-editor (title, meta description, one H2 and one FAQ line changed to match the query-space study; added a "Read next" style inbound link from `credit-spread-max-loss`), compliance-gate (no findings, ship). `npm run content:check` clean |
| 2026-09-11 | `options-bid-ask-spread` | foundations · 5 | fresh draft, same shape. One SVG (`bid-ask-executable-price`) plus two tables. Unreviewed — awaiting desk-editor, then seo-editor, then compliance-gate |
| 2026-09-12 | `option-delta-explained` | foundations · 6 | draft, same Investopedia shape. One SVG (`delta-across-moneyness`) plus two tables, worked example at three stock prices. Reviewed — seo-editor (title/meta tightened, one H2 reworded to match the query-space study, one anchor and one FAQ line added; reading recorded in `docs/seo/keywords.md`), desk-editor (re-derived the worked example's deltas against a Black-Scholes fit and found them consistent with the sibling posts' own numbers; one non-blocking wording fix applied for the put-delta sign convention), compliance-gate (no findings, ship). `npm run content:check` clean. Also updated `options-bid-ask-spread`'s closing paragraph with a "Read next" link forward to this post — re-reviewed by all three gates alongside it |
| 2026-09-13 | `theta-decay-explained` | foundations · 7 | Investopedia shape, two original SVGs (`theta-decay-by-dte`, `theta-long-vs-short`) plus two tables, worked example across four DTE points on one hypothetical at-the-money call, both sides of the same fill shown on the same day. Reviewed — desk-editor (six blocking findings: the decay table implied a shifting IV across DTEs, contradicting the ~40% IV the same 50-strike call already carries in `option-delta-explained` and `intrinsic-vs-extrinsic-value-options`; the "roughly doubles" arithmetic was wrong against the table and against a Black-Scholes fit; the acceleration claim was unqualified and false for out-of-the-money strikes; one SVG's alt text claimed acceleration its even-spaced bars couldn't show — table recomputed to $3/$4/$6/$8, both SVGs regenerated, prose rescoped to at-the-money with an OTM contrast added, sign-convention wording softened to match the FAQ's own hedge), seo-editor (meta_description rewritten to carry the "theta decay" phrase; "time decay" named once in body as the dominant ranking synonym; two headings and one FAQ bullet reworded to match searched phrasing; added a link to `options-bid-ask-spread` on first mention and a reciprocal back-link from `intrinsic-vs-extrinsic-value-options`; corrected row 7's competing-domains and head-term cells in `docs/seo/keywords.md` against today's read — the unqualified head term "theta" surfaces Theta Network crypto pages, so the hub targets "option theta" instead), compliance-gate (no findings, ship). `npm run content:check` clean. Also updated `option-delta-explained`'s closing paragraph with a "Read next" link forward to this post |
| 2026-09-14 | `implied-volatility-options-explained` | foundations · 8 | Investopedia shape, one original SVG (`iv-reprices-the-chain`, three strikes at two IV levels) plus two tables, worked example pricing one hypothetical 30-day chain at 40% and 60% IV. Reviewed — desk-editor (two blocking findings fixed: "a premium that changes while the stock stands still is an IV change" ignored theta and contradicted `theta-decay-explained`'s own worked example, now scoped to the stock and the calendar both standing still; the Key Takeaways line generalised "far-from-the-money strikes move more in proportion" to deep in-the-money strikes, which the post's own table disproved — reworded to split OTM from ITM; recomputed every price and vega figure against a Black-Scholes fit and confirmed them consistent with the ~40% IV the same hypothetical 50-strike series already carries in `option-delta-explained` and `theta-decay-explained`; three cautions also softened), seo-editor (title and meta description retargeted from the exact-match head phrase, already held by Fidelity/OIC/Schwab, toward the winnable "why premiums move when the stock doesn't" and "before earnings" intent; two headings reworded to searched phrasing; "IV crush" named alongside "volatility crush"; row 8 query-space study added to `docs/seo/keywords.md`; added the reciprocal forward link from `theta-decay-explained`), compliance-gate (no findings, ship). `npm run content:check` clean |
| 2026-09-20 | `gamma-options-meaning` | foundations · 9 | Same shape, two original SVGs (`gamma-across-moneyness`, `gamma-by-dte`) plus three tables, worked example estimating the delta swing from one $1 move at 60 and 7 days to expiration on the same hypothetical 50-strike at-the-money call used by the delta/theta/IV posts. Reviewed — desk-editor (three blocking findings fixed: the vertical-spread claim that net gamma is "smaller than either leg's alone" was false for wide spreads, reworded to "smaller than the short leg's alone"; "gamma does not get its own line item... on most account summaries" was contradicted by thinkorswim and tastytrade's own position screens, reworded to describe attention rather than availability; "barely changes either figure" for the far-OTM row contradicted the post's own table, reworded and the false OTM/ITM symmetry removed; every gamma, delta and DTE figure in both tables and both SVGs re-derived against a Black-Scholes fit and confirmed consistent with the same 40% IV the delta/theta/IV posts already carry; six cautions also applied — see the desk-editor findings for detail), seo-editor (title retargeted to "Option gamma explained..." since "gamma" unqualified surfaces a dictionary entry and the gamma-squeeze trade rather than options content; slug kept; four headings reworded to searched phrasing; row 9 query-space study added to `docs/seo/keywords.md`, correcting the head term to "option gamma"; added the reciprocal forward link from `implied-volatility-options-explained`), compliance-gate (no findings, ship). `npm run content:check` clean across the repo |
| 2026-09-21 | `option-assignment-what-happens` | foundations · 10 | Investopedia shape, two original SVGs (`assignment-account-line-by-line`, `assignment-put-vs-call`) plus three tables, worked example on one hypothetical cash-secured 50-strike short put assigned overnight — the same 50-strike series the delta/theta/IV/gamma posts use. Covers the OCC's two-stage allocation (random to a clearing firm, then the firm's own disclosed method — random or FIFO), partial assignment, exercise by exception at a cent in the money, and what changes in the account line by line. No product claims made. Reviewed — desk-editor (three blocking findings fixed: the worked example wrongly claimed the 50-strike series had already used a put — it hadn't, only calls, so the attribution was corrected while the $1.40 itself checked out against put-call parity on the series' own established call price; the account-ledger SVG's cash "after" cell read as a −$5,000 balance instead of the $0 the flow actually leaves, fixed in the SVG and its caption; "the notice lands in accounts before the next session opens" was stated as invariable, contradicted by the standard OCC/broker assignment disclosure, softened to "usually" with the delay named — plus cautions applied: scoped the assigned-short-call-without-shares case to margin accounts, corrected "decision is made" to "can be made", replaced vague cutoff language with the actual 5:30pm ET member deadline, flagged the worked example's early exercise as the less common case, reworded "$5,000 stock position" to "cost $5,000", hedged cash-account margin language, broadened "account agreement" to the firm's written disclosure generally, noted brokers commonly net the premium against CSP collateral, and labelled the strike on the put-vs-call SVG's face), seo-editor (row 10 query-space study added to `docs/seo/keywords.md`, correcting the head term to "option assignment" and the competing-domains cell; meta description and the opening bold phrase requalified from the bare "assignment" to "option assignment"; one FAQ bullet added on buying-power release, a winnable unoccupied intent already covered in prose; added reciprocal backlinks from `credit-spread-max-loss` and `call-vs-put-option-explained`, tightening the latter's OCC-allocation sentence to match this post's two-stage account), compliance-gate (no findings, ship — both SVGs read as label-only with no broker name, no performance claim, no guarantee). `npm run content:check` clean across the repo. Also linked forward from `gamma-options-meaning`'s bottom line, and backward from `credit-spread-max-loss` and `call-vs-put-option-explained` |
| 2026-09-22 | `early-exercise-options` | foundations · 11 | Investopedia shape, two original SVGs (`exercise-forfeits-extrinsic`, `dividend-crosses-extrinsic`) plus two tables, worked example on the same hypothetical 50-strike call this series has been using (stock at $56, 30 days left, $6.70 premium = $6.00 intrinsic + $0.70 extrinsic, from `intrinsic-vs-extrinsic-value-options`), tested against a hypothetical $1.00 ex-dividend. Covers American vs European exercise, why exercising forfeits extrinsic value that selling keeps, the call's dividend-capture case (dividend must exceed remaining extrinsic value, timed the day before the ex-date), and the rarer put case (interest on strike proceeds received sooner). No product claims made. Reviewed — desk-editor (three blocking findings fixed: a "worthless option has nothing to give up" bullet actually described a deep in-the-money contract at parity, relabelled; a call bullet double-counted the call's downside protection as a cost on top of extrinsic value when it is most of what that extrinsic value is made of, reworded; the FAQ claim that selling "always" locks in at least as much as exercising ignored that a thin, deep ITM contract can quote a bid below intrinsic value, qualified — plus cautions applied: converted the worked example to per-contract dollars and named the funding cost the dividend edge has to clear, corrected and then dropped a misattributed hard-to-borrow clause from the put case, noted holders routinely fail to exercise even when it is optimal rather than implying the opportunity itself is rare, softened "genuinely unlikely" to "uncommon" for a short seller's residual exposure, relabelled the exercise-forfeits SVG so both dollar figures sit on the bar they describe), seo-editor (row 11's placeholder query-space study was wrong on both cells — replaced with a fresh 11-phrasing read in `docs/seo/keywords.md` correcting the head term and competing-domains cells, since "early exercise" alone splits toward employee-equity content rather than listed options; title retargeted to "Early exercise of options: rare, except before a dividend"; meta description rewritten around extrinsic value and the ex-dividend trigger; opening sentence requalified to "listed American-style stock options"; four headings reworded to searched phrasing), compliance-gate (no findings, ship — no broker name, no performance claim, no guarantee, disclaimer present, both SVGs label-only). `npm run content:check` clean across the repo. Also linked forward from `option-assignment-what-happens`'s bottom line |
| 2026-09-23 | `what-happens-options-expiration` | foundations · 12 | Investopedia shape, two original SVGs (`expiration-cent-either-side`, `expiration-legs-split`) plus one table, worked example on the same hypothetical 50/48 put credit spread series at five closing prices ($51.00, $50.01, $50.00, $49.99, $47.50), showing each leg settled independently against its own strike. Covers OCC exercise-by-exception at $0.01 in the money (with the note that a brokerage may apply its own higher threshold), the do-not-exercise contrary instruction and the FINRA 5:30pm ET cutoff (a broker's own cutoff for retail customers is commonly earlier), why a spread's two legs do not net against each other at expiration (the between-the-strikes case that leaves shares with no protective leg), and pin risk when the stock closes at or within pennies of a short strike. No product claims made. Reviewed — desk-editor (three blocking findings fixed on the first pass: an SVG axis label read "put closing price" instead of "stock closing price", also wrong in the post's own image alt text and fixed there on a second confirmation pass; a pin-risk bullet said the long leg "expires either way" when its own holder can still file a contrary instruction up to the cutoff, reworded; the $47.50 worked-example row called the $200 net debit itself "the defined maximum loss" without netting the credit received, corrected — plus cautions applied: "$5,000 worth of shares" reworded to "100 shares that cost $5,000" to avoid implying the shares are worth $5,000 at a $49.99 close, "not the OCC's" corrected to "not the 5:30 rule's" since the 5:30pm cutoff is a FINRA rule rather than the OCC's, added that a brokerage may apply its own exercise threshold above the OCC's $0.01, "the OCC rule is the floor" reworded to "the default" since a broker's own rule is not necessarily stricter, and the FAQ's index-option answer split out ETF options like SPY which still deliver shares rather than settling in cash), seo-editor (row 12's placeholder query-space study replaced with a fresh 13-phrasing read in `docs/seo/keywords.md`, correcting the head term to "options expiration — never 'expiration' alone" since the bare word surfaces food/drug-label and dictionary results, the same correction rows 7, 9, 10 and 11 needed; title tightened to "What happens at options expiration: a cent either side"; four headings reworded to searched phrasing, including the pin-risk section and a FAQ line; added outbound links to `credit-spread-max-loss` and `option-strike-price-expiration-premium`; added the required reciprocal forward link from `early-exercise-options`'s bottom line, which already teed up this exact post, plus a link from `credit-spread-max-loss`'s between-the-strikes paragraph), compliance-gate (no findings, ship — no broker named, no performance claim, no guarantee, worked example explicitly hypothetical throughout, disclaimer present, both edited inbound-link sentences link-only with no new claims). `npm run content:check` clean across the repo (19 files). Also linked forward from `early-exercise-options` and `credit-spread-max-loss` |
| 2026-09-24 | `options-buying-power-requirement` | foundations · 13 | Investopedia shape, two original SVGs (`buying-power-put-vs-spread`, `buying-power-hold-flat`) plus one table, worked example on one hypothetical $10,000 margin account short the same 50 put two ways: cash-secured ($1.40 premium, $5,000 reserved, net reduction $4,860) and as a 50/48 put credit spread ($0.60 credit, $200 reserved, net reduction $140). Covers buying power vs cash balance, working-order reservations, spread-margin conditions (same account, long leg expiring no earlier than the short), covered-call and naked-option collateral in brief, and what releases the hold (close, expiry, assignment — not the mark, including an in-the-money mark). No product claims made. Reviewed — desk-editor (two blocking findings fixed: the put-vs-spread SVG encoded its two rows differently, gross for the cash-secured put and net-of-premium for the spread, so both rows were redrawn to split into net risk plus the premium offset; the worked example treated a margin account's headline buying power as equal to its cash, reworded throughout to "option buying power" with a note that stock buying power runs higher under Reg T — plus non-blocking cautions applied: the table's covered-call cells, the spread-condition bullet, and a note that the covered call's premium adds to buying power. Arithmetic and both SVGs' proportions re-derived and confirmed correct; the $1.40 put confirmed consistent with the 50-strike call series via put-call parity, the $0.60 spread credit confirmed to sit inside a Black-Scholes fit at the series' own ~40% IV), seo-editor (row 13 query-space study added to `docs/seo/keywords.md`, correcting the head term to "options buying power" and the competing set to broker help centres and content blogs, no Reddit or Investopedia; title shortened to fit the render budget, meta description retargeted to the "what ends the hold" angle, five headings reworded to plain questions matching searched phrasing, opening paragraph now carries the target phrase; dropped the link to the income hub since no income post is published yet, replaced with plain text; added reciprocal backlinks from `option-assignment-what-happens`, `credit-spread-max-loss` and `return-on-risk-vs-return-on-capital`), compliance-gate (no findings, ship — checked the post and all four backlink edits against every compliance rule and the claims-discipline list; no advice, no performance figures, no guarantees, no broker named, disclaimer present). `npm run content:check` clean across the repo (24 clean, 0 failures). Links to `what-happens-options-expiration`, `what-is-an-options-contract`, `credit-spread-max-loss`, `option-assignment-what-happens` and `/blog/foundations`; also linked forward from `what-happens-options-expiration` and backward from `option-assignment-what-happens`, `credit-spread-max-loss` and `return-on-risk-vs-return-on-capital` |
| 2026-09-25 | `how-to-read-an-option-chain` | foundations · 14 | Investopedia shape, two original SVGs (`chain-last-price-stale`, `chain-shading-stale-spot`) plus two tables, one worked example: a hypothetical XYZ chain at $50.00 (strikes 46–54, calls and puts, 30 days), with two last prices that printed at 10:05 when XYZ was $48.50, the 48/50/52 strikes repriced at 58 days, and a 50/48 put spread priced three ways from the same rows (bid/ask 0.81, marks 0.91, lasts 0.36). Prices sit near a Black-Scholes fit at 40% IV and zero rate, so the 50 call's 2.29 mark matches the IV post; the spread's credit differs from the buying-power post's round $0.60 because the stock here is at the strike. Covers the three mis-readings from the row 14 study (stale last, shading keyed to a delayed underlying, the mark as a non-offer), reads OI descriptively only and says so. No product claims made. Reviewed — desk-editor (three blocking findings fixed: the bid/ask key takeaway was stated without the immediate-fill condition; the strike-ordering explanation gave moneyness as the cause when it's the right's own value; the OI sentence claimed OI shows same-day activity, which only volume does — plus cautions applied: stated the zero-rate/no-dividend assumption behind the ATM call-put match, added the complex-order-leg exception to "last outside the quote", softened the single-stock closing-time claim, matched both SVGs' clock labels and the shading caption to the prose; every chain cell, mark and spread credit independently re-derived against Black-Scholes and confirmed to the cent — flagged two pre-existing, non-blocking inconsistencies in `option-strike-price-expiration-premium` and `option-assignment-what-happens`'s own hypothetical figures for a future pass, left unchanged here as out of this post's scope), seo-editor (title, slug and headings confirmed against the row-14 study; promoted "why does the same strike cost more on a later expiration" to its own H2; tightened the meta description; synced the planned title in `docs/seo/keyword-map.md`), compliance-gate (no findings, ship — confirmed no broker named, no performance/advice language, the OI disclaimer genuine and unrepeated, closing disclaimer present). `npm run content:check` clean across the repo. Links `/blog/foundations`, `option-strike-price-expiration-premium`, `options-bid-ask-spread`, `theta-decay-explained`, `implied-volatility-options-explained`, `credit-spread-max-loss`. Inbound links added from `options-buying-power-requirement` (its closing forward reference) and `option-strike-price-expiration-premium` (bottom line) |
