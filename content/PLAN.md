# Content plan

What DeltaMint writes about, why those things and not others, and what has been
published. `content-engine` reads this before writing; keep it current or the
agent works from a stale brief.

## The angle

Two pillars, from the owner's positioning document (v1.0, 29 Aug 2026 —
operational extract in `growth/playbook.md`):

**1. Return on risk as the stance.** Ranking setups by return on risk rather
than premium collected is a philosophy, not a sort order, and it is the thing
the content strategy exists to teach (§5.6 of the positioning doc). Premium
flatters wide, risky structures; credit against max loss compares them
honestly.

**2. What happens after the fill.** Holding, managing, measuring, exiting —
the half of the trade lifecycle competitors are weak at. The structural,
portfolio-level view of many concurrent positions: legs paired by order
provenance, statistics computed against peak concurrent collateral.

Write for someone already running more spreads than they can hold in their
head, not for someone deciding whether options are for them. Each post should
answer a question people actually ask in r/options and r/thetagang — the
demand themes in `growth/playbook.md` — so queue replies have something
substantive to link.

## Topics

Ordered by how directly each demonstrates the claims above.

0. **Return on risk vs return on capital** — the pillar-1 piece. Why premium
   collected is the wrong ranking, what return on risk actually measures, and
   how the same dollar of credit looks on a $1-wide and a $5-wide spread.
   Educational mechanics only; hypothetical numbers for structure, never for
   outcome.
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

Nothing is live yet. `blog_posts` is empty on production — the schema, the
editor, the server-rendered Worker and the sitemap all currently serve an empty
page. The rows below are drafts in `content/blog/`; publishing is a person's
decision, not the writer's.

| Date | Slug | Topic | Notes |
| --- | --- | --- | --- |
| 2026-08-29 | `return-on-risk-vs-return-on-capital` | 0 — Return on risk vs return on capital | draft — awaiting review |
| 2026-08-29 | `a-spread-is-one-position-not-two-legs` | 3 — A spread is one position, not two legs | draft — awaiting review |
