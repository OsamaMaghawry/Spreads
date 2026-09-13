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
import { accountGauges, barHtml } from "./accountGauges.ts";
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

// THE ACCOUNT ITSELF, FIRST, and the three bars that say what is committed.
//
// The owner: *"Make the first section the total account, not the holding, then
// go down to the rest of the email ... I want a clean, easy to read email and
// informative."*
//
// The email used to open with a list of positions and reach the account's own
// value in the third panel, under a heading about the broker. That is the
// wrong way round for a Saturday: the first question is what the account is
// worth and how much of it is already spoken for, and the positions are the
// detail behind the answer.
//
// This panel REPLACES `brokerAccountPanel` rather than sitting above it -- the
// same four figures printed twice under two headings is the opposite of clean.
const accountLead = (a: AccountWeek, s: Snapshot | null) => {
  const equity = s?.equity ?? a.equityEnd;
  const gauges = accountGauges({
    equity,
    collateral: s?.collateral,
    optionsBP: s?.optionsBuyingPower
  });
  const bars = s ? gauges.map((g) => barHtml(g, FONT, BRAND.sub, BRAND.text)).join("") : "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:20px;">
      <div style="font:700 11px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${BRAND.sub};">
        The account${a.isPaper ? " (simulated)" : ""}
      </div>
      <div style="font:700 34px ${FONT};color:${BRAND.text};margin:6px 0 2px;letter-spacing:-.02em;">
        ${esc(money(equity))}
      </div>
      <div style="font:400 12px ${FONT};color:${BRAND.sub};margin:0 0 4px;">
        Your broker's own account value${a.equityChange === null ? "" : ` · ${esc(money(a.equityChange, true))} this week`}
      </div>
      <div style="font:400 11px ${FONT};color:${BRAND.sub};margin:0 0 16px;">
        Includes deposits and withdrawals.
      </div>
      ${bars}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.line};margin:2px 0 0;">
        <tr>
          <td style="padding:10px 0 0;font:400 11px ${FONT};color:${BRAND.sub};">Cash</td>
          <td align="right" style="padding:10px 0 0;font:600 12px ${FONT};color:${BRAND.text};">${esc(money(s ? s.cash : null))}</td>
          <td style="padding:10px 0 0 16px;font:400 11px ${FONT};color:${BRAND.sub};">Positions</td>
          <td align="right" style="padding:10px 0 0;font:600 12px ${FONT};color:${BRAND.text};">${s ? s.optionCount + s.shareCount : "—"}</td>
          <td style="padding:10px 0 0 16px;font:400 11px ${FONT};color:${BRAND.sub};">Working</td>
          <td align="right" style="padding:10px 0 0;font:600 12px ${FONT};color:${BRAND.text};">${s && s.openOrderCount !== null ? s.openOrderCount : "—"}</td>
        </tr>
      </table>
    </td></tr>
  </table>`;
};

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
              ? "Part of this book could not be valued, so there is no figure for the week. The parts that could be are below."
              : "Still building this account's day-by-day history. Anything it traded is below.")
          : "Closed trades and the change in what is still open, Friday to Friday."}
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
        a.premium.collected > 0 ? BRAND.positive : BRAND.text),
      a.premium.paidToOpen > 0
        ? row("Paid to open bought positions", money(a.premium.paidToOpen), BRAND.negative)
        : "",
      row("Paid to close positions", money(a.premium.paidToClose),
        a.premium.paidToClose > 0 ? BRAND.negative : BRAND.text,
        "Nothing on a leg that expired."),
      row("Kept on what closed", money(a.premium.kept, true), colourFor(a.premium.kept),
        "Credits taken less debits paid, on trades that closed.")
    ].join(""),
    "A credit taken on a position still open has not been kept yet."
  );

// THE PANEL THE OWNER COULD NOT READ, AND WHY.
//
// He sent a screenshot of what stood here and said: *"The attached part is
// confusing. I don't understand it so for sure it would confuse users."* He
// was right, and the defect was arithmetic rather than wording.
//
// The week has FOUR parts -- premium booked on legs that closed, money booked
// on shares sold, the move on shares still held, and the move in the option
// book -- and `performance` is their sum, which is the figure in the hero at
// the top of the email. The panel showed THREE of them, under the heading
// "Stock", with a caption telling the reader that two of the three must not be
// added together. So nothing on screen summed to anything: three of Alton's
// numbers came to +$2,928.91 against a week the same email had already called
// +$2,455.91, and the only explanation offered was an instruction not to try.
//
// A reader who adds up the numbers in front of them and gets a different
// answer from the headline concludes the headline is wrong. That is the right
// conclusion from what was shown.
//
// So: all four parts, the missing one included, and the total they make --
// which is the hero figure, reached a second way. The caption that said not to
// add them is gone because now they add.
//
// ONE GUARD, BOTH PARTS OF THE MESSAGE. The first version of this put the
// reconciliation check in the HTML and left the plain-text branch printing the
// same five lines unconditionally -- so the exact defect this release exists
// to fix would have shipped intact to every reader whose client renders text,
// which is Gmail's plain-text mode, policy-stripped Outlook, several corporate
// gateways and some screen readers. A guard that protects one rendering of a
// figure and not the other is not a guard. Hence `weekParts`: both callers
// take their numbers from it or render nothing.
//
// EXACT AT THE CENT, not within a tolerance. `dailyPortfolio` rounds each of
// the four columns on its own and rounds `performance` from the UNROUNDED sum
// (`cents(realizedCum + sharesOpen + optionsOut)`), so the stored columns may
// miss their own `performance` by a cent or two per row, and this differences
// two rows. A tolerance would let that gap through and print four numbers that
// visibly do not add to the total above them -- in the one panel whose whole
// promise is that they do. So the parts are rounded to the cent FIRST and must
// then sum to the cent-rounded headline exactly: what is on screen adds up as
// written, or nothing is on screen. Measured before choosing this: 410 stored
// rows across production and staging, worst divergence exactly zero, so today
// this withholds from nobody.
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The week's four parts and their total, or null when they cannot be shown.
 *
 * Null on three counts: no headline, a part that could not be valued, or parts
 * that do not reconcile to the headline. The third is a statement about OUR
 * stored series rather than about the account, so it is logged -- an
 * unreconciled row is the tripwire for a stale or half-rebuilt
 * `account_equity_daily`, and silently dropping the panel would hide it.
 */
export function weekParts(a: AccountWeek): { parts: number[]; total: number } | null {
  const raw = [a.premiumLine, a.sharesBooked, a.sharesMark, a.optionsMark];
  if (a.performance === null || raw.some((p) => p === null || !Number.isFinite(Number(p)))) return null;
  const parts = raw.map((p) => round2(Number(p)));
  const total = round2(a.performance);
  const sum = round2(parts.reduce((s, p) => s + p, 0));
  if (sum !== total) {
    console.warn(
      `weeklyDigest: ${a.accountId} week parts do not reconcile — parts ${sum}, performance ${total}, residual ${round2(sum - total)}; breakdown withheld`
    );
    return null;
  }
  return { parts, total };
}

const totalRow = (label: string, value: string, colour: string) => `
  <tr>
    <td style="padding:12px 0 0;font:700 13px ${FONT};color:${BRAND.text};">${esc(label)}</td>
    <td align="right" style="padding:12px 0 0;font:700 17px ${FONT};color:${colour};white-space:nowrap;">${esc(value)}</td>
  </tr>`;

const weekPartsPanel = (a: AccountWeek) => {
  const w = weekParts(a);
  if (!w) return "";
  const [premium, sharesBooked, sharesMark, optionsMark] = w.parts;
  return panel(
    "How the week adds up",
    [
      // NOT "Premium on trades that closed", and the difference is a real
      // figure rather than a nicety. This line is the change in `premium_cum`,
      // which `equityHistory` builds with NO FILTER -- deliberately, because
      // it is an account-level sum with no attribution in it, so a withheld
      // row's premium belongs in it. The Premium panel a few inches above
      // reports `Kept on what closed`, which EXCLUDES provisional and withheld
      // rows. Two figures, adjacent, differing by exactly the money the email
      // has just told the reader it left out. Under the old label they were
      // the same claim made twice with two different numbers.
      row("Premium booked in the week", money(premium, true), colourFor(premium),
        "Every option leg the week booked, including any trade held back from the figures above."),
      row("Booked on shares sold", money(sharesBooked, true), colourFor(sharesBooked),
        "Money, not a mark."),
      row("Move on shares still held", money(sharesMark, true), colourFor(sharesMark),
        "A mark. It keeps moving until you sell."),
      // WHAT THE OLD CAPTION GOT WRONG. "A leg that closed leaves this line
      // and lands on the first one" is true of the LEG and false of the
      // AMOUNT: what leaves here is the mark the leg carried at last Friday's
      // close, and what lands on line one is its whole lifetime result. Those
      // are different numbers and routinely opposite in sign -- which is
      // exactly the case that alarms a reader, because a week of closing
      // winners prints a large negative here.
      row("Move in the option book", money(optionsMark, true), colourFor(optionsMark),
        "A mark on what was open. When a position closes its whole result moves to the first line and the mark it had been carrying comes off this one — so a good week of closes can leave this line negative."),
      totalRow("The week", money(w.total, true), colourFor(w.total))
    ].join(""),
    // TWO OF THESE ARE MONEY AND TWO ARE MARKS, and the subtitle has to say so.
    // The panel this replaces carried that distinction in its own subtitle
    // ("what the week did to what you hold, not what it booked"); a bold
    // signed total under four signed rows reads as money earned unless
    // something on the same screen says otherwise, and the footer's "unrealized
    // figures are marks" is four panels down in 11px grey.
    "The four parts of the figure at the top of this email. Two are money; two are marks that keep moving until the positions close. Your broker's statement is the record."
  );
};

const accountPanel = (a: AccountWeek) =>
  panel(
    "The account",
    [
      row("Account value at Friday's close", money(a.equityEnd), BRAND.text),
      row("Change in account value", money(a.equityChange, true), colourFor(a.equityChange),
        "Includes deposits and withdrawals."),
      row("Positions closed", `${a.closed.count}`, BRAND.text,
        a.closed.count ? `${a.closed.winners} up, ${a.closed.expired} expired` : ""),
      row("Positions opened", `${a.opened.count}`, BRAND.text),
      row("Realized on what closed", money(a.closed.realized, true), colourFor(a.closed.realized))
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
      <strong>${n} ${n === 1 ? "trade is" : "trades are"} missing from the premium and trade figures above.</strong>
      ${n === 1 ? "It computes" : "They compute"} to ${money(a.withheld.realized, true)}, which is more than
      ${n === 1 ? "its own strikes can" : "their own strikes can"} lose &mdash; so the arithmetic is ours to fix and
      the ${n === 1 ? "figure is" : "figures are"} left out rather than shown. Your broker's own total includes
      ${n === 1 ? "it" : "them"}. ${n === 1 ? "The trade" : "The trades"} happened exactly as your broker recorded
      ${n === 1 ? "it" : "them"}.
    </td></tr>
  </table>`;
};

// WHAT WE ARE NOT, said plainly, at the owner's instruction.
//
// He asked for this in his own words: *"add on disclaimer of the email that
// DeltaMint is not a broker/dealer. We don't hold any positions or cash. We do
// our best of delivering the accurate numbers but we are not the broker,
// difference can happen, if you have a problem with the number reach out to us
// support email. We are a software that helps you trade [...] and understand
// your brokerage account but mistakes, bugs, downtime can happen."*
//
// The footer it replaces made three of those points in a single 11px run-on
// and made the most important one -- that we are not a broker-dealer -- not at
// all. Compliance rule 2 is the standing requirement never to imply that
// status, and this email is the one surface where the product's figures leave
// the product: they arrive looking settled, beside a dollar total, in a
// message a reader may forward or quote with none of its context.
//
// FOUR CLAIMS, IN ORDER OF WHAT A READER LOSES BY NOT KNOWING IT:
//   1. We are not a broker-dealer and hold neither money nor positions.
//   2. These figures are RECONSTRUCTED and can differ from the broker's.
//   3. Software fails -- bugs, outages, a late or corrected feed.
//   4. There is a person to tell, and the address is here.
//
// The third is the one most products leave out, and the owner put it in
// unprompted. A weekly email that never admits it can be wrong is the reason a
// reader believes the one week it is.
//
// WORDING RULES THIS FOLLOWS. "Trade History", never "journal" -- the brand
// table bans the word (`docs/context/brand.md`). No advice, no recommendation,
// no ranking (rule 3). The broker is "your broker", never named (rule 1).
// The support address is the one published on the legal pages, and it is the
// same address this email now comes FROM, so a reply reaches it either way.
const disclaimer = (a: AccountWeek, unsubscribeUrl?: string | null) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.line};margin:8px 0 0;">
          <tr><td style="padding:14px 4px 0;font:400 11px ${FONT};color:${BRAND.sub};line-height:1.75;">
            <strong style="color:${BRAND.text};">DeltaMint is not a broker or a broker-dealer.</strong>
            We do not hold your money or your positions, we do not place trades on your behalf, and
            nothing here is advice, a recommendation or a signal. Your broker holds your account, and
            your broker's own statement is the record.
            <br><br>
            DeltaMint is software you use to screen, place and review your own trades, and to keep
            their history. Every figure above is <strong style="color:${BRAND.text};">reconstructed</strong>
            from your broker's trade and price history. We work hard to get these numbers right and
            they can still differ from your broker's — through a bug, an outage, a late or corrected
            price, or something we could not see. Unrealized figures are marks, not money.
            ${a.isPaper ? "This is a paper account and its money is simulated." : ""}
            <br><br>
            <strong style="color:${BRAND.text};">If a number here looks wrong to you, tell us:</strong>
            <a href="mailto:support@deltamint.app" style="color:${BRAND.accent};">support@deltamint.app</a>.
            We would rather hear it than not.
            ${unsubscribeUrl ? `<br><br><a href="${esc(unsubscribeUrl)}" style="color:${BRAND.sub};">Stop receiving these weekly emails</a>` : ""}
          </td></tr>
        </table>`;

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

  // ONE SUBJECT, THE OWNER'S WORDS: *"change the subject to DeltaMint Weekly
  // Digest"*, on the send that starts going to real users.
  //
  // What it replaces led with the account name and the week's figure, for a
  // reason that was right for HIM and wrong for them: he holds eight accounts
  // and needed the inbox to tell them apart. A user holds one or two, and a
  // dollar figure in a subject line is the account's result sitting in a
  // notification preview on a lock screen, beside whatever else is there.
  //
  // The account name and the week are the first two lines of the email, so
  // nothing is lost by a reader who opens it -- and the paper banner is the
  // first thing inside, in full width, so "(paper)" leaving the subject costs
  // no warning either.
  //
  // The cost, and it falls on the owner alone: eight accounts now produce
  // eight identical subjects in his inbox.
  const subject = "DeltaMint Weekly Digest";

  // THE REVIEW-COPY BANNER IS GONE, at the owner's word, because the point of
  // the copy he receives is now to be EXACTLY what a user receives -- and a
  // banner none of them will ever see defeats that.
  //
  // What it cost: in owner mode this email is addressed to one person and
  // delivered to another, and the banner was the only thing on screen saying
  // so. Nothing in an owner-mode copy now distinguishes it from mail a user
  // actually got. `previewFor` still travels and still names the intended
  // recipient in the send log, which is where that fact now lives alone.
  const preview = "";

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

  // THE ORDER OF THE MESSAGE. The owner, twice -- *"an account snapshot in
  // general should be sent. It's not about trades, it's about the account
  // itself"*, and then *"make the first section the total account, not the
  // holding, then go down to the rest"*. So: what the account is worth and
  // what is committed, then what the week did to it, then what it holds, then
  // the trades themselves. Widest to narrowest, and a week with no trades
  // still opens on a complete answer.
  //
  // DROPPED, because he asked for clean and these were duplicates rather than
  // content: `brokerAccountPanel` (its four figures are in the lead panel and
  // the holdings list), and `stockPanel` (shares held and the option mark are
  // both in the holdings list, and its "Move in the option book" row changed
  // meaning under a caption that still described a level).
  const body = [
    accountLead(a, snap),
    a.performance !== null ? hero(a) : "",
    snap ? holdingsPanel(snap) : accountPanel(a),
    snap ? ordersPanel(snap) : "",
    weekBlocks,
    weekPartsPanel(a)
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
        ${disclaimer(a, opts.unsubscribeUrl)}
      </td></tr>
    </table>
  </td></tr>
</table>`;

  const line = (l: string, v: string) => `${l}: ${v}`;
  const text = [
    opts.previewFor ? `REVIEW COPY — the email ${opts.previewFor} would receive for this account. Not sent to them.` : null,
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
          // THE SAME GUARD AS THE PANEL, off the same function. A heading that
          // promises four numbers add up, printed over four numbers that do
          // not, is the defect this release exists to remove -- and it is no
          // less a defect for arriving as text.
          ...(() => {
            const w = weekParts(a);
            if (!w) return [];
            return [
              "HOW THE WEEK ADDS UP",
              line("  Premium booked in the week", money(w.parts[0], true)),
              line("  Booked on shares sold", money(w.parts[1], true)),
              line("  Move on shares still held", money(w.parts[2], true)),
              line("  Move in the option book", money(w.parts[3], true)),
              line("  The week", money(w.total, true)),
              ""
            ];
          })(),
          "THE ACCOUNT",
          // Restored here because `holdingsPanel` is HTML only and `snap` can
          // be null: without this line a plain-text reader is told nowhere at
          // all what their shares are worth.
          line("  Shares still held", money(a.sharesValue)),
          line("  Account value at Friday's close", money(a.equityEnd)),
          line("  Change in account value", money(a.equityChange, true)),
          line("  Closed", String(a.closed.count)),
          line("  Opened", String(a.opened.count)),
          line("  Realized", money(a.closed.realized, true))
        ].join("\n"),
    "",
    app,
    "",
    // THE SAME FOUR CLAIMS AS THE HTML FOOTER. A disclaimer that is weaker in
    // the plain-text part is a disclaimer the reader who most needs it -- the
    // one whose client strips markup -- does not get.
    "—",
    "DeltaMint is not a broker or a broker-dealer. We do not hold your money or your",
    "positions, we do not place trades on your behalf, and nothing here is advice, a",
    "recommendation or a signal. Your broker holds your account, and your broker's own",
    "statement is the record.",
    "",
    "DeltaMint is software you use to screen, place and review your own trades, and to",
    "keep their history. Every figure above is reconstructed from your broker's trade and",
    "price history. We work hard to get these numbers right and they can still differ from",
    "your broker's — through a bug, an outage, a late or corrected price, or something we",
    "could not see. Unrealized figures are marks, not money.",
    a.isPaper ? "This is a paper account and its money is simulated." : null,
    "",
    "If a number here looks wrong to you, tell us: support@deltamint.app.",
    "We would rather hear it than not."
  ]
    // NULL is an entry that does not apply (no review stamp, not a paper
    // account). An EMPTY STRING is a deliberate blank line. The old filter
    // dropped both, which is why the plain-text part arrived as unbroken
    // paragraphs -- including the disclaimer, where the breaks are what make
    // four separate claims readable as four.
    .filter((s) => s !== null)
    .join("\n");

  return { subject, html, text };
}
