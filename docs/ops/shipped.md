# Shipped

One line per change that reached `main`. What a user can now do, in plain
English. Newest first.

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
