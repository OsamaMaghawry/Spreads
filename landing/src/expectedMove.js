// The /expected-move pages: one per stock, each answering the question people
// search ("TSLA expected move this week") with the number itself.
//
// The owner, 22 Oct 2026, after a funding-data site ranked one honest page
// per company: do that with our own data, and "make sure it's updated ... no
// one needs an outdated piece of news". The numbers are computed and stored
// every few minutes by the tickerPages function (supabase/functions/_shared/
// expectedMove.ts); this file only renders the stored row, and says how old
// it is on every page.
//
// OFF unless EXPECTED_MOVE_PAGES is "on" for the deployment. Showing numbers
// derived from options prices on a public page may need a data licence; until
// the owner has that answer, only staging turns this on.

import { esc, page } from "./render.js";

export const EM = "/expected-move";
export const emEnabled = (env) => String(env?.EXPECTED_MOVE_PAGES || "").toLowerCase() === "on";

const SELECT = "ticker,name,spot,spot_as_of,week,month,earnings_date,earnings_session,error,live,refreshed_at";

export async function fetchTickerPages(env, ticker = null) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/ticker_pages`);
  url.searchParams.set("select", SELECT);
  url.searchParams.set("order", "ticker.asc");
  if (ticker) url.searchParams.set("ticker", `eq.${ticker}`);
  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
  return res.json();
}

const usd = (v) => `$${Number(v).toFixed(2)}`;
const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`;
const iv = (v) => `${(Number(v) * 100).toFixed(0)}%`;
const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
export const etTime = (iso) =>
  `${new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
const slug = (t) => String(t).toLowerCase();
const priced = (r) => r && !r.error && typeof r.move === "number";

// A page that has not refreshed for this long says so at the top. Weekends
// and holidays are a day or three; anything past that means the job stopped.
const STALE_MS = 4 * 86400000;

/** The page's freshness line, in words a reader trusts or distrusts at a glance. */
export function freshness(row, now = Date.now()) {
  const when = etTime(row.refreshed_at);
  if (now - Date.parse(row.refreshed_at) > STALE_MS) {
    return { stale: true, text: `These numbers are from ${when} and have not refreshed since. Treat them as out of date.` };
  }
  return { stale: false, text: row.live ? `Updated ${when}, from live option prices.` : `Updated ${when}, at the close.` };
}

/** Whether the next report falls on or before an expiry, with the words for it. */
function earningsLine(row, expiry) {
  if (!row.earnings_date || !expiry) return null;
  const when = row.earnings_session === "bmo" ? " before the open" : row.earnings_session === "amc" ? " after the close" : "";
  return row.earnings_date <= expiry
    ? `${row.ticker} reports earnings on ${longDay(row.earnings_date)}${when}, before this expiry. The expected move includes the earnings reaction.`
    : null;
}

export function titleFor(row) {
  const w = row.week;
  return priced(w)
    ? `${row.ticker} expected move this week: ±${usd(w.move)} (${pct(w.movePct)})`
    : `${row.ticker} expected move: the options market's range`;
}

function moveRow(label, r) {
  if (!r) return "";
  if (!priced(r)) return `<tr><td>${label}<br><small>${esc(day(r.expiry))}</small></td><td colspan="4">${esc(r.error || "Not available")}</td></tr>`;
  return `<tr><td>${label}<br><small>${esc(day(r.expiry))} · ${r.days} day${r.days === 1 ? "" : "s"}</small></td>` +
    `<td><strong>±${usd(r.move)}</strong><br><small>${pct(r.movePct)}</small></td>` +
    `<td>${usd(r.low)} to ${usd(r.high)}</td><td>${usd(r.straddle)}</td><td>${iv(r.iv)}</td></tr>`;
}

export function renderTickerPage(row, all, site, noindex) {
  const w = row.week;
  const m = row.month;
  const fresh = freshness(row);
  const url = `${site}${EM}/${slug(row.ticker)}`;
  const earn = earningsLine(row, w?.expiry) || earningsLine(row, m?.expiry);
  const others = all.filter((r) => r.ticker !== row.ticker && priced(r.week)).slice(0, 200);
  const near = others.sort((a, b) => b.week.movePct - a.week.movePct).slice(0, 12);
  const description = priced(w)
    ? `The options market prices ${row.name} (${row.ticker}) to move about ±${usd(w.move)}, or ${pct(w.movePct)}, by ${day(w.expiry)}: a range of ${usd(w.low)} to ${usd(w.high)}. ${fresh.text}`
    : `The move the options market prices into ${row.name} (${row.ticker}) by its next expiries, refreshed through the trading day.`;

  const how = priced(w)
    ? `<p>The at-the-money straddle for ${esc(day(w.expiry))}, a call and a put at the strike${w.strikes?.length > 1 ? "s either side" : ""} of the ${usd(row.spot)} price, costs <strong>${usd(w.straddle)}</strong>. A straddle prices the average size of the move, which is about 0.8 of one standard deviation, so one standard deviation is ${usd(w.straddle)} ÷ 0.798 = <strong>±${usd(w.move)}</strong>.</p>
<ul>
<li><strong>About two times in three</strong> (one standard deviation), the market expects ${esc(row.ticker)} between ${usd(w.low)} and ${usd(w.high)} on ${esc(day(w.expiry))}.</li>
<li><strong>About 19 times in 20</strong> (two standard deviations), between ${usd(Math.max(0, row.spot - 2 * w.move))} and ${usd(row.spot + 2 * w.move)}.</li>
<li>The volatility those prices imply is <strong>${iv(w.iv)}</strong> a year.</li>
</ul>${w.wide ? `<p><small>The quotes behind this were wide, so treat the number as approximate.</small></p>` : ""}`
    : `<p>${esc(row.error || "There is no usable price for this stock's options right now.")}</p>`;

  const body = `<p class="crumbs"><a href="${EM}">Expected moves</a> / ${esc(row.ticker)}</p>
<h1>${esc(row.name)} (${esc(row.ticker)}) expected move</h1>
<p class="lede">${priced(w) ? `Options on ${esc(row.ticker)} are priced for a move of about <strong>±${usd(w.move)} (${pct(w.movePct)})</strong> by ${esc(longDay(w.expiry))}.` : esc(description)}</p>
<p class="meta"${fresh.stale ? ' style="color:#B42318"' : ""}>${esc(fresh.text)}${row.spot ? ` ${esc(row.ticker)} at ${usd(row.spot)}.` : ""}</p>
${earn ? `<p class="toolbox"><span>Earnings before expiry</span>${esc(earn)}</p>` : ""}
<div class="tablewrap"><table>
<thead><tr><th>Expiry</th><th>Expected move</th><th>Range, two times in three</th><th>Straddle</th><th>Implied vol</th></tr></thead>
<tbody>${moveRow("This week", w)}${moveRow("Monthly", m)}</tbody>
</table></div>
<h2>How the ${esc(row.ticker)} expected move is worked out</h2>
${how}
<p class="toolbox"><span>Work it out</span><a href="/tools/expected-move-calculator">Expected move calculator</a> Any stock, any expiry: enter the price and the straddle or the implied volatility.</p>
<h2>What it is not</h2>
<p>It is the range the options market is pricing today, not a forecast. Prices can and do move outside it, and the range changes as option prices change through the day. Nothing here is a recommendation to buy or sell anything.</p>
${near.length ? `<section class="related"><h2>Biggest expected moves this week</h2><ul>${near.map((r) => `<li><a href="${EM}/${slug(r.ticker)}">${esc(r.ticker)} expected move</a> ±${pct(r.week.movePct)}</li>`).join("")}</ul><p class="more"><a href="${EM}">All ${all.length} stocks</a></p></section>` : ""}
<p class="startfree"><a class="btn btn-primary" href="https://dashboard.deltamint.app/register?ref=expected-move/${slug(row.ticker)}">Start free on a paper account</a></p>
<p><small>Option prices from our market data feed; earnings dates from our earnings calendar. For information only, not investment advice.</small></p>`;

  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Expected moves", item: `${site}${EM}` },
    { "@type": "ListItem", position: 2, name: `${row.ticker} expected move`, item: url }
  ] };
  return page({
    title: `${titleFor(row)} | DeltaMint`,
    description,
    canonical: url,
    head: `${noindex ? '<meta name="robots" content="noindex, nofollow">' : ""}<script type="application/ld+json">${JSON.stringify(crumbs).replace(/</g, "\\u003c")}</script>`,
    body,
    current: "tools"
  });
}

export function renderMovesIndex(rows, site, noindex) {
  const live = rows.filter((r) => priced(r.week)).sort((a, b) => b.week.movePct - a.week.movePct);
  const rest = rows.filter((r) => !priced(r.week));
  const newest = rows.map((r) => r.refreshed_at).sort().pop();
  const body = `<h1>Expected move this week for ${rows.length} popular stocks and funds</h1>
<p class="lede">How far the options market prices each one to move by its nearest expiry, biggest first. Every number is read from live option prices through the trading day.</p>
${newest ? `<p class="meta">Updated ${esc(etTime(newest))}.</p>` : ""}
<div class="tablewrap"><table>
<thead><tr><th>Stock</th><th>Price</th><th>Expiry</th><th>Expected move</th><th>Range, two times in three</th><th>Earnings first</th></tr></thead>
<tbody>${live.map((r) => `<tr><td><a href="${EM}/${slug(r.ticker)}"><strong>${esc(r.ticker)}</strong></a><br><small>${esc(r.name)}</small></td><td>${usd(r.spot)}</td><td>${esc(day(r.week.expiry))}</td><td><strong>±${pct(r.week.movePct)}</strong><br><small>±${usd(r.week.move)}</small></td><td>${usd(r.week.low)} to ${usd(r.week.high)}</td><td>${r.earnings_date && r.earnings_date <= r.week.expiry ? esc(day(r.earnings_date)) : ""}</td></tr>`).join("")}
${rest.map((r) => `<tr><td><a href="${EM}/${slug(r.ticker)}"><strong>${esc(r.ticker)}</strong></a><br><small>${esc(r.name)}</small></td><td colspan="5">${esc(r.error || "Not priced yet")}</td></tr>`).join("")}</tbody>
</table></div>
<h2>What an expected move is</h2>
<p>The price of an at-the-money straddle, a call and a put at the same strike, tells you how big a move the market is paying for. Divided by 0.798 it gives one standard deviation: the range the stock ends inside about two times in three if option prices are right. The <a href="/tools/expected-move-calculator">expected move calculator</a> does the same for any stock.</p>
<p><small>For information only, not investment advice.</small></p>`;
  return page({
    title: "Expected move this week for popular stocks | DeltaMint",
    description: `How far the options market prices ${rows.length} popular stocks and funds to move by their nearest expiry, updated through the trading day.`,
    canonical: `${site}${EM}`,
    head: noindex ? '<meta name="robots" content="noindex, nofollow">' : "",
    body,
    current: "tools"
  });
}

/** Sitemap lines for the pages, each with the day its numbers last changed. */
export function sitemapLines(rows, site) {
  const newest = rows.map((r) => r.refreshed_at).sort().pop();
  return [
    `  <url><loc>${site}${EM}</loc>${newest ? `<lastmod>${newest.slice(0, 10)}</lastmod>` : ""}</url>`,
    ...rows.map((r) => `  <url><loc>${site}${EM}/${slug(r.ticker)}</loc><lastmod>${String(r.refreshed_at).slice(0, 10)}</lastmod></url>`)
  ];
}
