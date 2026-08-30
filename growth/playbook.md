# Growth playbook — the words, the channels, the rules

Operational extract of *DeltaMint — Positioning & Value Proposition* (v1.0,
29 Aug 2026, owner: Osama Ahmed). That document is the authority; this file
exists so the growth agents can read their brief from the repo. If the two
disagree, the owner's document wins — flag the conflict, don't resolve it
silently.

## The one-liner, by register

- **Six words:** Options income, with risk in plain sight.
- **One sentence:** Screen credit spreads and condors by return on risk, route
  them in one tap, and see your true account exposure the whole time.
- **Forum-safe, no marketing register:** It groups your broker's fills back
  into the spreads you actually traded, ranks new setups by return on risk
  instead of premium, and tells you when earnings land before expiry.

Forum replies use the forum-safe line or nothing.

## Who it's for — and not

For: the retail trader selling defined-risk premium as income who has outgrown
a spreadsheet. 5–50 positions a month. Thinks in delta, DTE, width, RoR.
Cares about not blowing up more than maximizing any single trade.

Not for: 0DTE scalpers, directional call buyers, backtest-first quants, anyone
wanting signals or picks. Say so — a clear "not for you" makes the "for you"
credible.

## Demand themes (where the threads live)

Both scouted subs: **r/options** and **r/thetagang**.

| Theme | The pain in their words | Our answer |
| --- | --- | --- |
| **A — Spreadsheet fatigue** | "50 trades a month is a ton to punch in manually" · journals that split spreads into legs | You stop typing; it reads the broker's fill history and groups legs into the spread you actually traded |
| **B — True exposure / risk netting** | max-risk arithmetic done by hand in comments; "margin for the widest spread" | Every position and order shows its share of account, warnings at 10/25/50% |
| **C — Burned holding through earnings** | "got burned bad (NVDA last time)" | Every open position and scan result flagged when earnings land before expiry |
| **D — Screener + tracker shopping** | "best 1. screener and best 2. P/L tracker?" — bought as two products | One product: screen by return on risk, trade it, it's already in your book |
| **E — Multi-leg fill friction** | "Why is it so hard to get filled on spreads?" · "If I sell the legs separately would I have a better fill?" | One order, all legs; on the **exit**, the limit walks from your price toward the market and never past it |

## Message map — their words, your response

| Their words | Your response |
| --- | --- |
| "My spreadsheet is a chore / I stopped updating it" | You stop typing. It reads your broker's own fill history and groups the legs into the spread you actually traded. |
| "My journal splits my spread into separate legs" | Spreads are the unit, not legs — including after a roll or a partial close. |
| "I don't know what my real risk is" | Every position and every order shows its share of your account, with warnings at 10 / 25 / 50%. |
| "I got burned holding through earnings" | Every open position and every scan result is flagged when earnings land before expiry. |
| "I can't get filled on spreads" | One order, all legs together; on the exit, the limit walks from your price toward the market — never past it. |
| "Which screener, and which tracker?" | One product. Screen by return on risk, trade it, and it's already in your book. |
| "Is this just another journal?" | Journals tell you what happened. This finds the trade, places it, and sizes it. |
| "Why not just use my broker?" | Brokers show BPR and a chain. Neither tells you what share of your account is at risk, or that earnings land before expiry. |

**Product-fact discipline:** anything stated about the product must match
`docs/product-context.md` and the shipped code. Two that have bitten already:
limit walking is the **exit path only** (entries are a single limit or market
order); end-of-session assignment de-risking is **not built**. Never claim
either until the code says otherwise.

## Vocabulary

**Use:** return on risk · credit kept · max risk · share of account at risk ·
buying power reduction · DTE · short delta · wing width · legged in · rolled ·
defined risk · premium seller · the book · fills

**Avoid:** "AI-powered" · "guaranteed" / "consistent income" · "passive
income" · "signals" / "picks" / "alerts you what to trade" · "beat the
market" · "risk-free" · emoji in a headline · exclamation marks

**Register:** a trader explaining something to another trader. Concrete
numbers, admitted uncertainty, no adjectives doing the work of evidence. This
audience has been marketed at by a thousand scams and has antibodies.

## Objections — the honest answers

- **"You only support Alpaca."** True, and it's the biggest gap. Say the plan,
  don't spin it.
- **"Wingman already groups and supports five brokers."** Correct. Wingman is
  a journal — it records what you did. DeltaMint finds the trade, routes it,
  and manages exposure. If someone only wants a diary, Wingman is a fine
  answer — saying so buys credibility for the rest.
- **"Why would I trust software with my account?"** You shouldn't, initially.
  Paper is free for as long as you want.
- **"Are you a broker? Is this advice?"** Neither. Software. Trades go through
  your own brokerage account under that broker's terms; you set every
  parameter; nothing is a recommendation.

## Claims discipline (non-negotiable)

- Never publish performance claims — no "users average X%", no backtested
  returns implied as achievable.
- Never present annualized returns on small samples.
- Label illustrative figures as illustrative, everywhere.
- Round or anonymize any real account figure.
- Educational, not advisory: "traders commonly use 15–20 delta short strikes"
  is fine; "sell 15 delta" is not.
- The disclaimer rides on every page and post: software tool, not a
  broker-dealer, no investment advice, substantial risk of loss.

Full enforcement lives in `docs/context/compliance.md` and
`scripts/content-check.mjs`; the `compliance-gate` agent judges what patterns
cannot.
