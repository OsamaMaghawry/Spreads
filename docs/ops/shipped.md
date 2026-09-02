# Shipped

One line per change that reached `main`. What a user can now do, in plain
English. Newest first.

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
