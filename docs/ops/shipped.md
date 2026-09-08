# Shipped

One line per change that reached `main`. What a user can now do, in plain
English. Newest first.

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
