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

The register is fixed by `growth/playbook.md` and binding: *a trader
explaining something to another trader* — concrete numbers, admitted
uncertainty, no adjectives doing the work of evidence, no exclamation marks,
no emoji in headings. Compliance vocabulary (use/avoid lists) is the floor;
this book adds consistency on top.

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

## Surfaces the audit walks

The app (`src/`), landing (`landing/`), blog (`content/blog/`), auth emails
(`supabase/auth/`), the exported PDF (`ExportPdfButton.jsx`), and the live
pages at `deltamint.app` and `dashboard.deltamint.app`.
