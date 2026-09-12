// Turning one person's week into the email they receive.
//
// Kept apart from `weeklyDigest.ts` so the FIGURES can be tested without the
// markup and the MARKUP without a database. Pure: no Deno, no fetch, no env.
//
// WHY IT IS TABLES AND INLINE STYLES. Mail clients are not browsers. Outlook
// renders with Word's engine, Gmail strips <style> blocks on forwards, and
// flexbox, grid and CSS variables are all unreliable across the set. So this
// is 600px tables with inline styles -- the boring thing that renders the same
// everywhere -- and the brand comes through colour and hierarchy rather than
// layout tricks. The brand faces are not webfonts here either: an email that
// waits on fonts.googleapis.com shows a flash of nothing or is blocked
// outright, so the stack is the system one with the brand's colours on top.
//
// WHAT THIS EMAIL MAY NOT DO. Compliance rules 5 and 6. It reports; it never
// advises. No position is called good or bad, nothing is ranked, no action is
// suggested, and no figure is projected forward. A paper account is labelled
// simulated in the subject line, the header and beside every one of its
// numbers, because this is the one place the product's figures leave the
// product and land somewhere they can be quoted without their context.

import type { UserWeek, AccountWeek } from "./weeklyDigest.ts";

const BRAND = {
  bg: "#F6F5FB",
  panel: "#FFFFFF",
  line: "#E1DEF2",
  accent: "#534AB7",
  text: "#201B3A",
  sub: "#6A6294",
  positive: "#0F6E56",
  negative: "#993C1D",
  warning: "#854F0B"
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// A dash is the house answer for a figure that cannot be trusted, and it is
// never a substitute number. Everywhere one appears the caller adds why.
export const DASH = "—";

export function money(v: number | null | undefined, withSign = false): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return DASH;
  const n = Number(v);
  const body = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? "-" : withSign ? "+" : "";
  return `${sign}$${body}`;
}

const colourFor = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? BRAND.sub
    : Number(v) >= 0
      ? BRAND.positive
      : BRAND.negative;

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const prettyDate = (d: string) => {
  const [y, m, day] = String(d).split("-").map(Number);
  if (!y || !m || !day) return String(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${day}`;
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const row = (label: string, value: string, colour = BRAND.text, note = "") => `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font:400 14px ${FONT};color:${BRAND.sub};">
      ${esc(label)}${note ? `<div style="font-size:11px;color:${BRAND.sub};line-height:1.4;margin-top:2px;">${esc(note)}</div>` : ""}
    </td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font:600 15px ${FONT};color:${colour};white-space:nowrap;">
      ${esc(value)}
    </td>
  </tr>`;

const panel = (title: string, inner: string, subtitle = "") => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:18px 20px;">
      <div style="font:700 12px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${BRAND.sub};">${esc(title)}</div>
      ${subtitle ? `<div style="font:400 12px ${FONT};color:${BRAND.sub};margin-top:4px;line-height:1.5;">${esc(subtitle)}</div>` : ""}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">${inner}</table>
    </td></tr>
  </table>`;

// The one number at the top. Its LABEL carries what it counts, because a
// figure this size is the thing that gets quoted on its own.
const hero = (w: UserWeek) => {
  const t = w.hasLive ? w.live : w.paper;
  const paperOnly = !w.hasLive;
  const v = t.performance;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:24px 20px;text-align:center;">
      <div style="font:700 12px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${BRAND.sub};">
        Your positions this week${paperOnly ? " (simulated)" : ""}
      </div>
      <div style="font:700 38px ${FONT};color:${colourFor(v)};margin:8px 0 4px;letter-spacing:-.02em;">
        ${esc(money(v, true))}
      </div>
      <div style="font:400 12px ${FONT};color:${BRAND.sub};line-height:1.6;max-width:420px;margin:0 auto;">
        ${v === null
          ? "Part of the book could not be valued this week, so there is no whole-account figure. The parts that could be are below."
          : "Option legs closed, shares sold, and the change in what is still open — all of it, measured from last Friday's close to this one."}
      </div>
    </td></tr>
  </table>`;
};

const premiumPanel = (w: UserWeek) => {
  const t = w.hasLive ? w.live : w.paper;
  return panel(
    "Premium",
    [
      row("Collected on positions opened", money(t.premiumCollected), t.premiumCollected > 0 ? BRAND.positive : BRAND.text,
        "Cash taken in when you sold to open this week."),
      row("Paid to close positions", money(t.premiumPaidToClose), t.premiumPaidToClose > 0 ? BRAND.negative : BRAND.text,
        "What buying positions back cost. Nothing on a leg that expired."),
      row("Kept on what closed", money(t.premiumKept, true), colourFor(t.premiumKept),
        "The option legs' own result on trades that closed this week — credits taken less debits paid.")
    ].join(""),
    "Cash in and cash out are separate from the outcome: a credit taken this week on a position that is still open has not been kept yet."
  );
};

const portfolioPanel = (w: UserWeek) => {
  // Measured accounts only. An account with no stored history for the week is
  // not an account that could not be valued -- it is one nobody has opened --
  // and letting it null these totals would tell a reader their whole portfolio
  // was unreadable because of an empty account they connected once. It is
  // named instead, by `unmeasuredNote` directly below this panel.
  const measured = w.accounts.filter((a) => a.measured);
  const accts = measured.filter((a) => !a.isPaper).length ? measured.filter((a) => !a.isPaper) : measured;
  const equityEnd = accts.reduce<number | null>(
    (s, a) => (s === null || a.equityEnd === null ? null : s + a.equityEnd), 0
  );
  const equityChange = accts.reduce<number | null>(
    (s, a) => (s === null || a.equityChange === null ? null : s + a.equityChange), 0
  );
  const shares = accts.reduce<number | null>(
    (s, a) => (s === null || a.sharesValue === null ? null : s + a.sharesValue), 0
  );
  const sharesMark = accts.reduce<number | null>(
    (s, a) => (s === null || a.sharesMark === null ? null : s + a.sharesMark), 0
  );
  const optionsMark = accts.reduce<number | null>(
    (s, a) => (s === null || a.optionsMark === null ? null : s + a.optionsMark), 0
  );
  return panel(
    "Your portfolio",
    [
      row("Account value at Friday's close", money(equityEnd), BRAND.text,
        "Your broker's own figure: cash plus everything held."),
      row("Change in account value", money(equityChange, true), colourFor(equityChange),
        "Moves with deposits and withdrawals too, which is why it is not added to anything above."),
      row("Shares still held", money(shares), BRAND.text, "At Friday's closing price."),
      row("Shares — move this week", money(sharesMark, true), colourFor(sharesMark),
        "Unrealized. None of it is booked and it moves until you sell."),
      row("Open option legs — move this week", money(optionsMark, true), colourFor(optionsMark),
        "Unrealized. A short leg's figure is a credit taken against what it would cost to buy back now.")
    ].join("")
  );
};

const tradeTable = (a: AccountWeek) => {
  if (!a.closed.rows.length) return "";
  const head = `
    <tr>
      <th align="left" style="font:700 11px ${FONT};color:${BRAND.sub};text-transform:uppercase;letter-spacing:.06em;padding:0 0 6px;border-bottom:1px solid ${BRAND.line};">Closed</th>
      <th align="left" style="font:700 11px ${FONT};color:${BRAND.sub};text-transform:uppercase;letter-spacing:.06em;padding:0 0 6px;border-bottom:1px solid ${BRAND.line};">How</th>
      <th align="right" style="font:700 11px ${FONT};color:${BRAND.sub};text-transform:uppercase;letter-spacing:.06em;padding:0 0 6px;border-bottom:1px solid ${BRAND.line};">Result</th>
    </tr>`;
  // Biggest movers first, and capped: an email is a summary, and the full
  // ledger is a click away rather than forty rows deep in an inbox.
  const rows = a.closed.rows
    .slice()
    .sort((x, y) => Math.abs(Number(y.realized_pl) || 0) - Math.abs(Number(x.realized_pl) || 0))
    .slice(0, 8)
    .map((t) => {
      const pl = Number(t.realized_pl);
      const label = `${t.ticker || ""}${t.short_strike ? ` ${t.short_strike}` : ""}`;
      return `
      <tr>
        <td style="font:400 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};">${esc(label)}</td>
        <td style="font:400 12px ${FONT};color:${BRAND.sub};padding:8px 0;border-bottom:1px solid ${BRAND.line};">${esc(t.close_reason === "expired" ? "expired" : "closed")} ${esc(t.close_date ? prettyDate(t.close_date) : "")}</td>
        <td align="right" style="font:600 13px ${FONT};color:${colourFor(Number.isFinite(pl) ? pl : null)};padding:8px 0;border-bottom:1px solid ${BRAND.line};white-space:nowrap;">${esc(money(Number.isFinite(pl) ? pl : null, true))}</td>
      </tr>`;
    })
    .join("");
  const more = a.closed.rows.length > 8
    ? `<tr><td colspan="3" style="font:400 11px ${FONT};color:${BRAND.sub};padding:8px 0 0;">and ${a.closed.rows.length - 8} more</td></tr>`
    : "";
  return head + rows + more;
};

const accountPanel = (a: AccountWeek) => {
  const title = a.isPaper ? `${a.name} — paper` : a.name;
  const inner = [
    row("This account's week", money(a.performance, true), colourFor(a.performance)),
    row("Closed", `${a.closed.count} position${a.closed.count === 1 ? "" : "s"}`, BRAND.text,
      a.closed.count ? `${a.closed.winners} up, ${a.closed.expired} expired` : ""),
    row("Opened", `${a.opened.count} position${a.opened.count === 1 ? "" : "s"}`, BRAND.text,
      a.opened.count ? `${money(a.premium.collected)} collected` : "")
  ].join("");
  const trades = tradeTable(a);
  return panel(
    title,
    inner + (trades ? `<tr><td colspan="2" style="padding-top:14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${trades}</table></td></tr>` : ""),
    a.isPaper ? "Simulated money. Every figure in this block is practice, not a result." : ""
  );
};

// An account that is connected but has no stored history for the week. Said
// plainly, because the alternative readings are both wrong: dragging every
// total to "—" over an account nobody has opened, or quietly leaving it out of
// a figure presented as the whole portfolio.
const unmeasuredNote = (w: UserWeek) => {
  if (!w.unmeasured.length) return "";
  const names = w.unmeasured.map((n) => esc(n)).join(", ");
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:14px 18px;font:400 12px ${FONT};color:${BRAND.sub};line-height:1.6;">
      <strong style="color:${BRAND.text};">Not in the portfolio figures above:</strong> ${names}.
      ${w.unmeasured.length === 1 ? "This account has" : "These accounts have"} no stored day-by-day history for this week,
      so ${w.unmeasured.length === 1 ? "it is" : "they are"} left out rather than counted as zero. Trades ${w.unmeasured.length === 1 ? "it" : "they"} closed or opened are still included.
    </td></tr>
  </table>`;
};

const unpricedNote = (w: UserWeek) => {
  const all = [...new Set(w.accounts.flatMap((a) => a.unpriced))].sort();
  if (!all.length) return "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6E9;border:1px solid #F0E0C0;border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:14px 18px;font:400 12px ${FONT};color:${BRAND.warning};line-height:1.6;">
      <strong>Some of the week could not be valued.</strong> ${esc(all.join(", "))} had at least one day with no usable price,
      so any figure that depends on ${all.length === 1 ? "it" : "them"} shows as ${DASH} rather than as a number we guessed.
    </td></tr>
  </table>`;
};

// ---------------------------------------------------------------------------
// The whole thing
// ---------------------------------------------------------------------------

export function renderWeekly(
  w: UserWeek,
  opts: {
    appUrl?: string;
    // Set when this copy is going to the owner for review rather than to the
    // person it is about. It is stamped at the TOP, in a colour nothing else
    // uses, because the one thing that must never happen is the owner reading
    // somebody else's account as his own.
    previewFor?: string | null;
    unsubscribeUrl?: string | null;
  } = {}
): { subject: string; html: string; text: string } {
  const app = opts.appUrl || "https://dashboard.deltamint.app";
  const span = `${prettyDate(w.window.from)}–${prettyDate(w.window.to)}`;
  const t = w.hasLive ? w.live : w.paper;

  const subject = w.quiet
    ? `Your week — ${span}: nothing traded`
    : `Your week — ${span}: ${money(t.performance, true)}${w.hasLive ? "" : " (paper)"}`;

  const preview = opts.previewFor
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.accent};border-radius:12px;margin:0 0 16px;">
         <tr><td style="padding:14px 18px;font:600 13px ${FONT};color:#FFFFFF;line-height:1.6;">
           REVIEW COPY — this is the email <strong>${esc(opts.previewFor)}</strong> would receive. It has not been sent to them.
         </td></tr>
       </table>`
    : "";

  const body = w.quiet
    ? panel(
        "A quiet week",
        row("Positions closed", "0") + row("Positions opened", "0"),
        "Nothing opened, nothing closed, and nothing held. The week is recorded as it happened."
      )
    : [
        hero(w),
        premiumPanel(w),
        portfolioPanel(w),
        unmeasuredNote(w),
        unpricedNote(w),
        w.accounts.length > 1 || w.hasPaper
          ? w.accounts.map(accountPanel).join("")
          : w.accounts.map((a) => (a.closed.rows.length ? accountPanel(a) : "")).join("")
      ].join("");

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="padding:0 0 18px;">
        <div style="font:700 20px ${FONT};color:${BRAND.text};letter-spacing:-.02em;">DeltaMint</div>
        <div style="font:400 13px ${FONT};color:${BRAND.sub};margin-top:2px;">Your week, ${esc(span)}</div>
      </td></tr>
      <tr><td>
        ${preview}
        ${body}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:6px 0 18px;">
            <a href="${esc(app)}" style="display:inline-block;background:${BRAND.accent};color:#FFFFFF;font:600 14px ${FONT};text-decoration:none;padding:11px 22px;border-radius:9px;">Open your dashboard</a>
          </td></tr>
        </table>
        <div style="font:400 11px ${FONT};color:${BRAND.sub};line-height:1.7;padding:4px 4px 0;">
          This is a record of your own account, not advice, a recommendation or a signal. Nothing here
          tells you what to do next. Figures are reconstructed from your broker's own trade and price
          history and can differ from your broker's statement; your broker's statement is the record.
          Unrealized figures are marks, not money: they move until a position is closed.
          ${w.hasPaper ? "Paper accounts are simulated and are labelled wherever they appear." : ""}
          ${opts.unsubscribeUrl ? `<br><a href="${esc(opts.unsubscribeUrl)}" style="color:${BRAND.sub};">Stop receiving this weekly email</a>` : ""}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`;

  const line = (l: string, v: string) => `${l}: ${v}`;
  const text = [
    opts.previewFor ? `REVIEW COPY — the email ${opts.previewFor} would receive. Not sent to them.` : "",
    `DeltaMint — your week, ${span}`,
    "",
    w.quiet
      ? "Nothing opened, nothing closed, and nothing held this week."
      : [
          line("Your positions this week", money(t.performance, true)),
          "",
          "PREMIUM",
          line("  Collected on positions opened", money(t.premiumCollected)),
          line("  Paid to close positions", money(t.premiumPaidToClose)),
          line("  Kept on what closed", money(t.premiumKept, true)),
          "",
          "TRADES",
          line("  Closed", String(t.closed)),
          line("  Opened", String(t.opened)),
          line("  Realized", money(t.realized, true))
        ].join("\n"),
    "",
    app,
    "",
    "A record of your own account, not advice, a recommendation or a signal.",
    "Your broker's statement is the record. Unrealized figures are marks, not money."
  ]
    .filter((s) => s !== "")
    .join("\n");

  return { subject, html, text };
}
