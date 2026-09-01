// What the after-close email says, and how it decides what is worth saying.
//
// The first version listed raised conditions and nothing else, which produced
// an email of thirteen identical "price not trusted" rows and no way to tell a
// clean account from an empty one. Two things were wrong with that beyond the
// staleness bug that generated the rows:
//
//   - It reported the WATCH's failures rather than the BOOK's state. A trader
//     opening this wants one answer -- is my money all right -- and a list of
//     things the monitor could not do is not that answer.
//   - "Nothing flagged" carried no evidence. Nothing flagged out of what? An
//     account holding nine spreads with the nearest short 2% from its strike
//     and an account holding nothing read exactly the same.
//
// So the report leads with the size of the book, then what needs a look, then
// the all-clear WITH the number that makes it an all-clear. Kept pure and free
// of Deno imports so the shape of the email is testable rather than only
// observable by receiving one.

// price_untrusted is a LIVENESS rule: "I am watching and cannot see" is worth
// an alert at 14:30 and is meaningless at 21:15, when nothing is trading and
// nobody can act. It never becomes a row in the digest -- it collapses into one
// line naming the symbols.
export const LIVENESS_RULES = new Set(["price_untrusted"]);

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function legLabel(occ: any) {
  return `${occ.ticker} ${occ.strike}${occ.type}`;
}

// One account, described rather than judged.
//
// legs: [{ symbol, occ, qty, marketValue }] -- qty signed, negative = short.
// spots: keyed by ticker, from getClosingSpots.
export function accountFacts(legs: any[], spots: Record<string, any>, expiringWithinDays = 7, today = new Date()) {
  const shorts = legs.filter((l) => l.qty < 0);
  let closest: { label: string; pct: number } | null = null;
  const unpriced: string[] = [];

  for (const l of shorts) {
    const spot = spots[l.occ.ticker];
    if (!spot || !(spot.price > 0) || !spot.trusted) {
      unpriced.push(legLabel(l.occ));
      continue;
    }
    // Distance to the strike as a share of the strike, so names of different
    // prices are comparable. Signed away from danger is not needed here: the
    // through-strike rule already fired if it is through.
    const away = Math.abs(spot.price - l.occ.strike) / l.occ.strike;
    if (!closest || away < closest.pct) closest = { label: legLabel(l.occ), pct: away };
  }

  const horizon = new Date(today.getTime() + expiringWithinDays * 86400000).toISOString().slice(0, 10);
  const expiringSoon = legs.filter((l) => l.occ.expiryFormatted && l.occ.expiryFormatted <= horizon).length;

  return {
    positions: legs.length,
    shortLegs: shorts.length,
    atRisk: legs.reduce((s, l) => s + Math.abs(Number(l.marketValue) || 0), 0),
    closest,
    unpriced,
    expiringSoon
  };
}

// One account's line in the "Everything else" block. Says what makes it clear,
// never just that it is.
export function accountLine(facts: any) {
  if (!facts || facts.positions === 0) return "no positions";
  const bits = [`${facts.positions} leg${facts.positions === 1 ? "" : "s"}`];
  if (facts.closest) bits.push(`closest short ${facts.closest.label}, ${pct(facts.closest.pct)} away`);
  else if (facts.shortLegs === 0) bits.push("no short legs");
  if (facts.expiringSoon > 0) bits.push(`${facts.expiringSoon} expiring within 7 days`);
  if (facts.unpriced.length) bits.push(`couldn't price ${facts.unpriced.length}`);
  return bits.join(" · ");
}

const SEV_RANK: Record<string, number> = { critical: 2, warning: 1, info: 0 };
const dot = (s: string) => (s === "critical" ? "🔴" : s === "warning" ? "🟠" : "⚪");

// perAccount: [{ name, facts, alerts: [{ rule, severity, title }] }]
export function buildDailyReport(perAccount: any[], day: string) {
  const actionable = perAccount
    .flatMap((a) => (a.alerts || [])
      .filter((x: any) => !LIVENESS_RULES.has(x.rule))
      .map((x: any) => ({ ...x, account: a.name })))
    .sort((x, y) => (SEV_RANK[y.severity] ?? 0) - (SEV_RANK[x.severity] ?? 0));

  const totals = perAccount.reduce(
    (s, a) => ({
      positions: s.positions + (a.facts?.positions || 0),
      atRisk: s.atRisk + (a.facts?.atRisk || 0)
    }),
    { positions: 0, atRisk: 0 }
  );

  const headline =
    `${perAccount.length} account${perAccount.length === 1 ? "" : "s"} · ` +
    `${totals.positions} open position${totals.positions === 1 ? "" : "s"} · ` +
    `${money(totals.atRisk)} at risk`;

  const lines: string[] = [`DeltaMint — after the close · ${day}`, headline, ""];
  if (actionable.length) {
    lines.push("Needs a look");
    for (const a of actionable) lines.push(`  ${dot(a.severity)} ${a.account} — ${a.title}`);
    lines.push("");
  } else {
    lines.push("Nothing needs a look.", "");
  }
  lines.push("Everything else");
  for (const a of perAccount) lines.push(`  ${a.name}: ${accountLine(a.facts)}`);

  const needs = actionable.length
    ? `<p style="font-size:13px;font-weight:600;margin:18px 0 6px">Needs a look</p>
       <table style="border-collapse:collapse;font-size:13px">${actionable
         .map((a) => `<tr><td style="padding:5px 8px 5px 0;vertical-align:top">${dot(a.severity)}</td>` +
           `<td style="padding:5px 0"><span style="color:#64748B">${a.account}</span> — ${a.title}</td></tr>`)
         .join("")}</table>`
    : `<p style="font-size:13px;margin:18px 0 6px;color:#0F6E56">Nothing needs a look.</p>`;

  const rest = `<p style="font-size:13px;font-weight:600;margin:18px 0 6px">Everything else</p>
    <table style="border-collapse:collapse;font-size:13px">${perAccount
      .map((a) => `<tr><td style="padding:5px 14px 5px 0;white-space:nowrap">${a.name}</td>` +
        `<td style="padding:5px 0;color:#475569">${accountLine(a.facts)}</td></tr>`)
      .join("")}</table>`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;color:#0F172A">
    <p style="font-size:15px;font-weight:600;margin:0">DeltaMint — after the close</p>
    <p style="font-size:12px;color:#94A3B8;margin:2px 0 0">${day}</p>
    <p style="font-size:14px;margin:14px 0 0">${headline}</p>
    ${needs}
    ${rest}
    <p style="font-size:11px;color:#94A3B8;margin-top:20px">Judged on today's closing prices. A monitoring summary, not advice — your broker's records govern.</p>
  </div>`;

  return { html, text: lines.join("\n"), actionable: actionable.length };
}
