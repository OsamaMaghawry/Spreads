# DeltaMint — brand book

Owned by `head-of-branding`, accepted by `vp-product`. This is the baseline as
the product actually is on 31 Aug 2026, recorded so the audit measures drift
against something. Rules marked **(proposed)** await the owner; everything
else is observed current practice.

## The name

- Prose and titles: **DeltaMint** — one word, camel-case.
- The logotype: **deltamint**, lowercase, with **mint** in the green
  (`#3FA672`) and **delta** in the text colour, beside the twin-peak mark.
- Never: "Delta Mint", "Deltamint", "DELTAMINT".

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
| Positions Monitor | dashboard, monitor page |
| Screener | scanner, finder |
| Trade History | journal, log |
| Analysis | analytics, stats, performance page |
| Accounts / Connect Alpaca | link, sync accounts |
| Audit against broker feed | rebuild, preview (admin-only surface) |

**(proposed)** "Scanner" appears in some copy where "Screener" is meant; the
first audit should sweep it.

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
