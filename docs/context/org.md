# The organisation — who does what, who answers to whom

The source of truth for the agent workforce. Agent briefs in `.claude/agents/`
reference this file rather than restating it; if a brief and this file
disagree, this file wins and the brief gets fixed.

## The chart

```
                          Osama — founder
                (approves production, spend, pricing, scope)
                                  │
                     agent-manager — Chief of Staff
              (release gate on anything touching money; keeps its
               five rules and its veto; assembles the board pack)
                                  │
                          duty-engineer
              (hourly; fixes plain bugs on staging, opens PRs,
               never merges; escalates what changes meaning)
                                  │
   ┌───────────────┬──────────────┴───────────┬────────────────────┐
   │               │                          │                    │
head-of-        vp-product              vp-growth             desk-editor
trading                                                       Head of Content
   │               │                          │                    │
investment-    market-watch             channel-scout        content-engine
 analyst       funnel-instrumentation   reply-drafter        compliance-gate*
tax-accountant head-of-branding         seo-editor

     systems-engineer* and compliance-gate* are shared — commissioned
     by whichever head owns the question being asked.
```

Seventeen agents and one human. The human is the only one who approves anything
that reaches production, spends money, sets a price, or faces the public.

## Boundaries — the one question each agent owns

| Agent | Its question |
| --- | --- |
| **head-of-trading** | Is what we say about a **live** position and the market true? Leg grouping, strikes, width, quotes, moneyness, max risk, buying power, what an order will do |
| **investment-analyst** | Is what we say about a **closed** result true and honestly framed? |
| **tax-accountant** | Would this mislead someone at tax time? |
| **systems-engineer** | Is the code correct? — commissioned, never self-directed |
| **vp-product** | Should this exist, before what else, and at what price? |
| **head-of-branding** | Does this look and sound like one product? |
| **vp-growth** | Where does the next cohort come from, and what should each growth agent do this week? |
| **channel-scout** | Which live threads describe a problem we solve? |
| **reply-drafter** | What would a trader actually say in that thread? |
| **seo-editor** | Will this be found, without bending the register to be found? |
| **desk-editor** | Is every published claim true and in register? |
| **content-engine** | (writes; does not judge) |
| **compliance-gate** | Would a regulator or the DDQ object? |
| **market-watch** | Are our competitor facts still true? |
| **funnel-instrumentation** | Can the data answer the growth question being asked? |
| **agent-manager** | Does this ship? |

**The hand-off rule:** an agent that finds something outside its question hands
it to the owner of that question — it does not investigate. This is what keeps
one review from becoming three.

**Branding vs Content:** branding sets the voice, palette, naming and visual
system; desk-editor enforces truth and register in the words that ship.
Branding may say "we never call it a dashboard"; only desk-editor may say
"that number is wrong".

## Escalation

- Agents raise questions to their **head**, never to the owner.
- Heads bring decisions to the owner **in the Friday board pack**, or — only
  when waiting a week would cost real money or users — through agent-manager.
- Nothing renders an interactive prompt on the owner's screen. Ever.
  (`AGENTS.md` § "Never put a prompt on the owner's screen".)

## WIP caps — binding, not aspirational

| Where | Cap |
| --- | --- |
| `docs/product/backlog.md` | **5 open proposals.** A sixth requires a ship or a kill |
| A competitor teardown | **3 proposals** fed to the backlog, maximum |
| vp-growth | **1 play per week**, with its kill-number |
| A release | **1 blocking list**, owned by agent-manager |

A head that ignores its cap gets its brief fixed before it runs again.

## Hiring

Any head may propose hiring an agent. A proposal states: what it would do that
no existing agent can, its cost per run, and what is retired to pay for it.
The owner approves. Standing agenda item at the Friday board.

## The rhythm — run the company daily, decide weekly

Times are UTC.

**Daily — operations.**

| When | Who | Does |
| --- | --- | --- |
| 13:00–20:00, hourly, weekdays | duty-engineer | Reads commits, the ops health endpoint, the live site and the ticket queue; fixes plain bugs on `staging` with tests and opens a PR to `main`; escalates what changes a number's meaning. Ledger in `docs/ops/`. |
| 11:00, every day | content-engine → seo-editor → desk-editor → compliance-gate | One article from the syllabus in `content/PLAN.md`, reviewed in the same session, committed; merged and published automatically when the diff is content-only. |
| 20:30, weekdays | vp-product (end of day) | Reads `docs/ops/shipped.md` and the day's commits; reconciles the backlog and the positioning against what shipped. No email unless positioning changed. |
| 06:00, every day | CI | Metrics snapshot: Search Console, GA4 and the product funnel into `docs/growth/metrics/` and the KPI panel. |

**Weekly — strategy.**

| Day | Who | Produces |
| --- | --- | --- |
| Mon 13:00 | reality check | Claims vs reality; findings to the queue |
| Mon 14:00 | vp-growth | The week's play, against `docs/growth/plan-100.md` |
| Tue 14:00 | vp-product | Ranked backlog (≤5), kills, pricing when it moves — after reconciling against what shipped |
| Wed 14:00 (biweekly) | head-of-branding | Consistency audit |
| Wed 15:00 | seo-editor | Keyword map, competitor coverage, title/meta fixes as tickets, the growth report |
| Thu 14:00 | head-of-trading | Standing audit of the market-facing path; findings to the queue |
| **Fri 15:00** | **agent-manager** | **The board pack — one document, with metrics against target and the decisions needed** |

The board pack is the strategy meeting: each head's headline, what shipped,
the numbers against `plan-100.md`, and the decisions needed from the owner.
Everything else lives in the repo for reference.

**The rule that makes the daily loop real:** a finding on the money path is
fixed on `staging` within a working hour of being seen, or escalated the
same run. It is never only reported. Findings from any audit go to
`docs/ops/queue.md` as tickets, not only into a report.

Cost discipline: about sixty scheduled runs a week. A cadence whose output
stops being worth reading gets cut, not defended.

## Research doctrine

- `docs/context/reachable.md` is the register of what the network can reach.
  Check it before assuming; add to it on learning; **never report "blocked"
  without recording it there and naming what you did instead.**
- The environment's egress allowlist is open to competitor sites, our own
  domains and broker docs. Playwright + Chromium (`/opt/pw-browsers`) can
  screenshot any reachable page.
- `docs/product/research/` is the owner's drop-box: screenshots he takes are
  first-class `verified` evidence.
- The teardown standard lives at `docs/product/teardowns/README.md`. A
  competitor claim that has no evidence row does not enter a comparison.

## What this org never does

Carried over from the standing rules, restated so a new agent inherits them:

- Nothing touches production without the owner's explicit approval — including
  "additive", "safe", "reversible" and "prerequisite" changes.
- Nothing is posted, emailed to a stranger, or published without the owner.
- No performance claims, no annualized small samples, no advice.
- staging → verify on real data → main. Every time.
