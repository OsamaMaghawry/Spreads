// The market emails: the brief before the bell, and an alert when something
// major happens to a stock a user holds.
//
// This file is the deterministic half -- clocks, holdings, price moves and the
// HTML -- so all of it can be tested without a network or a model. What the
// emails SAY is written by marketWriter.ts from sources it is handed; nothing
// here invents a sentence about the market.
//
// THE OWNER'S BRIEF: "a daily email that gives a market before the session
// starts ... the main things that might be moving the market, the Asia
// session maybe, and the specific holdings of every account ... and during the
// session ... send like an alert if there is something major about a certain
// stock." He reviews the writing, the news and the design before anyone else
// gets one, which is why delivery defaults to the owner (market_mail_delivery).

import { parseOCCSymbol } from "./occ.ts";

const TZ = "America/New_York";

// ---------- time, in New York ----------

export interface EtClock {
  day: string;        // YYYY-MM-DD, the New York calendar day
  minutes: number;    // minutes since New York midnight
  weekday: string;    // "Monday"
}

export function etClock(d = new Date()): EtClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "long"
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  // Some runtimes print midnight as "24".
  const hour = Number(get("hour")) % 24;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")), weekday: get("weekday") };
}

/** "8:44 ET" */
export function etTime(iso: string | number | Date): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d) + " ET";
}

/** "Monday, October 12" */
export function etLongDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(d);
}

// The brief goes out after the 8:30 ET data releases have printed and before
// the 9:30 open. A run outside this window does nothing, so the schedule can
// fire generously in UTC and still land on New York time through both
// daylight-saving states.
export const BRIEF_FROM = 8 * 60 + 40;
export const BRIEF_UNTIL = 9 * 60 + 25;
export const inBriefWindow = (c: EtClock) => c.minutes >= BRIEF_FROM && c.minutes <= BRIEF_UNTIL;

// ---------- the market, through ETFs ----------

// Pre-market levels from the same Alpaca data feed the product already uses.
// ETFs rather than index futures because the feed carries them; the label
// says which is which, so nobody reads SPY as the S&P future.
export const MARKET_TAPE: [string, string][] = [
  ["SPY", "S&P 500"],
  ["QQQ", "Nasdaq 100"],
  ["DIA", "Dow"],
  ["IWM", "Russell 2000"],
  ["TLT", "Long Treasuries"],
  ["GLD", "Gold"],
  ["USO", "Oil"]
];

export interface Move {
  symbol: string;
  label?: string;
  price: number | null;
  prevClose: number | null;
  change: number | null;   // fraction: 0.012 is +1.2%
  asOf: string | null;
}

/** One Alpaca stock snapshot to a move against the previous close. */
export function moveFromSnapshot(symbol: string, snap: any, label?: string): Move {
  const trade = snap?.latestTrade;
  const daily = snap?.dailyBar;
  const prev = snap?.prevDailyBar;
  const price = trade?.p > 0 ? trade.p : daily?.c > 0 ? daily.c : null;
  const prevClose = prev?.c > 0 ? prev.c : null;
  return {
    symbol, label, price, prevClose,
    change: price != null && prevClose ? price / prevClose - 1 : null,
    asOf: trade?.t || daily?.t || null
  };
}

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null || !isFinite(v) ? "n/a" : `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(digits)}%`;

export const usd = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "n/a" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- holdings ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface HoldingLine {
  symbol: string;      // the underlying a news search is run on
  lines: string[];     // "100 shares", "Short 1 put 180, Oct 17"
}

/**
 * What an account holds, by underlying, in words. Positions in Alpaca's shape
 * (SnapTrade's are converted to it upstream). Crypto is left out: the news
 * feed and the brief are about US stocks.
 */
export function holdingsOf(positions: any[]): HoldingLine[] {
  const by = new Map<string, { shares: number; legs: { exp: string; text: string }[] }>();
  for (const p of Array.isArray(positions) ? positions : []) {
    if (p?.asset_class === "crypto") continue;
    const raw = parseFloat(p?.qty);
    if (!raw) continue;
    const short = p.side === "short" || raw < 0;
    const n = Math.abs(raw);
    const occ = parseOCCSymbol(p.symbol);
    const sym = String(occ ? occ.underlying : p.symbol || "").toUpperCase();
    if (!sym || /[^A-Z.]/.test(sym)) continue;
    const row = by.get(sym) || { shares: 0, legs: [] };
    if (occ) {
      const kind = occ.type === "P" ? "put" : "call";
      const m = Number(occ.expiry.slice(2, 4)), d = Number(occ.expiry.slice(4, 6));
      const strike = Number.isInteger(occ.strike) ? String(occ.strike) : occ.strike.toFixed(2);
      row.legs.push({
        exp: occ.expiryFormatted,
        text: `${short ? "Short" : "Long"} ${n} ${kind}${n === 1 ? "" : "s"} ${strike}, ${MONTHS[m - 1]} ${d}`
      });
    } else {
      row.shares += short ? -n : n;
    }
    by.set(sym, row);
  }
  const out: HoldingLine[] = [];
  for (const [symbol, row] of [...by.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const lines: string[] = [];
    if (row.shares) lines.push(`${row.shares < 0 ? "Short " : ""}${Math.abs(row.shares).toLocaleString("en-US")} shares`);
    const legs = row.legs.sort((a, b) => a.exp.localeCompare(b.exp));
    lines.push(...legs.slice(0, 4).map((l) => l.text));
    if (legs.length > 4) lines.push(`and ${legs.length - 4} more option legs`);
    out.push({ symbol, lines });
  }
  return out;
}

// ---------- what goes into an email ----------

export interface Sourced { text: string; source_url?: string | null }
export interface MarketSection {
  subject: string;
  headline: string;
  summary: string;
  overnight: (Sourced & { region: string })[];
  movers: Sourced[];
  calendar: { time_et: string; event: string }[];
}
export interface SymbolNote {
  symbol: string;
  text: string | null;        // null: nothing worth a line
  urls: string[];
}
export interface AccountHoldings {
  name: string;
  isPaper: boolean;
  holdings: HoldingLine[];
  error?: string | null;
}

// The owner, on the articles: a long dash "is a clear sign of AI-generated
// content". The writer is told not to use one; this is the belt to that brace,
// applied to every model-written string before it reaches an email.
export function noLongDashes(s: string): string {
  return String(s || "")
    .replace(/\s*[—–]\s*(?=\d)/g, " to ")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ");
}

/** Keep only links that were in the material the writer was given. */
export function keepKnownUrls(urls: (string | null | undefined)[], known: Set<string>): string[] {
  return [...new Set(urls.filter((u): u is string => !!u && known.has(u.trim())).map((u) => u.trim()))];
}

// ---------- rendering ----------

const BRAND = {
  bg: "#F6F5FB", panel: "#FFFFFF", line: "#E1DEF2", accent: "#534AB7",
  text: "#201B3A", sub: "#6A6294", positive: "#0F6E56", negative: "#993C1D"
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "source"; } };
const link = (u?: string | null) =>
  u ? ` <a href="${esc(u)}" style="color:${BRAND.accent};text-decoration:none;font-size:12px;white-space:nowrap;">${esc(host(u))}</a>` : "";
const tone = (v: number | null) => (v == null ? BRAND.sub : v >= 0 ? BRAND.positive : BRAND.negative);

const panel = (title: string, inner: string, note = "") => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px;margin:0 0 16px;">
  <tr><td style="padding:16px 18px;">
    <div style="font:600 11px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${BRAND.sub};margin:0 0 10px;">${esc(title)}</div>
    ${inner}
    ${note ? `<div style="font:400 12px ${FONT};color:${BRAND.sub};margin-top:10px;line-height:1.5;">${note}</div>` : ""}
  </td></tr>
</table>`;

const para = (s: string) => `<p style="font:400 15px/1.6 ${FONT};color:${BRAND.text};margin:0 0 10px;">${s}</p>`;

function frame(top: string, preheader: string, body: string, footerExtra = ""): string {
  const app = "https://dashboard.deltamint.app";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="padding:0 0 18px;">
        <div style="font:700 20px ${FONT};color:${BRAND.text};letter-spacing:-.02em;">delta<span style="color:#1D9E75;">mint</span></div>
        ${top}
      </td></tr>
      <tr><td>
        ${body}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:6px 0 18px;">
            <a href="${app}" style="display:inline-block;background:${BRAND.accent};color:#FFFFFF;font:600 14px ${FONT};text-decoration:none;padding:11px 22px;border-radius:9px;">Open your dashboard</a>
          </td></tr>
        </table>
        <div style="font:400 12px/1.6 ${FONT};color:${BRAND.sub};max-width:480px;margin:0 auto;text-align:center;">
          Written with AI from the sources linked, which can be wrong or late: check the source before relying on a line.
          DeltaMint is not a broker or a broker-dealer. We do not hold your money or place trades for you, and nothing here is advice, a recommendation or a signal.
          ${footerExtra}
          <br><br>Questions or a line that looks wrong: <a href="mailto:support@deltamint.app" style="color:${BRAND.sub};">support@deltamint.app</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export interface BriefInput {
  date: Date;
  market: MarketSection;
  tape: Move[];
  tapeAsOf: string | null;
  accounts: AccountHoldings[];
  notes: Map<string, SymbolNote>;
  moves: Map<string, Move>;
  earnings: Record<string, string>;   // symbol -> YYYY-MM-DD, within the next two weeks
  preview?: boolean;
}

export function renderBrief(b: BriefInput): { subject: string; html: string; text: string } {
  const m = b.market;
  const subject = `${b.preview ? "[Preview] " : ""}${noLongDashes(m.subject)}`;
  const tapeRows = b.tape.map((t) => `
    <tr>
      <td style="padding:6px 0;font:500 14px ${FONT};color:${BRAND.text};">${esc(t.label || t.symbol)} <span style="font:400 12px ${MONO};color:${BRAND.sub};">${esc(t.symbol)}</span></td>
      <td align="right" style="padding:6px 0;font:400 13px ${MONO};color:${BRAND.sub};">${esc(usd(t.price))}</td>
      <td align="right" style="padding:6px 0 6px 12px;font:600 14px ${MONO};color:${tone(t.change)};width:70px;">${esc(pct(t.change))}</td>
    </tr>`).join("");

  const overnight = m.overnight.map((o) => `
    <tr><td style="padding:7px 0;border-top:1px solid ${BRAND.line};vertical-align:top;width:96px;font:600 13px ${FONT};color:${BRAND.text};">${esc(noLongDashes(o.region))}</td>
        <td style="padding:7px 0;border-top:1px solid ${BRAND.line};font:400 14px/1.55 ${FONT};color:${BRAND.text};">${esc(noLongDashes(o.text))}${link(o.source_url)}</td></tr>`).join("");

  const movers = m.movers.map((x) => `
    <li style="margin:0 0 8px;font:400 14px/1.55 ${FONT};color:${BRAND.text};">${esc(noLongDashes(x.text))}${link(x.source_url)}</li>`).join("");

  const calendar = m.calendar.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${m.calendar.map((c) => `
        <tr><td style="padding:6px 0;border-top:1px solid ${BRAND.line};width:80px;font:500 13px ${MONO};color:${BRAND.accent};vertical-align:top;">${esc(noLongDashes(c.time_et))}</td>
            <td style="padding:6px 0;border-top:1px solid ${BRAND.line};font:400 14px/1.5 ${FONT};color:${BRAND.text};">${esc(noLongDashes(c.event))}</td></tr>`).join("")}</table>`
    : para("Nothing scheduled that we could confirm.");

  const accountBlocks = b.accounts.map((a) => {
    const head = `<div style="font:600 15px ${FONT};color:${BRAND.text};margin:0 0 4px;">${esc(a.name)}${a.isPaper ? ` <span style="font:600 10px ${FONT};letter-spacing:.06em;color:${BRAND.accent};background:#EDECF9;border-radius:6px;padding:2px 6px;vertical-align:middle;">PAPER</span>` : ""}</div>`;
    if (a.error) return `${head}<div style="font:400 13px ${FONT};color:${BRAND.negative};margin:0 0 14px;">Could not read this account this morning.</div>`;
    if (!a.holdings.length) return `${head}<div style="font:400 13px ${FONT};color:${BRAND.sub};margin:0 0 14px;">No open stock or option positions.</div>`;
    const rows = a.holdings.map((h) => {
      const note = b.notes.get(h.symbol);
      const mv = b.moves.get(h.symbol);
      const er = b.earnings[h.symbol];
      return `
      <tr><td style="padding:10px 0;border-top:1px solid ${BRAND.line};vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:700 14px ${MONO};color:${BRAND.text};">${esc(h.symbol)}${er ? ` <span style="font:600 10px ${FONT};letter-spacing:.04em;color:#854F0B;background:#FDF6E9;border-radius:6px;padding:2px 6px;">EARNINGS ${esc(shortDate(er))}</span>` : ""}</td>
          <td align="right" style="font:600 13px ${MONO};color:${tone(mv?.change ?? null)};">${mv && mv.change != null ? `${esc(pct(mv.change))} <span style="font:400 11px ${FONT};color:${BRAND.sub};">pre-market</span>` : ""}</td>
        </tr></table>
        <div style="font:400 12px ${FONT};color:${BRAND.sub};margin:3px 0 6px;">${esc(h.lines.join(" · "))}</div>
        <div style="font:400 14px/1.55 ${FONT};color:${note?.text ? BRAND.text : BRAND.sub};">${note?.text ? esc(noLongDashes(note.text)) + note.urls.map(link).join("") : "No company news since the last close."}</div>
      </td></tr>`;
    }).join("");
    return `${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${rows}</table>`;
  }).join("");

  const top = `
        <div style="font:600 12px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${BRAND.accent};margin-top:14px;">Before the bell · ${esc(etLongDate(b.date))}</div>
        <div style="font:700 24px/1.25 ${FONT};color:${BRAND.text};letter-spacing:-.02em;margin-top:6px;">${esc(noLongDashes(m.headline))}</div>
        ${b.preview ? `<div style="font:600 12px ${FONT};color:#854F0B;background:#FDF6E9;border-radius:8px;padding:8px 10px;margin-top:12px;">Preview: only you receive this while you review it.</div>` : ""}`;

  const body = [
    panel("The morning", para(esc(noLongDashes(m.summary)))),
    panel("Pre-market", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tapeRows}</table>`,
      `ETF prices on the Alpaca data feed${b.tapeAsOf ? `, as of ${esc(etTime(b.tapeAsOf))}` : ""}, against yesterday's close.`),
    overnight ? panel("Overnight", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${overnight}</table>`) : "",
    movers ? panel("What is moving", `<ul style="margin:0;padding:0 0 0 18px;">${movers}</ul>`) : "",
    panel("Today, ET", calendar),
    panel("Your holdings", accountBlocks || para("No connected accounts to read."),
      "News since yesterday's close from the Alpaca news feed, which carries Benzinga. Earnings dates within the next two weeks are flagged.")
  ].join("");

  const html = frame(top, noLongDashes(m.summary).slice(0, 140), body);

  const text = [
    b.preview ? "PREVIEW: only you receive this while you review it." : null,
    `DeltaMint · Before the bell · ${etLongDate(b.date)}`,
    "",
    noLongDashes(m.headline),
    "",
    noLongDashes(m.summary),
    "",
    "PRE-MARKET",
    ...b.tape.map((t) => `  ${t.label || t.symbol} (${t.symbol}) ${usd(t.price)} ${pct(t.change)}`),
    "",
    m.overnight.length ? "OVERNIGHT" : null,
    ...m.overnight.map((o) => `  ${noLongDashes(o.region)}: ${noLongDashes(o.text)}${o.source_url ? ` (${o.source_url})` : ""}`),
    m.overnight.length ? "" : null,
    m.movers.length ? "WHAT IS MOVING" : null,
    ...m.movers.map((x) => `  - ${noLongDashes(x.text)}${x.source_url ? ` (${x.source_url})` : ""}`),
    m.movers.length ? "" : null,
    "TODAY, ET",
    ...(m.calendar.length ? m.calendar.map((c) => `  ${noLongDashes(c.time_et)}  ${noLongDashes(c.event)}`) : ["  Nothing scheduled that we could confirm."]),
    "",
    "YOUR HOLDINGS",
    ...b.accounts.flatMap((a) => [
      `  ${a.name}${a.isPaper ? " (paper)" : ""}`,
      ...(a.error ? ["    Could not read this account this morning."]
        : a.holdings.length ? a.holdings.map((h) => {
            const note = b.notes.get(h.symbol);
            return `    ${h.symbol}: ${h.lines.join("; ")}\n      ${note?.text ? noLongDashes(note.text) : "No company news since the last close."}`;
          }) : ["    No open stock or option positions."]),
      ""
    ]),
    "Written with AI from the sources linked, which can be wrong or late.",
    "DeltaMint is not a broker or a broker-dealer, and nothing here is advice, a recommendation or a signal.",
    "support@deltamint.app"
  ].filter((s) => s !== null).join("\n");

  return { subject, html, text };
}

const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split("-").map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : ymd;
};

export interface AlertInput {
  symbol: string;
  title: string;            // the subject line after "SYMBOL: "
  what: string;             // one or two sentences on what happened
  urls: string[];
  publishedAt: string | null;
  move: Move | null;
  held: { account: string; lines: string[] }[];
  kind: "news" | "move";
  preview?: boolean;
}

export function renderAlert(a: AlertInput): { subject: string; html: string; text: string } {
  const subject = `${a.preview ? "[Preview] " : ""}${a.symbol}: ${noLongDashes(a.title)}`.slice(0, 120);
  const moveLine = a.move && a.move.price != null
    ? `<div style="font:600 15px ${MONO};color:${tone(a.move.change)};margin-top:8px;">${esc(a.symbol)} ${esc(usd(a.move.price))} <span>${esc(pct(a.move.change))}</span> <span style="font:400 12px ${FONT};color:${BRAND.sub};">today${a.move.asOf ? `, ${esc(etTime(a.move.asOf))}` : ""}</span></div>`
    : "";
  const top = `
        <div style="font:600 12px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${a.kind === "move" ? BRAND.negative : BRAND.accent};margin-top:14px;">${a.kind === "move" ? "Big move" : "News alert"} · ${esc(a.symbol)}</div>
        <div style="font:700 22px/1.3 ${FONT};color:${BRAND.text};letter-spacing:-.02em;margin-top:6px;">${esc(noLongDashes(a.title))}</div>
        ${moveLine}
        ${a.preview ? `<div style="font:600 12px ${FONT};color:#854F0B;background:#FDF6E9;border-radius:8px;padding:8px 10px;margin-top:12px;">Preview: only you receive this while you review it.</div>` : ""}`;
  const held = a.held.map((h) => `
      <tr><td style="padding:7px 0;border-top:1px solid ${BRAND.line};font:600 13px ${FONT};color:${BRAND.text};vertical-align:top;width:40%;">${esc(h.account)}</td>
          <td style="padding:7px 0;border-top:1px solid ${BRAND.line};font:400 13px/1.5 ${FONT};color:${BRAND.sub};">${esc(h.lines.join(" · "))}</td></tr>`).join("");
  const body = [
    panel("What happened", para(esc(noLongDashes(a.what)) + a.urls.map(link).join("")),
      a.publishedAt ? `Published ${esc(etTime(a.publishedAt))}.` : ""),
    held ? panel("In your accounts", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${held}</table>`) : ""
  ].join("");
  const html = frame(top, noLongDashes(a.what).slice(0, 140), body);
  const text = [
    a.preview ? "PREVIEW: only you receive this while you review it." : null,
    `DeltaMint · ${a.kind === "move" ? "Big move" : "News alert"} · ${a.symbol}`,
    "",
    noLongDashes(a.title),
    a.move && a.move.price != null ? `${a.symbol} ${usd(a.move.price)} ${pct(a.move.change)} today` : null,
    "",
    noLongDashes(a.what),
    ...a.urls,
    "",
    a.held.length ? "IN YOUR ACCOUNTS" : null,
    ...a.held.map((h) => `  ${h.account}: ${h.lines.join("; ")}`),
    "",
    "Written with AI from the source linked, which can be wrong or late.",
    "DeltaMint is not a broker or a broker-dealer, and nothing here is advice, a recommendation or a signal.",
    "support@deltamint.app"
  ].filter((s) => s !== null).join("\n");
  return { subject, html, text };
}
