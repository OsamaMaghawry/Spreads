# DeltaMint — brand book

Owned by `head-of-branding`, accepted by `vp-product`. This is the baseline as
the product actually is on 31 Aug 2026, recorded so the audit measures drift
against something. Rules marked **(proposed)** await the owner; everything
else is observed current practice.

## The name

- Prose and titles: **DeltaMint** — one word, camel-case.
- The logotype: **deltamint**, lowercase, with **mint** in the green
  (`#3FA672`) and **delta** in the text colour, beside the mark.
- Never: "Delta Mint", "Deltamint", "DELTAMINT".

The marketing site broke this rule for as long as it existed — its nav and
footer set `DeltaMint`, camel-case and one colour, while the app set the
logotype the book describes. Two wordmarks one click apart, which is what the
owner meant on 23 Sep by *"the frontpages have different wordmarks now"*. The
site now matches the app. Camel-case in the LOGOTYPE remains a live question
the owner has not settled; the rule above is what ships today.

## The mark and the lockup

The mark is the lowercase Greek **δ** — the letter on every option chain, the
one the product is named after and reports in its own positions table. It
replaced a drawn triangle with two mint sprigs on 23 Sep.

It is a baked outline, not a `<text>` element, because a tab strip, an email
client and the PDF exporter each load no webfonts and would substitute a
different δ. Extracted once from IBM Plex Sans 700 (U+03B4, OFL).

**The mark is NOT in the wordmark's typeface, and cannot be.** The wordmark is
Bricolage Grotesque 700; Bricolage ships latin, latin-ext and vietnamese only
and has no Greek. So the lockup is two typefaces until the owner decides
either to accept that or to move the wordmark to IBM Plex Sans 700, which
would make mark and word one drawing used twice. Recorded as an open decision,
not as settled practice.

### Geometry — derived, never set by hand

A lockup takes **one number**: the wordmark's type size. Everything else
follows, so the two halves cannot drift apart.

| Quantity | Rule | At 1.05rem (16.8px) |
| --- | --- | --- |
| Mark height | `1.2 × type size ÷ 1.0804` | 18.66px |
| Gap | `0.3 × type size` | 5.04px |

`1.0804` is the mark's effective font size per pixel of rendered height, and
lives in `EM_PER_PX` in `src/components/brand/DeltaMintMark.jsx`; the landing
CSS expresses the same two rules as `1.111em` and `0.3em` on `.brandmark`.

Two faults this rule exists to prevent, both live between 22 and 23 Sep:

- **The mark was set independently of the word** — 24/1.05rem in the app
  header, 22/1.05rem in the drawer, 28/1.125rem on auth, 20/0.95rem in the
  site footer. Four different relationships, none written down, and the δ ended
  up at **1.54×** the type size of the word beside it.
- **The mark's box was square while the letter is not.** The δ is 17.01 units
  of ink in a 32-unit box, so a square mark carries 7.495 units of transparent
  padding each side — 5.6px at nav size, silently added to the gap. A tile or
  favicon wants the square; a lockup crops to the ink (`tight`).

## Palette (from `tailwind.config.js`, the `dm` scale)

| Token | Hex | Use |
| --- | --- | --- |
| accent | `#534AB7` | Primary actions, links, focus |
| accent-dim / accent-bright | `#7F77DD` / `#3C3489` | Hover and emphasis states |
| mint | `#3FA672` | The brand green — the "mint" in the logotype |
| bg / panel | `#F6F5FB` / `#FFFFFF` | Ground and cards |
| line | `#E1DEF2` | Borders |
| text / sub | `#201B3A` / `#6A6294` | Body and secondary |
| positive | `#0F6E56` | Gains — and nothing else |
| negative | `#993C1D` | Losses and risk — and nothing else |

**(proposed)** Red/negative and green/positive are semantic, never
decorative: a green chip means "in your favour", so green may not be used for
ornament on any money surface. The app additionally uses Tailwind emerald/rose
for P/L and amber/sky/violet for notices — the audit should decide whether
those collapse into the `dm` scale or get recorded here as sanctioned.

## Voice

**Plain, and short.** Concrete numbers, admitted uncertainty, no adjectives
doing the work of evidence, no exclamation marks, no emoji in headings.
Compliance vocabulary (use/avoid lists) is the floor; this book adds
consistency on top.

The register used to read *"a trader explaining something to another trader"*,
and agents wrote to it — literary, argument-shaped, 2,000-word posts that
opened with atmosphere and built to a point. The owner's correction, 9 Sep:
he never asked for that, and **"even traders don't have time to go through
these heavy articles."** He is right, and the phrase is withdrawn. Expertise
was never the problem; length and density were.

### Blog articles: the Investopedia shape

Binding for every post, foundations first and the rest as they are rewritten.

- **Definition in the first sentence.** The term, bolded, defined plainly. No
  preamble, no scene-setting. A reader who reads only sentence one has the
  definition.
- **Key Takeaways** near the top: 3–5 standalone bullets. A reader who reads
  only the box gets the article.
- **Plain question headings** — "How does a call option work?" Not clever.
- **Paragraphs of 2–3 sentences.** Split anything longer.
- **One worked example**, labelled, with arithmetic the reader can check.
- **A table** wherever two things are compared.
- **FAQ** (3–4 real beginner questions) and **The Bottom Line** to close.
- **900–1,200 words**, hard ceiling 1,300. If it will not fit, it is two
  posts. For scale, the 2,143-word `credit-spread-max-loss` is what this rule
  exists to prevent.
- Define every term the first time it appears, in the same sentence.

### Diagrams

Diagrams beat text when they are done right — and ours were not. The eight
SVGs written before 9 Sep carry **53 to 149 words each**; one holds 138 words
across 23 text nodes. That is a paragraph rendered as a picture, and it made
the articles harder, not easier.

- **Hard cap: 15 words inside the frame.** Labels only — a noun, a number,
  what an arrow means.
- Any sentence belongs in the prose underneath, where it can be skipped.
- One idea per diagram. Two ideas means two diagrams, or one fewer.
- Legible on a phone at a glance: large type, few elements, generous space.
- The full description goes in the `alt` attribute and does not count.
- Test: cover the prose. If the diagram still lands one clear idea it works;
  if it reads like a slide someone talked over, it fails.

What does **not** change: the compliance rules, and the honesty — say plainly
what a thing does not do and where a figure stops being true. Investopedia's
shape, our accuracy. Simple is not condescending.

House habits worth keeping, observed across the app: notices explain *why*
("unrealized is not a result"), errors state what happened and what was not
changed, and figures that cannot be trusted render as **—**, never as a
substitute number.

## Feature names — one name each

| Canonical | Not |
| --- | --- |
| Dashboard | Positions Monitor, monitor page, positions |
| Strategy Scanner (short: Scanner) | Market Scanner, screener, finder |
| Trade History | journal, log |
| Analysis | analytics, stats, performance page |
| Accounts / Connect Alpaca | link, sync accounts |
| Audit against broker feed | rebuild, preview (admin-only surface) |

**Strategy Scanner**, renamed by the owner on 14 Sep, replacing "Screener" —
and the row above is reversed from what it said that morning, when "scanner"
was the word to avoid. His reason: *"this is a scanner not a screener"*, and
the page agrees with him. A screener filters a list you already hold; this
sweeps option chains it fetches, strike by strike and expiry by expiry, and
builds structures that did not exist before the sweep. The old word described
the wrong verb.

**"Market Scanner" was the first replacement and lasted an hour**, because it
is false on the page's own screen. Pick Covered call and the config says *"the
universe above is ignored"* and the button reads *"Scan shares held"* — it
sweeps the account's book, not a market. The Wheel is half each way: puts on
the universe, calls on the shares held. "Strategy" is also the more honest
half of the description, naming what comes BACK — a built spread with strikes,
credit, break-even and return on risk — rather than where it looked, which is
the part every broker's scanner also does.

Not a licence to imply we choose the strategy. The trader picks it before
anything is swept, and results copy stays as it is: what matched the filters
you set, nothing recommended (compliance rules 2 and 3).

**The nav says the full name.** The owner asked for it there on 14 Sep, and it
is the right place for it: the menu is where someone learns what a screen is
called, and the heading they land on then matches the link they clicked.
"Scanner" alone stays correct in running prose once the full name has already
appeared. "Market Scanner" is retired; do not reintroduce it.

The stored value stays `screener`. `scan_presets.scope` is a CHECK-constrained
column holding every user's saved presets, and the string is an internal key no
one sees. Renaming it would buy nothing and would need a migration on both
projects to avoid orphaning saved presets. The JS constant reads `SCOPE.SCANNER`
so the code says the product's word; only the value on the wire is the old one,
and it is commented where it is defined.

**Dashboard**, renamed by the owner on 12 Sep, replacing "Positions Monitor".
The table above previously listed "dashboard" as the thing NOT to say, and the
nav had been saying it anyway while the page heading said the other — so the
two names were being used against each other in one click. One name, his.

### The two Analysis views

| Canonical | Not |
| --- | --- |
| Whole view | full view, total view, everything view, mark-to-market |
| Premium only | premium view, options only, realized only, cash view |

Named by the owner on 10 Sep and registered here before the copy set a
precedent. **Whole view** is realized money plus the unrealized gain or loss on
shares still held; **Premium only** is the option legs alone — credits taken,
debits paid, and what closing them cost or returned.

Two things neither name may be made to say. Premium only is **not a tax view**:
it excludes share sales, which are the largest lines on a wheel trader's
1099-B, and on an assigned put the premium reduces the stock basis rather than
standing alone as income. And it is not "what selling options banked": the
figure is signed and includes debits paid on bought options — three such rows
on the owner's own account contribute +$805 between them.

### Quantity a broker will not release

| Canonical | Not |
| --- | --- |
| Available to close | free, unencumbered, releasable |
| Collateral for a short / committed to a working order | held, locked, tied up, unfree |

The owner, 9 Sep, reading a multi-close panel on his own live account: *"It
shouldn't be called free. This is so confusing. Just now I realized what you
meant."* **Free** is an engineer's word for `qty_available` and it reads as
free of charge. Say what the number lets him do — close this line — and say
the reason as the broker's, not the app's.

Two rules on top of the words. **"To close", not "for sale"**: closing a short
is a buy, and half the rows on the Broker tab are shorts. And never guess which
reason applies — `qty_available` does not say whether it is collateral or a
working order, so the copy names both and picks neither.

## Surfaces the audit walks

The app (`src/`), landing (`landing/`), blog (`content/blog/`), auth emails
(`supabase/auth/`), the exported PDF (`ExportPdfButton.jsx`), and the live
pages at `deltamint.app` and `dashboard.deltamint.app`.
