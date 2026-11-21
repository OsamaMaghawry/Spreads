# Trading terminal: session handoff (20 Nov 2026)

The terminal part of the DeltaMint handoff. It replaces the long session
that built the items below.

## Read first

This note is the trading-terminal detail. For the whole of DeltaMint, read
`docs/context/handoff.md` first: what the product is, where it runs, the
agents, the rules and what waits on the owner.

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

They are in `docs/context/handoff.md`, and they apply here in full: never
`main` without the owner's yes, paper accounts only, and reviews before
staging.

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

- **Holiday nights and overnight exits** (36e19e08 and the commit after it,
  reviewed by systems-engineer, verdict SHIP):
  - no overnight session the night before a full NYSE holiday
    (`_shared/usHolidays.js`, shared by browser and server);
  - an overnight exit with no overnight quote is refused before anything is
    cancelled.
  - **The owner must reload the terminal before Wed 25 Nov 20:00 ET.** The
    hotkeys' holiday guard lives in the browser.

- **Futures practice with a prop-firm challenge** (21 Nov, the owner:
  "training on Futures ... with the contract sizes and points values ... prop
  firms challenges"; design "DeltaMint Futures Challenge",
  https://claude.ai/artifact/88TZzjE7SwBWxfJqSxZg4o, approved):
  - replay only; no broker, and nothing for a `/ES` symbol reaches Alpaca;
  - 55 CME contracts, standard, E-mini and micro (`_shared/futuresSpecs.js`);
  - CME minute bars from Databento `GLBX.MDP3`, front contract by volume,
    through terminal `replay` with a `/` symbol, cached in `futures_bars`
    (migration 0070, applied to staging only);
  - the `"cme"` market in `lib/replay.js` and `lib/terminal.js`: trade
    dates from 18:00 New York;
  - `lib/futuresPlay.js` plays held contracts minute by minute: rolls, exits
    and the challenge (`lib/propRules.js`);
  - Futures tab (`FuturesChallenge.jsx`): the owner's firm rules as a blank
    form (pref `futures`), the challenge panel and the contract list;
  - reviewed: systems-engineer SHIP, investment-analyst figures
    trustworthy (21 Nov);
  - **still to check:** one real day each of ES, 6J, ZN and LE, read through
    staging, matched against CME's quoted units (from `futures_bars` once
    the owner has opened a futures replay).
  - Known, not blocking: stop and target hotkeys use share-style distances in
    points on a contract; several orders filling in one minute past the
    contract limit cancel every order on that symbol; a share traded in a
    challenge replay shows in the bar's Equity but not the challenge's.

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

## Waiting on the owner's choice (order behaviour)

These are in `docs/ops/queue.md`, with their options:

- **W46-F4:** an unfilled overnight exit leaves the position without its stop
  for up to about 23 hours.
- **W47-F1b:** a stop on a part-share holding lasts for the day only, and
  nothing puts it back.

Watch items from the 20 Nov review (none blocking):
- Overnight quotes are checked for presence, not age (W44 N9).
- Overnight, a bid more than 3% from the mark is ignored for the mark minus 2%,
  which feeds F4.
- Closures announced at short notice are not known. The proper source is
  Alpaca's `/v2/calendar`.
- Alpaca's 23/5 overnight change starts 6 Dec. Re-check how it handles holidays
  before 24 Dec.
- The holiday day itself still reads as trading by the clock alone (W44 N10).
  With `isTradingDay` now shared, the fix is about one line in `usSession` and
  `sessionOf`.
- No test pins "refuse before cancelling" in `exitPosition`.

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
