# Shipped

One line per change that reached `main`. What a user can now do, in plain
English. Newest first.

- 2026-09-24 · The homepage's DeltaMint phone view shows two position cards
  (the NVDA iron condor, the AMD covered call) instead of four, with a
  "+ 2 more positions" line so the account summary total still matches what
  the cards don't show; desktop is unchanged (`c5ea547`).
- 2026-09-24 · The site menu gets a Sign up button next to Log in on every
  page, and the homepage broker card now says "Supported brokers" above the
  logo instead of a "Live now" tag (`821fd62`).
- 2026-09-24 · The Alpaca branding review is also a PDF (for emailing to
  Alpaca) and now covers the new About page (`7a3d2ba`).
- 2026-09-24 · The free trial on checkout is 7 days, not 30, on both the
  monthly and yearly plan, and the Terms now say billing is monthly or
  yearly instead of only monthly (`8c918dc`).
- 2026-09-24 · A new About page explains the product step by step (Scanner,
  option chain, order ticket, Dashboard, Trade History, Analysis) without
  performance figures or naming the broker; Home and About join Blog in
  every page's menu (`d9b71e6`).
- 2026-09-24 · A pricing schedule now exists as a PDF for Alpaca's
  compliance review, built from the product's actual prices (not the stale
  pricing page draft); it isn't linked from the site since pricing isn't
  live yet (`c6e8df5`).
- 2026-09-24 · The homepage's shared/social preview image now shows the
  actual product — the Positions Monitor on desktop and on a phone — the way
  Tradier and Alpaca show theirs, instead of a plain word/logo card
  (`fa9d66b`).
- 2026-09-24 · The shared/social preview card is simpler: just the δ logo
  and the homepage headline, sized to read at thumbnail size, instead of
  repeating the page description a second time (`2435efe`).
- 2026-09-24 · Links to the staging site now preview staging's own share
  image instead of production's, previewers (Telegram/WhatsApp/iMessage/X/
  LinkedIn) pick up a changed image instead of showing a stale cached one,
  and links to the app itself now carry a real preview card (`abee00f`).
- 2026-09-24 · The Alpaca logo is back in the homepage's brokerage
  integrations section (using Alpaca's own artwork), after briefly being
  replaced with plain text (`7433d2e`).
- 2026-09-24 · The homepage's share image and the Terms/Privacy/Pricing PDFs
  are now generated from their actual source (the page content, the site's
  fonts and colors) instead of being hand-made copies that silently went
  stale after a rebrand (`df68c09`).
- 2026-09-24 · PDF copies of the Terms of Service and Privacy Policy are now
  available for Alpaca's compliance review, matching the live pages
  word-for-word; the homepage's broker section no longer shows a redrawn
  copy of Alpaca's logo (`38679e2`).
- 2026-09-24 · Connecting a brokerage through Alpaca shows DeltaMint's own
  authorization disclosure dialog before redirecting to Alpaca, per Alpaca
  compliance's requirement (`c6f07b8`).
- 2026-09-23 · (staging) A covered-call scan (Scanner, Open Position and the
  option chain) now shows every ticker an account holds instead of quietly
  leaving out one whose shares already back a call it sold — that ticker's
  row is priced on whatever free cover remains and carries a "cover in use"
  flag naming the call it's behind, so the trader can decide to close that
  one and write a new one instead of never being shown the choice
  (`8bff517`).
- 2026-09-23 · (staging) The Open Position screen now names a ticker a
  covered-call scan skipped instead of just staying silent about it, matching
  the reason the Scanner already shows; and when the server says there is no
  free cover at all, the screen shows that and stops, instead of retrying
  silently every 20 seconds forever (`0dd4b41`).
- 2026-09-23 · (staging) A call sold against a long call (not just against
  shares) now prices correctly everywhere it can be sold: the option chain
  stops treating it as naked-uncovered, and the close ticket's payoff chart
  now draws the long call's floor instead of showing unlimited loss above the
  strike on a position that is actually covered (`95a7b3f`).
- 2026-09-23 · (staging) The Scanner's covered-call suggestions now count a
  free long call as valid cover (previously only free shares counted, so an
  account holding a covering long call was told it had nothing to write
  against) and stop suggesting a second call against shares or a long already
  backing an existing short call (`3964cb6`).
- 2026-09-23 · (staging, lab flag) A reworked Analysis page puts the result and
  its chart first, then four stat tiles, then one detail tab at a time, with
  the method notes last — behind the three-noticed wall of banners the owner
  called "chaotic, overwhelming". Each caveat (an unattributed trade, a
  transfer) now sits on the one figure it actually affects, flagged amber on
  that tile, instead of stated three times at the top of the page; the same
  notes still gather in a Method tab and always render into the exported PDF
  so a disclosure can never silently leave the export. Computes from the same
  shared figures the current page uses — no number can differ, only the
  layout — and stays fully behind `LAB_MODULES`, stubbed out of the
  production bundle (`32ae263`).

- 2026-09-23 · (staging) The blog's diagrams can reach the live site again —
  the real bug was never the pictures, it was the deploy: the publishing
  pipeline commits a post's SVGs straight to `main`, but nothing had ever put
  them on `staging` too, so the landing site's staging-first deploy gate
  (which requires the two trees to match byte-for-byte) has refused every
  deploy since 14 September, silently piling up every landing change behind
  it — including today's whole logo change. The eight images are now on
  `staging` too, matching `main`. A patch, not the fix: the publishing
  pipeline itself still writes to `main` only, so the same trap reopens on
  the next post with a diagram unless that's changed (`649814e`; see
  `docs/ops/queue.md`).
- 2026-09-23 · Unfinished broker work (the SnapTrade and Tradier
  evaluations) no longer has to block a small fix from shipping: the app now
  builds from one shared source tree with a single flag, `VITE_LAB`, that
  staging turns on and production leaves off — the unfinished code is
  literally absent from a production build, not just hidden behind a check,
  and the two edge functions refuse on their own if called directly against
  an environment that doesn't hold the credentials the work needs
  (`4fc84f3`, reverted `c655223`, `e87c119`).
- 2026-09-23 · A twelfth foundations post — what happens at options
  expiration — is live on the blog: exercise-by-exception at a cent in the
  money, the two cutoffs (FINRA's 5:30pm and a broker's own, earlier one),
  each spread leg settling against its own strike independently, and pin
  risk when the close lands right on a strike; reviewed by desk-editor,
  seo-editor and compliance-gate first (`63ca49e`).
- 2026-09-23 · The logo is now the lowercase Greek delta itself — drawn as a
  glyph in the app's own wordmark font rather than the old triangle-with-two-
  sprigs mark, which gestured at a delta without being the letter a trader
  actually reads on an option chain. Its size, spacing and vertical
  centering next to the wordmark are now derived from one number instead of
  four different hand-set relationships across the app header, drawer, auth
  screens and site footer/nav, corrected twice more on the owner's own eye
  (`386841d`, `9b67a8e`, `507dc15`, `2858a90`).
- 2026-09-22 · (staging) The "No earnings date" badge is gone from the
  Scanner's results table — the owner found it confusing, and it was: both
  the badge and its absence meant "no earnings warning to a trader scanning
  the list", so the difference cost a column of space to communicate
  something that changed nothing at the point of reading. The real warning
  now lives in the trade ticket instead, where there's room to say it
  plainly — a dated announcement inside the position's life still gets its
  full warning, and a name the earnings calendar has never covered says so
  and to check before holding through one. The table keeps its amber chip
  only for a real, dated announcement (`e0d4906`).
- 2026-09-22 · (staging) A scanner row with no earnings-calendar coverage
  now reads "No earnings date" in words, at the quietest weight, instead
  of a calendar icon next to a bare "Earnings —" that looked like an
  alert — the em dash was the whole message and too quiet to be read as
  "we don't know", not "none scheduled" (`56984b9`).
- 2026-09-22 · (staging) The scanner's return-on-risk explainer note is
  gone — it was explaining a 0% floor the trader no longer has to reason
  about now that secured strategies default to it (`c8172cf`).
- 2026-09-22 · (staging) A cash-secured put or covered call scan no longer
  comes back empty by design — its return-on-risk floor is measured
  against the whole strike, not the width less the credit, so the old 15%
  default was a bar nothing in either strategy could ever clear; it now
  defaults to 0% on secured strategies. Presets can now be saved for
  cash-secured puts, covered calls and the wheel — the database was still
  only accepting spreads and condors, so saving or auto-remembering a scan
  of any other strategy failed silently (migration `0057`, applied to
  staging; production is the owner's own call) (`c8d6470`).
- 2026-09-22 · (staging) The whole-market scan now drops leveraged and
  inverse funds (2x/3x, "Ultra", "Bull"/"Bear" fund families) by name,
  since Alpaca's own data carries no leverage flag — matched on word
  boundaries so a real company like Ultragenyx is never caught by
  mistake. A ticker the earnings calendar has never covered now reads as
  "Earnings —, unknown" instead of silently rendering the same as a
  ticker checked and found clear (`bc97286`).
- 2026-09-22 · (staging) A whole-market scan that finds setups but rejects
  them all on the return-on-risk floor now says so — how many were found,
  that none cleared the floor, and what the best one actually was — instead
  of the same blank "No setups matched your filters" it showed when nothing
  was built at all. When nothing is built, the screen lists the specific
  reason each ticker was skipped (delta band, credit floor, risk cap,
  expiry window), capped at twelve, instead of only a count (`a30530b`).
- 2026-09-22 · (staging) The whole-market scan now actually scans the whole
  market — it was cutting off at the first 4,000 of 12,647 listed names,
  alphabetically (A–F only, missing NVDA, TSLA, SPY and most of the
  market), because the price snapshots were fetched one after another and
  more of them timed out; they now fetch eight at a time and the cap moves
  to 20,000. A name's volume is now judged against the busier of today
  so far and the last full session, instead of today's running total alone
  — a liquid name trading heavily by the close no longer reads as "thin
  volume" just because the scan ran at midday (`daf0282`).
- 2026-09-22 · (staging) The Scanner's "whole market" sweep now says why it
  found nothing instead of just sitting empty after the spinner stops — a
  server error was being discarded outright and a thrown exception (a
  timeout, a network drop) was being swallowed by an empty `catch`, so a
  broken sweep and a genuinely empty one looked identical. Also fixed: the
  truncation notice used to tell the user to narrow their filters, which
  cannot work — the 4,000-symbol cap is applied before filters run, and the
  cut is alphabetical, so it now says both of those things instead
  (`0adf729`).
- 2026-09-22 · An eleventh foundations post — early exercise, and why it's
  rare except before a dividend — is live on the blog: what American-style
  exercise lets a holder do on any business day, why doing so throws away
  whatever extrinsic value is left in the contract, and the one dividend
  case where cashing out early actually wins. Its two diagrams do not
  render on the live site — the same landing-deploy gap as the two posts
  below, now three posts and six images deep and still unresolved
  (`da81319`, reviewed in `8568a79`/`08202d0`/`280e9ce`; see
  `docs/ops/queue.md`).
- 2026-09-21 · A tenth foundations post — option assignment, what actually
  happens in your account — is live on the blog: who is handed the
  exercise notice and why it's random and always after the fact, and what
  changes line by line when a short option gets assigned. Same
  broken-diagrams gap as below (`59a5852`).
- 2026-09-20 · A ninth foundations post — gamma, explained plainly — is
  live on the blog: what gamma measures, why it peaks at the money, and
  why it speeds up as expiration nears. Its two diagrams have never
  actually reached the live site — the landing-deploy workflow has not
  succeeded since 14 September (`7b15efe`; see `docs/ops/queue.md`).
- 2026-09-20 · (staging) Emails the app sends to itself — a failed blog
  publish, a drift in stored history — now go to `agents@deltamint.app`
  instead of the customer-facing `support@` address that the weekly digest,
  position-watch alerts and sign-in mail use, so internal cron output stops
  burying customer mail and vice versa (`3a7e7ed`).
- 2026-09-19 · (staging) Analysis lists every closed setup instead of only
  the ones spanning more than one leg — a single put that expired worthless
  now counts alongside a multi-leg spread, rolled up by ticker with tiles
  that total all of them, not the six it used to keep (`dd706f2`).
- 2026-09-19 · (staging) A covered call's buyback is grouped with the shares
  and the puts that funded it into one setup, so a losing buyback inside an
  overall-profitable campaign no longer reads as an isolated loss on its own
  (`c0332de`).
- 2026-09-18 · (staging) Tradier — chosen as the second broker to build
  directly, because its paper and live accounts share one API the way
  Alpaca's do — has a client, order translation and a probe (places
  nothing) on staging: it corrects for Tradier's inverted price sign on
  credit/debit orders, its form-encoded multi-leg order format, and its
  habit of collapsing a one-item list into a bare object instead of an
  array. Migration `0056` adds `broker_probes` to record what each
  candidate broker actually returns (`2c6fd7f`).
- 2026-09-18 · (staging) SnapTrade — a service that connects to many
  brokers through one API — was evaluated end to end from a new Admin →
  SnapTrade panel: signed and authenticated against their live API, one
  real brokerage (Robinhood) connected and probed. Verdict so far: 15 of
  their 39 reachable brokers can place an order, but the four largest US
  options brokers (Schwab, Fidelity, Interactive Brokers, Robinhood) are
  read-only through them, live Alpaca isn't offered at all, and every
  holdings/positions route currently answers 410 pending SnapTrade's own
  explanation. Order placement is double-locked — an explicit confirm
  flag plus the broker's own paper flag, read fresh on every call — so
  the evaluation itself can never place a real order. Nothing it returns
  feeds the dashboard, Analysis or the weekly digest (`cf4aadf`,
  `b67897f`, `34d4b06`, `d83db11`, `2cc2fd5`, `cde79bf`, `448da9f`,
  `240b2a3`, `828d287`, `1554f21`, `d6b6663`, migration `0055`).
- 2026-09-17 · Stored account history is now frozen against being silently
  rewritten: a nightly rebuild can no longer blank or materially change a
  day older than the last few trading sessions (the exact bug that had
  zeroed 52 days of one account's history two lines below) — a
  disagreement is recorded and the old, good value is kept instead of
  overwritten. Every previously-sent weekly digest is now re-checked
  against what's actually stored, and the owner is mailed once if a sent
  figure no longer matches history, not every night the mismatch persists
  (`7da283d`/`294175c`, `22c5b44`/`a9dbf8b`).
- 2026-09-17 · The Account Analysis chart now draws the close a window is
  measured FROM, not just the days inside it — previously a week's chart
  started already up most of its gain, so the week looked flat when it
  wasn't. A new panel under the headline breaks the window's total into
  the same four parts the weekly digest already emails (premium, shares,
  mark change, etc.) between that starting close and the window's last
  close, so a figure like "+$2,455.91 for the week" now shows where it
  came from instead of just asserting it (`33b1333`/`e8787b0`).
- 2026-09-17 · Account Analysis and the weekly digest email now agree with
  each other and explain their own numbers instead of contradicting each
  other: both now measure a window's change from the same starting
  balance (previously the chart measured from the first day inside the
  window while the digest measured from the last day before it), a
  windowed balance is now labelled "End of window · <date>" instead of
  reading as today's, the digest's realized figure now excludes the same
  still-settling trades the page already excludes instead of silently
  disagreeing with it, and the gap between what trading did and the
  broker's own account-value change is now named on screen and in the
  email (fees, interest, dividends, transfers, or a marking difference)
  instead of left for the reader to notice and distrust (`f6d610c`/`0dd5122`).
- 2026-09-17 · Account Analysis, filtered to the exact week a weekly
  digest email described, no longer disagrees with what the email said:
  a spread's long leg (nested under its parent order rather than
  carrying its own symbol) was invisible to the nightly history rebuild,
  so it was treated as held with no known open date and blanked 52 days
  of stored history to "performance: null" — the Whole view showed
  nothing for any window while the trades view showed realized money
  only. The rebuild now matches every leg to its fill the same way trade
  history already does. The weekly digest also now keeps a permanent
  record of the exact figures it sent, so what was emailed can be
  checked later instead of only living in that one inbox (`a1127e8`/
  `7386f6b`, `ec6b0f3`/`bf9180f`, migration `0054`).
- 2026-09-14 · Closing a position no longer shows a blank white screen: the
  close ticket read its own share/contract quantity before the value existed
  (a JavaScript temporal-dead-zone bug in `CloseDialog`), so every attempt to
  close crashed the whole page with no message, live on production since the
  morning's order-card release. The quantity is now read after it is set, and
  the app gets its first error boundary anywhere — a crash is now caught at
  the smallest scope, shows what broke with a way back, and is recorded for
  later instead of unmounting the entire page. A new lint rule
  (`no-use-before-define` for `let`/`const`/`class` across `src/components`
  and `src/pages`) stops the same class of bug from shipping again
  (`c576da7`, `b9c2555`, merged straight to `main` in `c835e0f`).
- 2026-09-14 · (staging) Reopening a saved order ticket no longer shows a
  false "No ceiling"/"Loss not bounded" risk warning, blank strikes and
  "Delta NaN" for a setup it never actually rebuilt — saved orders now
  store the setup itself (strikes, expiry, deltas, credit, max risk), so
  reopening one shows the real numbers instead of guessing from the wire
  legs alone; risk now reads bounded, unbounded, or "not known" rather
  than treating "we don't know" the same as "unlimited loss"
  (`3ab139a`, migration `0053`).
- 2026-09-14 · (staging) An eighth foundations post — implied volatility
  explained — is live on staging (not yet merged to production `main`):
  what IV measures, why every contract on a chain reprices together
  because they're all priced off one shared expected move, and what vega
  turns a change in it into in dollars; cleared through desk-editor and
  seo-editor review before publishing (`7076e62`, `10c3431`, `32186c2`,
  `1fe3c4d`).
- 2026-09-14 · The Screener is now the Scanner everywhere a user reads it
  — nav, headings and copy all rename, and to "Strategy Scanner" rather
  than "Market Scanner" (two of its six strategies sweep an account's own
  held shares, not the market). A Condor now opens 1:1 by default in the
  Open Position ticket the same way it already did in the Scanner, instead
  of silently starting at a riskier, unexplained 2:1 (`8a51f95`,
  `aeb0f55`, `4e67892`, `49ea499`).
- 2026-09-14 · Both deltamint.app and dashboard.deltamint.app now serve
  Strict-Transport-Security, X-Content-Type-Options and Referrer-Policy on
  every response, including the paths each site's own Worker generates
  that a static Cloudflare `_headers` file can't reach on its own
  (`8b378bd`, `505a9bb`).
- 2026-09-14 · The Orders tab's order card was rebuilt end to end: a
  working order now shows the live market price without opening the price
  editor, the price is labelled debit or credit rather than a bare
  number, and every editor confirms only what actually reaches the broker
  (Update or Cancel) instead of adding a confirmation to opening the
  editor itself. Any order — opens and closes alike, not just opens — can
  now be saved for later; a parked ticket reopens through the real ticket
  rather than a second send route that bypassed order-safety checks and
  could have inverted a position, the button is hidden on an order that
  would only be refused, and a new Saved tab lists parked tickets and
  actually refreshes instead of going stale after the first load. A
  closing order's quantity field now reads the true broker ceiling
  instead of an amount already sent, holds Alpaca's full nine decimal
  places (previously rounded to six, which could ask to sell more shares
  than were held), is wide enough to show a nine-decimal count without
  cropping it, no longer double-counts a replaced order's own reservation
  into its max, and no longer collapses a sub-1-share fractional holding
  down to a default quantity of 1 (`3b34511`, `0084d35`, `cadf3e3`,
  `3b04795`, `5424c51`, `9e26daa`, `2578cdd`, `813e849`, `fdd6793`,
  `29ab4b5`, `16093e2`, `2fe6390`).
- 2026-09-13 · A seventh foundations post — theta decay explained — is
  live: what an option loses from one day passing, the same contract
  shown long and short in its final week, and why the daily figure speeds
  up as expiry nears; reviewed by desk-editor and seo-editor before
  publishing (`67d7cdc`, `bf62ac0`, `394e74f`, `bc3f318`). Also fixed: a
  publish-pipeline bug that had silently kept the previous day's post
  (option delta) from ever reaching the live blog — a bulk insert the
  publisher relies on refuses unless every row shares identical keys —
  so a new post landing next to an edited old one killed the whole run
  with no visible failure (`939bbf0`).
- 2026-09-13 · The weekly digest email now actually sends to every
  connected account's own users, not just to the owner's preview inbox,
  and no longer decides on its own that a quiet account is "dormant" and
  skips it — each connected account gets its own email with its own
  premium and stock figures (`b13e9cc`, `8328baf`). Its footer's
  unsubscribe link now works: `/settings?email=off` didn't exist as a
  route until this fix, so nobody who clicked it had ever actually been
  unsubscribed (`d4d9648`).
- 2026-09-12 · A negative options buying power (an account in deficit) now
  reads as money owed instead of being run through an unconditional
  `Math.abs` and shown as a positive balance available to spend (`133140c`).
- 2026-09-12 · The weekly digest email was rebuilt into what a user
  actually receives: it opens on the account's own total value with two
  bars for what's committed (collateral, options buying power) instead of
  three more technical ones, states a plain support@ sender with no
  internal "Owner" banner or account-name-and-P/L subject line, shows all
  four parts of the week — premium paid, premium earned, share result and
  the change in open option marks — under a heading that actually covers
  all four instead of three, and the plain-text fallback (for clients
  that don't render HTML) now carries the same reconciliation fixes as
  the HTML version instead of silently reverting to the older, wrong
  numbers (`e88b34c`, `d91e484`, `177fb5c`, `9ea477e`, `80126bb`,
  `ec7974a`, `4a63bda`, `cefbdc1`, `7d9a963`, `28affc9`). It's backed by a
  corrected daily account-equity series: every stored day had been
  labelled to the session *after* the one it actually belonged to
  (Alpaca's own daily-equity timestamp lands after midnight Eastern, the
  next UTC calendar day), the series now rebuilds itself automatically
  for every connected account instead of only when someone happens to
  open Analysis, production's scheduler for it — never actually turned
  on — now runs, and a cron job that had been authenticating with the
  public anon key instead of the service-role key the Vault row claimed
  to hold can now write at all (`9236525`, `4f03740`, `fc9beb5`,
  `f403623`, `126311e`). A new audit framework flags a stored row with an
  internal contradiction and withholds only the disputed figure instead
  of freezing a whole account's trade history the way the two guards it
  replaces did (`ef0bbf0`, `8ff794b`, `d5534a6`, `0fcfae3`, `c9243fa`,
  `88c154d`, `2dfa61e`, `123dd04`).
- 2026-09-12 · A tax-review disclaimer that used to appear only on page
  one of an exported PDF now repeats on every page, including the
  by-month and by-ticker realized-P/L tables — the pages most likely to
  actually get forwarded to an accountant (`ab47f13`).
- 2026-09-12 · Account Analysis gets a 1-week date-range preset (the row
  now reads shortest-to-longest: All · 1W · 30D · 90D · 6M · YTD · 1Y),
  and its empty state now distinguishes "no trades at all" from "nothing
  closed in this window" instead of telling an account with 150 closed
  trades that it had never traded. Whole view's weekly filter now
  actually filters the whole book instead of always showing the
  unfiltered all-time figure, its headline no longer silently reverts to
  booked-only P/L just because the chart was switched off "Performance"
  mode, and it now shows the booked total for a filtered window instead
  of a dash (`8157d92`, `f015384`, `816ccae`, `3b8aae1`, `23c1a12`,
  `d8e4914`).
- 2026-09-12 · A fifth foundations post — the bid-ask spread on an option
  — went live, and the publish script no longer rewrites or re-dates a
  post that hasn't actually changed (`083144c`, `78b4396`, `4e7acf1`). A
  sixth post — option delta, explained — published the same day
  (`89f7840`). Both blog hub pages now sort strictly newest-first —
  "series order" and true chronological date used to disagree, so one hub
  looked broken while sorting exactly as designed (`1e55691`, `cc9a1f1`).
- 2026-09-12 · A one-switch Demo mode (toggled from Admin, reversible)
  makes every live-money broker account watch-only across the whole
  site — `openPosition` now refuses outright to place any order on a live
  account, and prices/quotes are held back site-wide — while paper
  accounts keep trading normally, so the product can be shared and tested
  by others before pricing is finalized (`95b03b7`).
- 2026-09-12 · Navigation moved from a top bar to a left-side column:
  pinned open on desktop, behind a hamburger with a backdrop and
  Escape-to-close on phones. The old top bar hid link labels below a
  breakpoint, leaving a phone user five unlabelled icons to click through
  to find out where each one went (`e9330ff`).
- 2026-09-12 · Every strike on an underlying's full option chain is now
  tradeable from its own page, not only through the Scanner: the chain
  now covers every expiry including LEAPS years out (fixed by paging
  through all of Alpaca's results instead of stopping at the first page),
  legs can be picked across different expiries by multi-select without
  the selection resetting when the expiry changes, a diagonal or other
  position with unbounded downside is refused a false "$0.00 max risk"
  and shown its real payoff instead, a position whose legs expire on
  different dates now draws an actual priced curve (a new Black-Scholes
  module) instead of a paragraph explaining why no chart is available, a
  short put's bounded max loss is now computed correctly instead of
  reading "No ceiling", order warnings (a stale quote, an after-hours
  session) no longer silently fail to reach the ticket and now offer
  "Send it anyway" instead of a flat refusal, and GTC is now an offered
  order type (`104fceb`, `75f3ab7`, `ba1f931`, `ce2e48e`, `48c020c`,
  `7c58e61`, `9c5ba2c`, `1fc65ea`).
- 2026-09-09 · Three more foundations posts are live — "Call vs put
  options," "Intrinsic vs extrinsic value in options," and strike/
  expiry/premium — reviewed for compliance and desk-editor findings
  before publishing (`27b27cb`, `d4bfb5c`, `0dac475`). Two existing post
  titles were also rewritten per a new SEO keyword map, and the
  credit-spread post got its first diagram under a new house rule for
  keeping diagram text short (`c5c9950`, `c4d1774`).
- 2026-09-07 · The marketing homepage was rebuilt from the product
  itself: a hero that wipes between raw broker rows and DeltaMint's own
  position cards (with a Broker View / DeltaMint View toggle on phone), a
  looping Scanner replay with real defaults and batch streaming, a
  looping trade-ticket replay (earnings warning, risk meter, two-step
  confirm, walk log), an Analysis tiles/capture-table section and an FAQ
  — with the app's own top nav dropped from the replicas so they no
  longer read as a second site nav, and a smaller broker logo in the
  connect card (`f14570a`, `0c423ee`, `c3675a3`).

- 2026-09-11 · (staging) Trade history now syncs on a schedule instead of
  only when someone opens the Trade History page — every connected account
  refreshes hourly on weekdays (skipping one already refreshed in the last
  50 minutes) and once every morning unconditionally, so assignments,
  exercises and expiries that settle overnight or over a weekend are
  reflected without a click. Previously a production account nobody opened
  could sit 24 trades stale while the same broker account on staging, which
  does get opened, was current (`b6d26bf`).
- 2026-09-11 · (staging) Fixed a case where the new daily equity chart could
  store a live option book as a complete $0.00 day — a leg with no
  establishable open date (ordinary for one acquired by assignment) was
  dropped before it could be named as unpriced, so the chart reported the
  day as fully known when it wasn't. Also fixed: cost basis on a
  re-opened/added-to option leg was backdated to its very first fill instead
  of the fill that actually explains today's position size; the account
  history reader could silently return fewer than all of an account's trade
  rows past 1,000, and in a different order each rebuild, corrupting stored
  history with no error; a caught error while pricing open positions used to
  quietly zero out the whole options book instead of refusing the update;
  the open-positions panel couldn't tell a put from a call; option prices
  now carry forward on a quiet trading day instead of blanking the day's
  mark; and a PDF export line had "shares" and "options" swapped (`9faf020`).
- 2026-09-11 · (staging) Account Analysis now includes open option positions,
  not just closed trades and shares — previously a still-open put or call
  (five legs on the owner's own live TSLA/NVDA book, net -$390) counted
  nowhere on the page despite the "wheel as one strategy" headline claiming
  to cover it; the headline, return on equity/risk and a new open-positions
  panel now include them, marked at today's broker price and clearly labeled
  unrealized (`0cde265`, corrected in `a49da5e` after the owner caught a
  stale illustration in the commit description — the underlying fix was
  already right).
  equity feature, two of which had been silently corrupting the stored
  history: premium booked more than a year before an account's calendar was
  being dropped from every day's figure permanently (an account trading
  since 2022 lost that premium for good, and rows written a year ago kept
  stepping down at the one-year seam), and a failed broker fetch was writing
  `null` over the broker's own previously-good equity/P&L figures for every
  day back to the account's first trade — an ordinary page load, every
  thirty minutes, destroying data this table is the only copy of. Also
  fixed: the chart now withholds a day's value across a stock split instead
  of pricing a 2:1 split as a $16,000 one-day loss, a delisted name stops
  being carried forward at its last print after five sessions and gets
  named instead, the chart now refuses the same way the headline does when
  the ledger and the broker's own positions disagree, Annualized/CAGR are
  withheld whenever the total includes an unrealized mark (a reversible
  paper gain read as a performance claim), Max drawdown no longer changes
  depending on which chart button was last clicked, and several PDF-export
  and wording bugs that stated the wrong thing about shares held or sold
  (`333a99f`).
- 2026-09-10 · (staging) The Strategy Comparison table now follows the Whole view / Premium only switch too: its P/L column header reads "Option-leg P/L", "Total P/L" or "Realized P/L" instead of always claiming "Realized", and the all-strategies total row shows the mark on shares still held (which no single strategy row can claim, since a share lot belongs to the account, not to the strategy that opened it) with a one-line note only when that mark is actually present — so the rows no longer visibly fail to add up with nothing on screen explaining why (`c504afb`).
- 2026-09-10 · (staging) Account Analysis's equity chart is a real daily line instead of a pole: the portfolio is now recalculated for every session day since the account's first trade (from lot dates, not `realized_pl`, so a share result no longer double-books between the day a lot was assigned and the day it was sold) and stored (migration `0030`, `account_equity_daily`), giving two real daily curves — strategy performance and the broker's own account value — with nothing dashed or guessed in either. The Whole view / Premium only switch now actually drives every number on the page, not just the headline: win rate, payoff, expectancy, streaks, best/worst, the month and ticker tables, and return on equity all recompute for the selected view, and max drawdown is now measured from the daily series (a position that fell $9,000 and recovered mid-trade used to register as nothing, since no trade closed while it happened) (`85c8da7`).
- 2026-09-10 · (staging) The new daily equity line no longer comes back empty for reasons unrelated to the account: `equityHistory` dropped two intraday-only Alpaca parameters that could cause an outright rejection at the daily timeframe it actually uses, and now retries on the free IEX feed when the account's plan doesn't carry the consolidated one instead of leaving every held lot unpriced for the day (`2ca653f`).
- 2026-09-10 · (staging) The Whole view / Premium only switch now actually re-buckets the equity curve, the month table and the ticker table instead of only moving the headline: Premium only's chart now ends at its own figure instead of a third number neither view claims, Whole view draws a dashed step from the realized path to today's mark (there's no historical mark-to-market data to draw a solid line through), and outcome-only statistics (win rate, payoff, expectancy, streaks, credit capture) now say why they don't move instead of sitting there unexplained (`78da876`).
- 2026-09-10 · (staging) Account Analysis's Whole view now counts assigned-but-unsold wheel lots at all — previously a lot acquired by assignment contributed zero to every figure on the page until it was sold, so a wheel account that grew from $140k to $151k showed a $1,737 result; the page now reads the broker's live mark for those lots the same way the rest of the screen already does (`1e230e4`).
- 2026-09-10 · (staging) Fixed four blockers the review bench found on Whole view before it could ship: a false claim that "Premium only" was the number to use for a 1099-B (deleted — it excludes share sales and misclassifies assigned-put premium); Whole view silently adding a date/strategy-filtered total to the unfiltered position book; a banner that could name the wrong reason a position was unpriced; and two broker symbols that could collide to one ticker and publish a wildly wrong total as complete. Also surfaces the share result next to Premium only so the two realized figures on the page no longer disagree with no explanation (`a83613e`).
- 2026-09-10 · (staging) Dropped "actually banked" from the Premium only question — it implied Whole view was the inflated number, but premium on an assigned wheel lot reduces stock basis rather than standing alone as banked income; now states what the figure sums and omits without claiming which view is truer (`b7434c5`).
- 2026-09-10 · (staging) Fixed nine more Whole view blockers from desk-editor's review: a bought-option gain wrongly described as "banked from selling", a negative share result printed as a gain by a stray `Math.abs`, a wrongly ordered no-cost/no-position check that let the banner assert a price existed when it didn't, a stranded-position message blaming sync lag for what is usually ordinary stock the page doesn't cover, two wrong scope-line claims, a dollar figure mislabeled as a mark instead of a gain, and a stock line called a "contract" (`20610f5`).
- 2026-09-10 · (staging) Cloudflare's HTTPS/trailing-slash redirect behaviour is now declared explicitly in both wrangler configs instead of resting on a platform default, and a live daily check (`scripts/site-health.mjs`, 06:17 UTC) fetches the http and trailing-slash forms of every page and compares where they land against the canonical URL each page itself declares — a mismatch fails the check instead of surfacing weeks later in Search Console (`2948a28`).
- 2026-09-09 · (staging) Fixed the worst of the multi-close bugs the review bench found, two of which were already live in production: pressing Stop mid-sequence could still let one more order go out if a cancel lost the race to a fill (now checked before every submit, not just once); a reprice on a spread order whose read was missing its legs could resubmit a malformed order with no symbol; and the walk's fill count is now derived from the legs' own contract counts (the smallest fully-filled leg) instead of guessing whether the broker reports multi-leg fills in units or contracts. Also fixed three status messages that promised something the plan didn't guarantee (`e32a8a7`).
- 2026-09-09 · (staging) The number showing how much of a position you can act on right now is labelled "Available to close" instead of "Free" — the owner read "Free" as free of charge, not as the broker's `qty_available`; the reason it's reduced (collateral for a short, or a working order) now shows on hover instead of being asserted as one specific cause (`d722020`).
- 2026-09-09 · (staging) The multi-close plan explanation no longer reads as a warning — it opens with what will actually happen instead of "This cannot go as one order" in the same amber box as real risk warnings, so closing several positions at once no longer looks like a refusal when it isn't one (`0d48c92`).
- 2026-09-09 · (staging) Google Analytics and Hotjar no longer fire for visitors in the EEA, the UK or Switzerland — gated client-side (both the marketing pages and the edge Worker's own copy of the gate) rather than relying on a config omission to keep staging out of the data; the privacy policy's analytics section was rewritten to match (`7ed6ee8`, `cd4049a`).
- 2026-09-09 · (staging) Repricing a resting option order that the broker refuses to replace directly (Alpaca won't PATCH an order once it reaches "accepted") now cancels the order, confirms the cancel, and resubmits at the new price automatically instead of showing the raw broker error with no way forward; if the original filled — or partially filled — while being cancelled, nothing extra is sent and the ticket says what actually happened (`85c64ca`).
- 2026-09-09 · (staging) The live blog no longer prints a spurious "part 48" under a post's byline (that number is only the post's slot in the internal syllabus), and page titles no longer have "— DeltaMint" appended, which was eating 12 characters off a 60-character search-result budget (`c72b562`, `dc92fac`).
- 2026-09-09 · (staging) A new Broker tab shows exactly what Alpaca reports you hold — one row per broker position, with a Close on every line that sends the broker's own quantity with no pairing logic involved — plus a multi-select close across several rows at once: buy-backs are always sent before sales (never the reverse), so an in-progress multi-order close can never leave the rest of the book more exposed than before it started, it respects Alpaca's four-legs-per-order cap, and it refuses to send a second order when a cancel can't be confirmed rather than risk closing more than intended (`4b523bc`, `91cc0f2`, `8f0e7fa`, `d520b22`).
- 2026-09-09 · (staging) The scanner can now scan the whole market instead of just the S&P 500: a cheap first pass prices every listed name and filters on price, volume, quote width and capital-per-contract (a floor that keeps a small account out of illiquid names it could get stuck in) before the slow per-ticker options-chain fetch runs on the survivors; the results panel reports how many names were priced and how many passed (`dcf0f17`).
- 2026-09-09 · (staging) The close ticket no longer treats a missing bid or ask as a price of zero: a one-sided quote (seen live on an SPY share close, bid $746.01 / ask $0.00) now refuses to show a price, a P/L or an armed "Sell" button instead of pricing the trade at half the real value; a price walk that resumes after a refused quote no longer loses its ceiling and walks past what the market will bear; and a close spanning more than Alpaca's four-leg limit is now capped, split and rescaled correctly instead of being sent as an order the broker would reject (`2b9ccf7`, `3aee291`).
- 2026-09-09 · (staging) Closed a security hole in the broker-feed diagnostic function: any caller holding the app's public project key — not just a signed-in account owner — could name any account and have its broker credentials decrypted and its full position/order history fetched. The caller must now be signed in and either own the account or be an admin; the function also now captures filled orders, not just account activity, so a "position mismatch" report can be checked against the exact data the broker sent. **This fix is on `staging` only — the same hole is still open in production `main` until this is merged** (`af75776`).
- 2026-09-09 · (staging) A stock-repair or other ratio position (1 long against 2 or 3 short) now closes correctly from the ticket: it quotes and orders the true leg counts instead of misreading a 1x2 as a 1x1, a cancelled reprice resumes at the correct per-leg limit instead of the wrong net price, its max risk shows as unbounded rather than a false $0.00, and the ticket now refuses rather than guesses when it doesn't recognize a structure's legs (`619b0b7`, `1ee4e8f`).

- 2026-09-08 · (staging) The app now deploys from this repo instead of relying on Cloudflare's own build, which only ever published a preview version that never reached traffic — four commits of dashboard work had gone unseen at dev-dash with no signal anywhere that they hadn't shipped. New `deploy-app.yml`/`deploy-app-staging.yml` run lint, tests and a real `wrangler deploy` on merge, gated the same staging-first way the landing site is (`9183b42`).
- 2026-09-08 · (staging) A ticker with more than one open position (a repair, a wheel) gets a P/L-at-a-price curve that sums every position on that name at the same underlying price and sweeps it across a range, showing where the whole thing — not just one card — stops losing money (`fbd520e`).
- 2026-09-08 · (staging) A stock repair (a long call bought against more short calls of a higher strike over 100+ shares) now shows as one position instead of being split across two or three cards with no card saying they're the same trade — a new `call_ratio_spread` shape claims it, covers its extra short from the same share allocator every covered call uses, and carries its own max risk, close cost and break-evens; the strike ladder labels that break-even "Options break-even" so it doesn't read as the whole position (shares included) turning over (`6770ae4`, `5bd85f7`).
- 2026-09-08 · (staging) An account's total risk figure no longer silently drops an unbounded position — a naked call's contribution is now flagged as unknown instead of counted as zero — and the account stress total no longer charges the same ticker for a crash and a rally at once (or double-counts a covered call's shares); the dashboard and the position watch now agree on what "covered" means, judging it per contract instead of per whole leg and withholding judgment on a contract that isn't 100 shares each; a debit call spread bought as two separate fills is now recognized as a debit vertical instead of two unrelated legs, with its risk, break-even and moneyness read the right direction; and cover is now allocated to long options before shares, so a lot the owner holds outright is never capped below what the broker actually lets him sell (`df1f997`).
- 2026-09-08 · (staging) A share row can no longer offer more shares to sell than it actually holds: the close ticket now clamps its default and its input to the row's own free-share count instead of the parent lot's full quantity, closing a bug where confirming a ticket that read "10 shares" could have sold all 210 and stripped the cover off two live short calls (`c642dcc`).
- 2026-09-08 · (staging) The dashboard now shows a stock position's true broker quantity with the shares tied up by covered calls named alongside it ("210 (10 free)") instead of silently shrinking the row — and a short call backed by a longer-dated long call of any strike is now correctly shown as covered rather than "Naked call · Unlimited" (`dcb5f5f`).
- 2026-09-08 · (staging) Fixed a case where two option legs a broker reported could vanish from the Positions Monitor entirely because the pairing engine claimed them for a spread shape they didn't fit (a 1x2 stock-repair ratio, not a vertical) and never gave them back — which had also been making an unrelated covered call misreport as far more shares than it actually held (`92a78ed`).
- 2026-09-08 · (staging) When a live account's broker positions don't match what DeltaMint shows, support can now settle it: the hourly broker feed capture also records the account's raw open positions and open orders (not just its activity feed), so a report like "there's a position DeltaMint doesn't show" can be checked against what the broker actually sent instead of staying unprovable (`dcd6b34`, migration 0028).

- 2026-09-07 · The blog is live in production: two more posts join the two
  already there ("What is an options contract", "Credit spread max loss"),
  all four restructured to lead with points instead of long paragraphs; body
  text now reads at 17px on a 780px column instead of a 14px UI size; a list
  item that wraps onto a second line renders as a list instead of a
  paragraph with stray dashes; the credit-spread post's stale `draft: true`
  flag (set 3 September, when the file was a 150-word stub) is gone so the
  2,100-word article it has carried since actually publishes (`fcfefbd`).
- 2026-09-07 · (staging) The owner's digest email is a card per report — what it
  is, one sentence, up to five points, a button to the full document — instead
  of the whole report pasted into the mail; a stray unclosed asterisk no
  longer survives into the rendered text, a subject no longer names the same
  audit label twice, and the card's one-line summary is now pulled from the
  report's actual findings instead of its opening process line
  (`1018978`, `3c69ce5`).
- 2026-09-07 · (staging) Blog posts read at 17px on a 780px column instead of
  a 14px UI size, with every other size in the blog scaled to match; posts
  must now carry at least two lists and no paragraph over 110 words, and a
  list item that wraps onto a second line renders as a list instead of a
  paragraph with stray dashes in it. The credit-spread post, held back by a
  stale `draft: true` flag since 3 September, is unflagged and now
  publishes (`da39999`, `2029e30`).
- 2026-09-07 · (staging) On a phone, Blog and Pricing (and Log in) move behind
  a menu button in the header instead of being hidden entirely below 640px —
  previously a phone visitor had no way to reach either from the top of any
  page (`333503a`, `4501bd0`).
- 2026-09-07 · (staging) The homepage's looping Market Screener replay no
  longer shifts the sections below it as the animation plays; the results
  panel now reserves its tallest measured state instead of its emptiest
  (`addf7c7`).
- 2026-09-07 · (staging) A blog draft the merge gate had been silently refusing — it counted a post's own diagrams under `landing/public/assets/blog/` as "not content-only" — now lands somewhere a person can read it before strangers do: the content gate merges a post's branch to `staging` instead of `main`, a new `publish-blog-staging.yml` writes it into the staging project so it renders at `dev-landing.deltamint.app/blog` (noindex), and the owner gets an email naming the post and linking to it. Going to `main`, and the live blog, is still the owner's own merge. Needs the owner to set `SUPABASE_SERVICE_ROLE_KEY_STAGING`; without it the workflow refuses loudly rather than half-publishing (`0053b90`).
- 2026-09-07 · The homepage is rebuilt from the product itself: a hero wipes between the broker's raw rows and DeltaMint's position cards (with a phone toggle and flip-to-legs cards), a looping Market Screener replay and trade-ticket replay with the real defaults, an individual-legs section, the Analysis tiles and capture table, and a "Start for free" close; the screener and ticket replicas no longer carry a copy of the app's own top nav, and the broker logo in the connect card is smaller (`f55ef60`, `fa8726c`, `204b853`).
- 2026-09-04 · (staging) The scanner tells "options market is shut for the day" apart from "the stock and options feeds disagree" — pre/post-market it says the chain is stale at yesterday's close instead of blaming a data fault, and the open-position scan loop backs off to a minute between passes outside market hours instead of retrying every 20 seconds (`228fea9`). Not yet on `main` — no PR exists for it; corrected from an earlier ledger entry that omitted the `(staging)` tag.
- 2026-09-04 · Shares held by an already-working sell order no longer show as free to sell again (`d1c3262`).
- 2026-09-04 · The orders row and the close ticket no longer call a share order a "leg", the price editor gets working +/- arrows on a phone, and closing an account explains what is and isn't kept (`fc9598f`, `08b1fe5`).
- 2026-09-04 · A share position closes from the same ticket as an option, the price walk can be left running without trapping the order, and repricing a resting order updates that order instead of opening a second one (`326ce67`).
- 2026-09-04 · The position watch stops emailing several identical lines for one price problem — one note per ticker with the reason and last price shown — and a run that finds nothing about positions sends no email at all (`f0710c8`).
- 2026-09-03 · Hotjar session replay runs on deltamint.app's public pages, on the same hostname-gated terms as Google Analytics and never in the app; the privacy policy now discloses both under a website-analytics section (`cc855e7`, `b453a9f`).
- 2026-09-03 · Billing is hidden end to end until the owner flips `billing_visible`: no Billing entry in the nav, `/billing` says plans aren't open yet, a refused live order's upgrade prompt drops its button, and checkout/portal both refuse with 403 — off by default (`b85c13b`, `20581e9`).
- 2026-09-03 · A draft blog post can be read before it's published: the admin's post list has an eye that opens the draft at `/blog-preview/<slug>` in its own tab, rendered with the blog's own renderer, no dashboard chrome (`f6c481f`, `d650266`).
- 2026-09-03 · (staging) A merge to `main` now deploys the landing site instead of sitting on it: two GitHub Actions workflows deploy `landing/` to its production and staging Cloudflare Workers, skipping with a notice until `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are set (`f2d8369`).
- 2026-09-03 · (staging) Google Analytics is wired into the production landing pages (home, pricing, privacy, terms) and deliberately left out of the staging Worker and localhost (`7304eb1`).
- 2026-09-02 · (staging) A close order you priced yourself no longer traps the ticket: the X leaves it working, and the panel never offers to place a second one; its price can be changed from the ticket or the Orders tab, where the underlying, the market now and your limit sit above the box; quantity has −/+ buttons that work on a phone; cards, rows and orders show the underlying's move today.
- 2026-09-02 · (staging) A scan row shows the delta of the contract it found, not the delta the scan asked for — the same number the ticket and the Screener table show; and a short leg outside the delta band you set is refused, saying what the nearest strike was.
- 2026-09-02 · (staging) A cash-secured put or covered call opens from the ticket (the last gate wanted two legs); a refused order returns you to the ticket with the setup kept; a resting order can be repriced from the ticket or the Orders tab and left working when you close the dialog; the close ticket scrolls on a phone; Simple/Detailed shows on a phone; the open ticket streams the spot, large, and requotes the legs every second.
- 2026-09-02 · (staging) The nav says "positions", matching the name the page itself uses, not "dashboard" — the word `brand.md` forbids (`2514c1b`).
- 2026-09-02 · The watch no longer flags the short leg of a call credit spread or iron condor as naked; only what a long or shares do not cover counts, and it says how many contracts are still uncovered (`616c203` on staging, cherry-picked to `main` as `c680972` via `hotfix/watch-long-calls`, PR #3).
- 2026-09-02 · (staging) The blog groups posts into six categories with hub pages, breadcrumbs, related and read-next posts, and an RSS feed; a new article publishes automatically each day from a fixed topic list (`de4f8d6`).
- 2026-09-02 · (staging) Admin → Engagement is now a KPI panel: traffic, paying users against the 100-user target, and where each week's signups came from; sign-ups record where they arrived from (`de4f8d6`).
- 2026-09-02 · (staging) The pricing page no longer claims Paper lacks cash-secured puts, covered calls, adjusted basis, streaming or the Orders tab — both accounts get every feature; only opening a position on a live account needs a paid plan (`e982774`).
- 2026-09-02 · (staging) The scanner finds cash-secured puts on any universe and covered calls on the shares an account holds, priced at the adjusted basis; a Wheel scan runs both; single-leg orders go to the broker as plain option orders under the wheel prefix.
- 2026-09-02 · (staging) Billing: Stripe checkout, a billing screen, a plan on every live account, and a switch in Admin that gates opening live positions — off until flipped.
- 2026-09-02 · The watch evaluates every account again and flags a short call with no shares behind it as critical (`a7db799`).
- 2026-09-02 · You can drag the price in the close ticket, and the P/L rows follow the price you chose; the band between a short's strike and its break-even is shaded as shrinking profit (`3a22207`).
- 2026-09-02 · Cash-secured puts, covered calls, assigned shares and long options appear on the dashboard as what they are; a naked call is flagged with undefined risk (`e1fc417`).
- 2026-09-02 · Wheel positions show a cost basis adjusted for every premium collected on the name, labelled adjusted or broker (`b84515d`).
- 2026-09-02 · Account risk sizes stock-like positions at a 15% adverse move; stock-to-zero is shown separately as Notional (`9217869`).
- 2026-09-02 · Price walking works on the open as well as the close, with a floor you set that defaults to the credit the scanner showed (`6f6f0a5`).
- 2026-09-02 · The after-close report reads as a headline, "Needs a look" and "Everything else", judged on closing prices (`f1515e4`).
- 2026-09-02 · Set your own price on open and close, with bid/mid/ask chips, a stepper and a verdict on whether it crosses (`dc26117`).
- 2026-09-02 · The dashboard refreshes continuously in the background; the 60-second timer is gone (`dc26117`).
