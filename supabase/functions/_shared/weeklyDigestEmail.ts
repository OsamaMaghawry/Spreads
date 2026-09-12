// Turning ONE ACCOUNT'S week into the email it gets.
//
// Kept apart from `weeklyDigest.ts` so the FIGURES can be tested without the
// markup and the MARKUP without a database. Pure: no Deno, no fetch, no env.
//
// ONE ACCOUNT, ONE EMAIL. The first build summed every account a person holds
// into one message with a combined headline. The owner, reading it:
//
//   *"Each account should have the premium and stocks moves and then if you
//   want to mix them all it's okay, but not necessarily as most probably will
//   be only one live and the rest demo. So no point of summing them all. At
//   least for now. Most importantly, each account should be having the
//   information. [...] Each account should be in a separate email. I need
//   exactly to see things as if it's real."*
//
// He is right, and the reason is not only presentation. A person holding one
// live account and three paper ones has no use for a number that adds them --
// there is no portfolio that contains both, and the combined figure describes
// nothing anybody owns. Worse, it was the figure in the subject line. Per
// account, every number in the email is about one real book, and the paper
// label sits on the whole message rather than on a block inside it.
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
// simulated in the subject line, the header and the footer, because this is
// the one place the product's figures leave the product and land somewhere
// they can be quoted without their context.

import type { AccountWeek, Window } from "./weeklyDigest.ts";
import type { Snapshot } from "./weeklySnapshot.ts";

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


const qty = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(Number(n))
    ? DASH
    : Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });

// WHAT THE ACCOUNT HOLDS. The owner: *"It's not about trades, it's about the
// account itself. If someone trades LEAPS, and have equities, they should
// receive email too."* So this is the first thing in the message and it is
// present whether or not a single trade happened in the week.
const holdingsPanel = (s: Snapshot) => {
  if (!s.read) {
    return panel(
      "What you hold",
      row("Positions", DASH, BRAND.sub),
      "We could not reach your broker for this account when the email was built, so this is blank rather than empty. It is not a statement that you hold nothing."
    );
  }
  if (s.empty) {
    return panel(
      "What you hold",
      row("Open positions", "0") + row("Working orders", "0"),
      "Your broker reports nothing open in this account and no orders working."
    );
  }
  const optionRows = s.options
    .slice()
    .sort((a: any, b: any) => Math.abs(Number(b.marketValue) || 0) - Math.abs(Number(a.marketValue) || 0))
    .slice(0, 12)
    .map((p: any) => {
      const label = `${esc(p.ticker)} ${p.strike ?? ""}${p.optionType || ""}`.trim();
      const when = p.expiry ? ` exp ${esc(prettyDate(p.expiry))}` : "";
      return `
      <tr>
        <td style="font:400 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};">
          ${label}<div style="font-size:11px;color:${BRAND.sub};">${p.side === "short" ? "short" : "long"} ${qty(Math.abs(p.qty))}${when}</div>
        </td>
        <td align="right" style="font:600 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};white-space:nowrap;">
          ${esc(money(p.marketValue))}
          <div style="font-size:11px;font-weight:400;color:${colourFor(p.unrealizedPL)};">${esc(money(p.unrealizedPL, true))}</div>
        </td>
      </tr>`;
    })
    .join("");

  const shareRows = s.shares
    .slice()
    .sort((a: any, b: any) => Math.abs(Number(b.marketValue) || 0) - Math.abs(Number(a.marketValue) || 0))
    .slice(0, 12)
    .map((p: any) => `
      <tr>
        <td style="font:400 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};">
          ${esc(p.ticker)}<div style="font-size:11px;color:${BRAND.sub};">${qty(p.qty)} shares at ${esc(money(p.avgEntryPrice))}</div>
        </td>
        <td align="right" style="font:600 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};white-space:nowrap;">
          ${esc(money(p.marketValue))}
          <div style="font-size:11px;font-weight:400;color:${colourFor(p.unrealizedPL)};">${esc(money(p.unrealizedPL, true))}</div>
        </td>
      </tr>`)
    .join("");

  const head = (what: string) => `
    <tr><td colspan="2" style="font:700 11px ${FONT};color:${BRAND.sub};text-transform:uppercase;letter-spacing:.06em;padding:14px 0 6px;">${what}</td></tr>`;

  return panel(
    "What you hold",
    (s.shareCount ? head(`Shares — ${s.shareCount} ${s.shareCount === 1 ? "position" : "positions"}`) + shareRows : "") +
      (s.optionCount ? head(`Option legs — ${s.optionCount}`) + optionRows : ""),
    "Your broker's own quantities and marks, as they stand now. Unrealized figures move until a position is closed."
  );
};

// WORKING ORDERS. Asked for by name: *"and if any open orders."*
const ordersPanel = (s: Snapshot) => {
  if (!s.read || s.openOrderCount === null) return "";
  if (s.openOrderCount === 0) return "";
  const rows = s.openOrders
    .slice(0, 10)
    .map((o) => `
      <tr>
        <td style="font:400 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};">
          ${esc(o.symbol)}<div style="font-size:11px;color:${BRAND.sub};">${esc(o.side)} ${qty(o.qty)}${o.legs > 1 ? ` · ${o.legs} legs` : ""} · ${esc(o.type)}</div>
        </td>
        <td align="right" style="font:600 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};white-space:nowrap;">
          ${o.limitPrice === null ? esc(o.type) : esc(money(o.limitPrice))}
        </td>
      </tr>`)
    .join("");
  return panel(
    `Still working — ${s.openOrderCount} order${s.openOrderCount === 1 ? "" : "s"}`,
    rows,
    "Orders your broker still has open. They can be changed or cancelled from the Orders tab."
  );
};

// THE ACCOUNT, from the broker rather than from our reconstruction.
const brokerAccountPanel = (s: Snapshot) =>
  panel(
    "The account",
    [
      row("Account value", money(s.equity), BRAND.text,
        s.equity === null ? "Your broker did not answer when this email was built." : "Cash plus everything held, as your broker reports it."),
      row("Cash", money(s.cash), BRAND.text),
      row("Shares at market", money(s.sharesValue), BRAND.text),
      row("Option legs at market", money(s.optionsValue), BRAND.text,
        "A short leg's market value is negative: it is what it would cost to buy back.")
    ].join("")
  );

// The one number at the top, and it is THIS ACCOUNT's. Its label carries what
// it counts, because a figure this size is the thing that gets quoted alone.
const hero = (a: AccountWeek) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:24px 20px;text-align:center;">
      <div style="font:700 12px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${BRAND.sub};">
        This account's week${a.isPaper ? " (simulated)" : ""}
      </div>
      <div style="font:700 38px ${FONT};color:${colourFor(a.performance)};margin:8px 0 4px;letter-spacing:-.02em;">
        ${esc(money(a.performance, true))}
      </div>
      <div style="font:400 12px ${FONT};color:${BRAND.sub};line-height:1.6;max-width:430px;margin:0 auto;">
        ${a.performance === null
          ? (a.measured
              ? "Part of this book could not be valued this week, so there is no whole-account figure. The parts that could be are below."
              : "We are still building this account's day-by-day history, so there is no figure for the week yet. Anything it traded is below.")
          : "Option legs closed, shares sold, and the change in the mark on everything the account held — measured from the previous Friday's close to this one."}
      </div>
    </td></tr>
  </table>`;

// PREMIUM AND STOCK SIDE BY SIDE, per account, which is the owner's first ask:
// "each account should have the premium and stocks moves".
const premiumPanel = (a: AccountWeek) =>
  panel(
    "Premium",
    [
      row("Collected on positions opened", money(a.premium.collected),
        a.premium.collected > 0 ? BRAND.positive : BRAND.text,
        "Cash taken in when you sold to open this week."),
      a.premium.paidToOpen > 0
        ? row("Paid to open bought positions", money(a.premium.paidToOpen), BRAND.negative,
            "Debit paid where you bought rather than sold.")
        : "",
      row("Paid to close positions", money(a.premium.paidToClose),
        a.premium.paidToClose > 0 ? BRAND.negative : BRAND.text,
        "What buying positions back cost. Nothing on a leg that expired."),
      row("Kept on what closed", money(a.premium.kept, true), colourFor(a.premium.kept),
        "The option legs' own result on trades that closed this week — credits taken less debits paid.")
    ].join(""),
    "Cash in and cash out are separate from the outcome: a credit taken this week on a position still open has not been kept yet."
  );

const stockPanel = (a: AccountWeek) =>
  panel(
    "Stock",
    [
      row("Shares still held", money(a.sharesValue), BRAND.text, "At Friday's closing price."),
      row("Move on shares held this week", money(a.sharesMark, true), colourFor(a.sharesMark),
        "Unrealized. None of it is booked and it moves until you sell."),
      row("Booked on shares sold", money(a.sharesBooked, true), colourFor(a.sharesBooked),
        "Realized result of share lots that left the account this week."),
      row("Move in the option book", money(a.optionsMark, true), colourFor(a.optionsMark),
        "Unrealized. A short leg's figure is a credit taken against what it would cost to buy back now.")
    ].join("")
  );

const accountPanel = (a: AccountWeek) =>
  panel(
    "The account",
    [
      row("Account value at Friday's close", money(a.equityEnd), BRAND.text,
        "Your broker's own figure: cash plus everything held."),
      row("Change in account value", money(a.equityChange, true), colourFor(a.equityChange),
        "Moves with deposits and withdrawals too, which is why it is not added to anything above."),
      row("Positions closed", `${a.closed.count}`, BRAND.text,
        a.closed.count ? `${a.closed.winners} up, ${a.closed.expired} expired` : ""),
      row("Positions opened", `${a.opened.count}`, BRAND.text),
      row("Realized on what closed", money(a.closed.realized, true), colourFor(a.closed.realized),
        "Option legs and any share result the close delivered.")
    ].join("")
  );

const tradeTable = (a: AccountWeek) => {
  if (!a.closed.rows.length) return "";
  const head = `
    <tr>
      <th align="left" style="font:700 11px ${FONT};color:${BRAND.sub};text-transform:uppercase;letter-spacing:.06em;padding:0 0 6px;border-bottom:1px solid ${BRAND.line};">Position</th>
      <th align="left" style="font:700 11px ${FONT};color:${BRAND.sub};text-transform:uppercase;letter-spacing:.06em;padding:0 0 6px;border-bottom:1px solid ${BRAND.line};">How it ended</th>
      <th align="right" style="font:700 11px ${FONT};color:${BRAND.sub};text-transform:uppercase;letter-spacing:.06em;padding:0 0 6px;border-bottom:1px solid ${BRAND.line};">Result</th>
    </tr>`;
  const rows = a.closed.rows
    .slice()
    .sort((x, y) => Math.abs(Number(y.realized_pl) || 0) - Math.abs(Number(x.realized_pl) || 0))
    .slice(0, 10)
    .map((t) => {
      const pl = Number(t.realized_pl);
      const label = `${t.ticker || ""}${t.short_strike ? ` ${t.short_strike}` : ""}`;
      return `
      <tr>
        <td style="font:400 13px ${FONT};color:${BRAND.text};padding:8px 0;border-bottom:1px solid ${BRAND.line};">${esc(label)}</td>
        <td style="font:400 12px ${FONT};color:${BRAND.sub};padding:8px 0;border-bottom:1px solid ${BRAND.line};">${esc(t.close_reason || "closed")} ${esc(t.close_date ? prettyDate(t.close_date) : "")}</td>
        <td align="right" style="font:600 13px ${FONT};color:${colourFor(Number.isFinite(pl) ? pl : null)};padding:8px 0;border-bottom:1px solid ${BRAND.line};white-space:nowrap;">${esc(money(Number.isFinite(pl) ? pl : null, true))}</td>
      </tr>`;
    })
    .join("");
  const more = a.closed.rows.length > 10
    ? `<tr><td colspan="3" style="font:400 11px ${FONT};color:${BRAND.sub};padding:8px 0 0;">and ${a.closed.rows.length - 10} more</td></tr>`
    : "";
  return panel("What closed this week", head + rows + more);
};

const unpricedNote = (a: AccountWeek) => {
  if (!a.unpriced.length) return "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6E9;border:1px solid #F0E0C0;border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:14px 18px;font:400 12px ${FONT};color:${BRAND.warning};line-height:1.6;">
      <strong>Some of the week could not be valued.</strong> ${esc(a.unpriced.join(", "))} had at least one day with no usable price,
      so any figure that depends on ${a.unpriced.length === 1 ? "it" : "them"} shows as ${DASH} rather than as a number we guessed.
    </td></tr>
  </table>`;
};

// WHAT THIS EMAIL LEFT OUT, IN DOLLARS.
//
// The audit layer filters withheld rows out of the digest's query, and the
// first version of that filter went in with no corresponding line here. The
// compliance gate called it blocking and was right: email is the worst surface
// in the product for a silently short figure, because the reader cannot click
// through to the note beside it, cannot re-run the week, and the number arrives
// looking settled.
//
// The existing "some of the week could not be valued" note is not this. That
// one is about a missing PRICE; this is about arithmetic of ours that produced
// a result the position could not reach.
const withheldNote = (a: AccountWeek) => {
  if (!a.withheld || !a.withheld.count) return "";
  const n = a.withheld.count;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF0F0;border:1px solid #F0D0D0;border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:14px 18px;font:400 12px ${FONT};color:${BRAND.negative};line-height:1.6;">
      <strong>${n} ${n === 1 ? "trade is" : "trades are"} missing from these figures.</strong>
      ${n === 1 ? "It computes" : "They compute"} to ${money(a.withheld.realized, true)}, which is more than
      ${n === 1 ? "its own strikes can" : "their own strikes can"} lose &mdash; so the arithmetic is ours to fix and
      the ${n === 1 ? "figure is" : "figures are"} left out rather than shown. Your broker's own total includes
      ${n === 1 ? "it" : "them"}. ${n === 1 ? "The trade" : "The trades"} happened exactly as your broker recorded
      ${n === 1 ? "it" : "them"}.
    </td></tr>
  </table>`;
};

// ---------------------------------------------------------------------------
// One account's email
// ---------------------------------------------------------------------------

export function renderAccountWeek(
  a: AccountWeek,
  win: Window,
  snap: Snapshot | null,
  opts: {
    appUrl?: string;
    // Set when this copy is going to the owner for review rather than to the
    // person it is about. Stamped at the TOP, in a colour nothing else uses,
    // because the one thing that must never happen is the owner reading
    // somebody else's account as his own.
    previewFor?: string | null;
    unsubscribeUrl?: string | null;
  } = {}
): { subject: string; html: string; text: string } {
  const app = opts.appUrl || "https://dashboard.deltamint.app";
  const span = `${prettyDate(win.from)}–${prettyDate(win.to)}`;

  // The ACCOUNT NAME leads the subject, because a person with four accounts
  // now receives four of these and the inbox has to tell them apart at a
  // glance without opening one.
  // THE SUBJECT DESCRIBES THE ACCOUNT, not only the week's trading. An
  // account holding six option legs and a thousand shares that happened to
  // trade nothing is not "nothing traded" -- that subject line is what made
  // the first send read as empty. The week's figure leads when we have one we
  // can stand behind; otherwise what is held does.
  const held = snap && snap.read && !snap.empty
    ? [snap.shareCount ? `${snap.shareCount} stock` : "", snap.optionCount ? `${snap.optionCount} option legs` : ""]
        .filter(Boolean).join(", ")
    : "";
  const subject = a.performance !== null
    ? `${a.name} — ${span}: ${money(a.performance, true)}${a.isPaper ? " (paper)" : ""}`
    : held
      ? `${a.name} — ${span}: holding ${held}${a.isPaper ? " (paper)" : ""}`
      : `${a.name} — ${span}: nothing open${a.isPaper ? " (paper)" : ""}`;

  const preview = opts.previewFor
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.accent};border-radius:12px;margin:0 0 16px;">
         <tr><td style="padding:14px 18px;font:600 13px ${FONT};color:#FFFFFF;line-height:1.6;">
           REVIEW COPY — this is the email <strong>${esc(opts.previewFor)}</strong> would receive for this account. It has not been sent to them.
         </td></tr>
       </table>`
    : "";

  const paperBanner = a.isPaper
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6E9;border:1px solid #F0E0C0;border-radius:12px;margin:0 0 16px;">
         <tr><td style="padding:12px 18px;font:600 13px ${FONT};color:${BRAND.warning};line-height:1.5;">
           Paper account — every figure below is simulated, not real money.
         </td></tr>
       </table>`
    : "";

  // ORDER OF THE MESSAGE, and it is the owner's: *"an account snapshot in
  // general should be sent. It's not about trades, it's about the account
  // itself."* So what is held comes first and is always present; the week's
  // trading follows it. A week with no trades still has an account in it.
  const traded = a.closed.count > 0 || a.opened.count > 0;
  const weekBlocks = traded
    ? [premiumPanel(a), withheldNote(a), unpricedNote(a), tradeTable(a)].join("")
    : panel(
        "This week's trading",
        row("Positions closed", "0") + row("Positions opened", "0"),
        "Nothing opened and nothing closed in this account this week. What it holds is above."
      );

  const body = [
    snap ? holdingsPanel(snap) : "",
    snap ? ordersPanel(snap) : "",
    snap ? brokerAccountPanel(snap) : accountPanel(a),
    // The week's own result only where the stored series could produce one we
    // can stand behind. Where it could not, the section is absent rather than
    // a grid of dashes -- see hero().
    a.performance !== null ? hero(a) : "",
    weekBlocks,
    a.performance !== null ? stockPanel(a) : ""
  ].join("");

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="padding:0 0 18px;">
        <div style="font:700 20px ${FONT};color:${BRAND.text};letter-spacing:-.02em;">DeltaMint</div>
        <div style="font:600 15px ${FONT};color:${BRAND.text};margin-top:6px;">${esc(a.name)}</div>
        <div style="font:400 13px ${FONT};color:${BRAND.sub};margin-top:2px;">Your week, ${esc(span)}</div>
      </td></tr>
      <tr><td>
        ${preview}
        ${paperBanner}
        ${body}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:6px 0 18px;">
            <a href="${esc(app)}" style="display:inline-block;background:${BRAND.accent};color:#FFFFFF;font:600 14px ${FONT};text-decoration:none;padding:11px 22px;border-radius:9px;">Open your dashboard</a>
          </td></tr>
        </table>
        <div style="font:400 11px ${FONT};color:${BRAND.sub};line-height:1.7;padding:4px 4px 0;">
          This is a record of one of your own accounts, not advice, a recommendation or a signal. Nothing here
          tells you what to do next. Figures are reconstructed from your broker's own trade and price
          history and can differ from your broker's statement; your broker's statement is the record.
          Unrealized figures are marks, not money: they move until a position is closed.
          ${a.isPaper ? "This is a paper account and its money is simulated." : ""}
          ${opts.unsubscribeUrl ? `<br><a href="${esc(opts.unsubscribeUrl)}" style="color:${BRAND.sub};">Stop receiving these weekly emails</a>` : ""}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`;

  const line = (l: string, v: string) => `${l}: ${v}`;
  const text = [
    opts.previewFor ? `REVIEW COPY — the email ${opts.previewFor} would receive for this account. Not sent to them.` : "",
    `DeltaMint — ${a.name}${a.isPaper ? " (paper — simulated money)" : ""}`,
    `Your week, ${span}`,
    "",
    a.quiet
      ? "Nothing opened, nothing closed, and nothing held in this account this week."
      : [
          line("This account's week", money(a.performance, true)),
          "",
          "PREMIUM",
          line("  Collected on positions opened", money(a.premium.collected)),
          line("  Paid to close positions", money(a.premium.paidToClose)),
          line("  Kept on what closed", money(a.premium.kept, true)),
          "",
          "STOCK",
          line("  Shares still held", money(a.sharesValue)),
          line("  Move on shares held", money(a.sharesMark, true)),
          line("  Booked on shares sold", money(a.sharesBooked, true)),
          line("  Move in the option book", money(a.optionsMark, true)),
          "",
          "THE ACCOUNT",
          line("  Account value at Friday's close", money(a.equityEnd)),
          line("  Change in account value", money(a.equityChange, true)),
          line("  Closed", String(a.closed.count)),
          line("  Opened", String(a.opened.count)),
          line("  Realized", money(a.closed.realized, true))
        ].join("\n"),
    "",
    app,
    "",
    "A record of one of your own accounts, not advice, a recommendation or a signal.",
    "Your broker's statement is the record. Unrealized figures are marks, not money."
  ]
    .filter((s) => s !== "")
    .join("\n");

  return { subject, html, text };
}
