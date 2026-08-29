# Content plan

What DeltaMint writes about, why those things and not others, and what has been
published. `content-engine` reads this before writing; keep it current or the
agent works from a stale brief.

## The angle, and why it is the only defensible one

`docs/context/positioning.md`, scored against public evidence rather than
effort: competitors are strong from **screen to fill** and weak immediately
after it. Screening, chain filtering and pre-trade return on risk are commodity
— Barchart alone gives away around ten multi-leg screeners free, Market
Chameleon covers eighteen spread types — so a post that leads with finding
trades is undifferentiated *and* falsifiable in one search.

What survives scrutiny: the structural, portfolio-level view of many concurrent
positions — legs paired by order provenance, statistics computed against peak
concurrent collateral. No competitor's own documentation contradicts it.

**So every post is about what happens after the fill.** Holding, managing,
measuring, exiting. Write for someone already running more spreads than they can
hold in their head, not for someone deciding whether options are for them.

## Topics

Ordered by how directly each demonstrates the claim above.

1. **Twenty open spreads and one afternoon** — what actually breaks when
   position count outgrows attention. The failure is not analysis, it is
   noticing. Per-trade tools never feel this because they are per trade.
2. **What assignment costs, and when it stops being theoretical** — how
   assignment settles mechanically, what arrives in the account, and why the
   option's premium and the shares' result are two different numbers that most
   tools add together.
3. **A spread is one position, not two legs** — pairing by order provenance
   rather than guessing from strikes, and what goes wrong when a tool guesses:
   invented spreads, orphaned shorts, dropped costs.
4. **What a closed-position record has to contain** — premium, the cost of
   closing early, and the result of any shares that came from an assignment,
   kept separate. A single realised figure hides which of the three moved.
5. **Peak concurrent collateral** — why return on an average balance flatters a
   strategy that occasionally has everything at risk at once.
6. **Reading the chain is not the hard part** — the honest version of the
   commodity argument, said plainly rather than avoided. Establishes credibility
   by conceding what is freely available.

## Rules a writer keeps hitting

Full list in `docs/context/compliance.md`; these are the ones that bite:

- Explaining how a structure behaves is fine. Suggesting anyone put one on is
  not.
- No return figures, real or illustrative, and nothing "typical". Hypothetical
  numbers are for mechanics, never for outcome.
- The broker is not named unless the post is genuinely about the integration.
- No feature that does not exist. End-of-session de-risking is **not built**.
- Every post ends with a plain line saying it is not investment advice.

## Published

Nothing yet. `blog_posts` is empty on production — the schema, the editor, the
server-rendered Worker and the sitemap all currently serve an empty page.

| Date | Slug | Topic | Notes |
| --- | --- | --- | --- |
| — | — | — | — |
