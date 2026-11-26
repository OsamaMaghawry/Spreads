# Trading audit — STOP: tomorrow's 13:00 close is not known to the terminal, and main still runs the summer clock

**For tomorrow (Fri 27 Nov, the market closes at 13:00 ET).** From 13:00 to 16:00 ET the terminal (desktop and phone) treats the market as open:
- A market order from the terminal or phone after 13:00 sits until **Monday's** open, so a weekend gap is taken that you didn't choose. On 100 shares of a $100 stock, a 3% gap is $300.
- The terminal's stop guard is off from 13:00 to 16:00 while after-hours trading runs until 17:00. With 100 shares and a stop at 95, prints at 90 mean $500 past your stop and nothing sells.
- Until this is fixed: **don't rely on terminal stops after 13:00 tomorrow, and don't use the phone's Market button or an attached stop/target after 13:00.** Today (Thanksgiving) the same clock reads "open". A phone "market" order before 09:30 or after 16:00 goes as a limit priced off Wednesday's quote and waits for Friday.

**Still live on the production app (S1, carried from W45).** Main has run the summer market clock since 2 Nov. From 15:00 to 16:00 ET it says the market is closed, and the stale-price warning goes quiet. The fix (d365b9b) has been on staging since 22 Oct.

**What I fixed today, on staging (8e135022).** These are all phone-ticket fixes:
- **Bracket on a sale.** Selling shares you hold with "+ Stop" and "+ Target" sent a bracket. Once the sale filled, either leg would have bought the shares back: about $10,000 of new, unprotected exposure on 100 shares. The phone now refuses this, as the desktop already did.
- **No price from the last trade.** The extended-hours "market" price no longer falls back to the last trade when there is no bid or ask.
- **Stops above the bid are refused.** A stop already through the market would fire as soon as the order filled.
- **Display fixes.** The R-multiple no longer shows "InfinityR". A shared order's risk is now labelled as the total across accounts. The note that a part-share stop lasts for today only now shows on the phone.

**What I need from you.**
1. **Holidays and half-days (F2).** Approve adding the exchange calendar to the terminal clocks and the stop guard: closed on holidays, and a 13:00 close with after-hours to 17:00 on half-days. Next half-day after tomorrow: Thu 24 Dec.
2. **Release the market clock fix (d365b9b) to main,** on its own if the rest of staging can't go yet.
3. **Server-side check for brackets on a closing sale** (a backstop to today's phone fix). Yes or no.
4. **Phone "market" price from an old quote (F4b).** Price it on the server, or refuse when the quote is over about 60 seconds old. Which?
5. **The phone's 1% risk chip across two accounts** currently means 0.5% each. Should each account risk its own 1%?

Full report: `docs/trading-audit/2026-W48.md` on staging. Tickets are in `docs/ops/queue.md`.
