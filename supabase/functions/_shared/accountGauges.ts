// Two small bars at the top of the weekly email, and the arithmetic behind
// them.
//
// The owner asked for three -- collateral, risk and options buying power --
// and then, seeing them: *"I don't want the second graph. If it all went
// wrong."* So the risk bar is gone. It was the only one of the three that
// was ours rather than the broker's, the only one that needed a paragraph to
// explain, and on a wheel account it sits near the top of its track every
// week, which makes it scenery rather than information.
//
// What is left answers the Saturday question: how much of the account is
// already committed, and what is left to work with on Monday.
//
// WHY A BAR AND NOT A CHART. Email clients run no JavaScript, and Gmail strips
// SVG. A chart is therefore a PNG (a fetch the reader's client may block, and
// a figure nobody can select) or it is a table with a coloured cell in it. The
// second is what every email client has rendered identically for twenty years,
// so that is what `barHtml` emits: nested tables, a width in percent, no
// images and no fonts to load.
//
// PURE, so the thresholds and the labelling can be tested without a broker.

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type Gauge = {
  key: string;
  label: string;
  /** The dollars, or null when we could not establish them. */
  value: number | null;
  /** Share of equity, 0..1, or null. */
  share: number | null;
  /** 0..100, clamped for drawing only. `share` is the truth. */
  width: number;
  /** "ok" | "warn" | "hot" | "unknown" -- a band, never advice. */
  band: "ok" | "warn" | "hot" | "unknown";
  /** One plain sentence under the bar. */
  note: string;
};

// The bands are DESCRIPTIVE, not prescriptive, and the wording downstream has
// to keep them that way: compliance rules 5 and 6 mean this email may say what
// is true of the account and may not say what to do about it. "72% of the
// account is committed" is a fact. "Too much is committed" is advice.
//
// Two thirds and nine tenths, because those are the points at which the
// remaining buying power stops covering an ordinary adjustment -- not because
// any number is correct for every trader.
const bandFor = (share: number | null): Gauge["band"] => {
  if (share === null) return "unknown";
  if (share >= 0.9) return "hot";
  if (share >= 0.66) return "warn";
  return "ok";
};

const pct = (share: number | null) =>
  share === null ? "—" : `${Math.round(share * 1000) / 10}%`;

/**
 * The three figures, against equity.
 *
 * @param equity      the broker's own account value
 * @param collateral  what the broker is holding against short positions --
 *                    the full strike on a cash-secured put, the width on a
 *                    spread, the shares themselves on a covered call
 * @param optionsBP   the broker's own options buying power
 *
 * EVERY ONE OF THESE IS NULLABLE and a null renders a dash. The email is the
 * worst surface in the product for a quietly wrong figure: the reader cannot
 * click through, cannot re-run it, and the number arrives looking settled.
 */
export function accountGauges({
  equity,
  collateral,
  optionsBP
}: {
  equity?: number | null;
  collateral?: number | null;
  optionsBP?: number | null;
}): Gauge[] {
  const eq = num(equity);
  const base = eq !== null && eq > 0 ? eq : null;
  const share = (v: number | null) => (base === null || v === null ? null : v / base);

  const col = num(collateral);
  const bp = num(optionsBP);
  const colShare = share(col);
  // Buying power is not a share of equity in the same sense -- it can exceed
  // it on margin -- so its bar is drawn against equity purely as a yardstick
  // and its band is INVERTED: a lot of buying power left is the comfortable
  // end, which is the opposite of the other two.
  const bpShare = share(bp);
  const bpBand: Gauge["band"] =
    bpShare === null ? "unknown" : bpShare >= 0.34 ? "ok" : bpShare >= 0.1 ? "warn" : "hot";

  return [
    {
      key: "collateral",
      label: "Collateral held",
      value: col,
      share: colShare,
      width: colShare === null ? 0 : Math.max(0, Math.min(100, colShare * 100)),
      band: bandFor(colShare),
      note:
        colShare === null
          ? "Could not be read."
          : `Held against positions already open.`
    },
    {
      key: "optionsBP",
      label: "Options buying power",
      value: bp,
      share: bpShare,
      width: bpShare === null ? 0 : Math.max(0, Math.min(100, bpShare * 100)),
      band: bpBand,
      note:
        bp === null
          ? "Your broker did not report this."
          : `Available to open with on Monday.`
    }
  ];
}

const COLOURS: Record<Gauge["band"], string> = {
  ok: "#12B886",
  warn: "#E8A33D",
  hot: "#E03131",
  unknown: "#C9CFD6"
};

/**
 * One bar, as a table an email client will actually render.
 *
 * No images, no SVG, no web fonts. The track is a table cell with a background
 * and a radius; the fill is a nested cell with a percentage width. Outlook
 * ignores the radius and draws squared corners, which is the entire cost.
 */
export function barHtml(g: Gauge, font: string, sub: string, text: string) {
  const colour = COLOURS[g.band];
  const amount =
    g.value === null
      ? "—"
      : `$${Math.abs(g.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // A zero-width fill still needs a cell or the track collapses in Outlook.
  const fill = Math.max(g.width, g.value === null ? 0 : 1.5);
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
  <tr>
    <td style="font:600 12px ${font};color:${text};padding:0 0 5px;">${g.label}</td>
    <td align="right" style="font:700 13px ${font};color:${text};padding:0 0 5px;white-space:nowrap;">
      ${amount}${g.share === null ? "" : ` <span style="font:500 11px ${font};color:${sub};">${pct(g.share)}</span>`}
    </td>
  </tr>
  <tr><td colspan="2" style="padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF0F3;border-radius:5px;">
      <tr><td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" width="${fill}%" cellpadding="0" cellspacing="0" style="background:${colour};border-radius:5px;">
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td colspan="2" style="font:400 11px ${font};color:${sub};padding:5px 0 0;line-height:1.5;">${g.note}</td></tr>
</table>`;
}
