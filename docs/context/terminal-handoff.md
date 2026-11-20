# Trading terminal: session handoff (20 Nov 2026)

Read this first in a new session. It replaces the long session that built
the items below.

## Read first: the whole of DeltaMint

This note covers only the trading-terminal work. The rest of DeltaMint is in
files the repo already keeps up to date:

- `AGENTS.md`: the working rules, including Alpaca OAuth.
- `docs/product-context.md`: the whole product in one file (architecture,
  every edge function, brand, positioning, compliance, what shipped recently).
  It is generated, so never edit it by hand.
- `docs/context/handoff.md`: how deploys work across the two Supabase
  projects, and the older owner items.
- `docs/ops/queue.md`: the live list of what needs the owner.
- `docs/deferred-work.md`: what is knowingly not built.

## Where things are

- **Repo:** `OsamaMaghawry/Spreads`.
- **Branches:** the work branch is `claude/trading-terminal`. `staging`
  deploys staging, and `main` deploys production.
- **Supabase:** staging is `wpwaomzgpbozzghohwmf` and production is
  `yecfbeohyakuoyczvdbj`. Apply a migration to each project separately.
- **Push flow**, from the repo root:

  ```
  git fetch -q origin staging && git merge -q --no-edit origin/staging && npm run context:check && git push -q origin HEAD:claude/trading-terminal && git push -q origin HEAD:staging
  ```

- **Deploys:**
  - Pushing `staging` runs "Deploy app (staging)" and "Deploy edge functions
    (staging)".
  - Pushing the work branch runs nothing.
- **Checks:**
  - `npm test`: 750 + 893 pass.
  - `npm run lint`.
  - `npm run typecheck`: the baseline is 295 errors, and a change must not
    raise it.
  - `npm run context:check`.
- **Main:** none of the items below is on `main` yet.

## Rules the owner set

- Never push to `main` without the owner's explicit yes.
- Ask the owner every time before any action that reaches production.
- Treat the service-role key like a password. Never paste it into chat or
  commit it.
- Broker and vendor keys (EODHD, Databento and the rest) live only in
  Supabase secrets. They never go into code, logs or commits. Keys pasted in
  chat earlier are never written anywhere.
- "Don't push any broker related thing" means nothing broker-related goes to
  the repo. The gap bot and backtests stay out of it.
- Place no live order without asking. Verify on paper accounts only.
- Before staging:
  - money-path changes go to the systems-engineer agent;
  - P/L and figures changes go to investment-analyst.
- Prototype a design before building UI.
- Give short, plain answers. Ask questions in plain text, with no menus (see
  AGENTS.md).
- Ask before dropping staging `zz_*` tables.
- No model names in commits or in anything in the repo.
- The DeltaMint connector is read-only.

## Built in this stream (on staging)

- **Std dev channel:** an indicator on the chart, plus a scanner filter for
  above or below the 1 and 2 bands (5083e3a9, a194dcb4).
- **Orders to several accounts:** sized by equity, pro rata (e2de3e97 to
  03742977).
- **Part shares:** on hotkeys and on the ticket (c726bd8e, 69e23b24).
- **Chart drawings:** a dragged drawing moves by bars (9f893415).
- **P/L tab:** a custom From/To period that matches Alpaca's close. Its notes
  are folded into one button (2f1b08be to 136b1394).
- **Ticket:** size as a % of equity, each account its own (1b4b1448,
  3c28cda9, 45e6d96a).
- **Playbook phase 1:**
  - commits 1117b687 to 14f813f3;
  - deployed to staging at a10b61ee on 20 Nov;
  - migration 0069 applied to staging only.

## Playbook: how it works

- **Design:** the "DeltaMint Playbook" prototype,
  https://claude.ai/artifact/Qp35SWeh3oWjNh9vdnDLwq
- **Tables** (`0069_terminal_playbook.sql`, server-only): `terminal_plays`,
  `terminal_order_marks` and `terminal_trade_reviews`.
- **Tagging:**
  - The play chip rides on each order from the ticket or a hotkey.
  - Once the broker accepts the order, the server stores order id → play,
    plus the bracket stop if there is one.
  - A trade's play is its opening order's play, unless a review changes it.
  - A price change copies the play to the new order id.
- **Initial stop:** the first of these that exists:
  1. the stop typed in the review;
  2. the bracket stop;
  3. the latest stop placed within 1 h before entry;
  4. the first stop placed within 5 min after entry.
- **R:** realized ÷ (|entry − stop| × size).
- **Code:**
  - `supabase/functions/_shared/playbook.js` holds the pure logic. Its tests
    are in `src/lib/playbook.test.js`.
  - `supabase/functions/terminal/index.ts` has the `plays` and `playbook`
    actions and `markOrder`.
  - `supabase/functions/manageOrder/index.ts` has `copyMark`.
  - The UI is in `src/components/terminal/Playbook.jsx` and
    `src/pages/Terminal.jsx`.
  - Tagging is in `OrderTicket.jsx` and `runHotkey.js`.
  - `src/lib/replay.js` holds `entryOrderId`, `openQty` and `openPrice`.

## Next

1. **The owner tries the Playbook on paper:**
   - the four example plays;
   - a tagged bracket trade, which should show its play, stop and R;
   - a hotkey trade on two accounts;
   - a price change that keeps the play;
   - a review that shows in Results.
2. **Before main:**
   - The Playbook's closed P/L, plus carried-in trades, plus the realized
     part of open trades, should equal Closed P/L on the P/L tab for the same
     period.
   - The P/L Custom period should match Alpaca's day change.
3. **Going to main** needs the owner's yes. Migration 0069 must be applied to
   production first, also with the owner's yes.
4. **Phase 2, later:**
   - Play matches in the scanner;
   - play levels on the chart;
   - history past 92 days;
   - Practice trades.

## Still open with the owner

- The redesign questions asked earlier, which have no answer yet.
- Supabase security:
  - staging `zz_*` tables;
  - the backup table;
  - the advisors' findings;
  - production.
- Where the owner saw −$106.
- Paused: the S&P 500 news-event test.
- Not checked: overnight part-share orders at Alpaca.
