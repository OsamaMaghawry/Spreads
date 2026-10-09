// The Claude connector on the marketing site: a homepage section, /connect,
// and the connector's own address, <site>/mcp.
//
// OUR ADDRESS, SUPABASE'S SERVER. The connector runs as a Supabase function
// (supabase/functions/mcp), but the address people paste into Claude is this
// site's /mcp. The Worker passes those requests through unchanged and says
// which site they came through (ORIGIN_HEADER); the function then names this
// address, not its own, in the sign-in pointers it gives Claude. Sign-in itself
// is still Supabase Auth, which Claude finds from there.
//
// SWITCHED ON BY CONFIGURATION, NOT BY BRANCH. The landing deploy refuses any
// tree that differs from staging's, so the code is the same everywhere and
// does nothing unless CONNECTOR_UPSTREAM is set. Each deployment sets it to
// its own project's function: wrangler.jsonc to production's,
// wrangler.staging.jsonc to staging's (connector.test.js holds them apart).
// Production's run_worker_first names "/", "/connect" and the connector paths,
// because elsewhere its Worker does not run at all; staging's runs everywhere.
//
// The words follow docs/context/compliance.md: matches to the user's filters,
// never "best" or a recommendation; DeltaMint is software, not a broker-dealer.
// Claude is named because it is the client the connector is built and tested
// with; no other assistant is claimed.

import { esc, page } from "./render.js";

export const connectorEnabled = (env) => Boolean(env && env.CONNECTOR_UPSTREAM);

// The address people paste into Claude.
export const connectorAddress = (site) => `${String(site).replace(/\/+$/, "")}/mcp`;

// Tells the function which of our sites a request came through. The function
// believes it only for origins on its own list (supabase/functions/mcp).
export const ORIGIN_HEADER = "X-DeltaMint-Public-Origin";

// /mcp itself, and the two places a client may look for its sign-in pointer
// (RFC 9728: the path-suffixed form first, then the bare one).
const METADATA_PATHS = ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"];
export const isConnectorPath = (path) => path === "/mcp" || METADATA_PATHS.includes(path);

// Only what the protocol needs crosses, in either direction. No cookies of
// this site go to Supabase, and nothing of Supabase's but the answer comes back.
const REQUEST_HEADERS = ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-session-id", "last-event-id", "user-agent"];
const RESPONSE_HEADERS = [
  "content-type", "www-authenticate", "mcp-session-id", "mcp-protocol-version", "allow",
  "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers", "access-control-expose-headers"
];

export async function proxyConnector(request, env, path) {
  const upstream = String(env.CONNECTOR_UPSTREAM).replace(/\/+$/, "");
  const target = path === "/mcp" ? upstream : `${upstream}/.well-known/oauth-protected-resource`;
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set(ORIGIN_HEADER, new URL(request.url).origin);
  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  let res;
  try {
    res = await fetch(target, { method, headers, body, redirect: "manual" });
  } catch {
    return new Response(JSON.stringify({ error: "DeltaMint could not be reached. Try again in a moment." }), {
      status: 502,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }
  const out = new Headers({ "cache-control": "no-store" });
  for (const name of RESPONSE_HEADERS) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

// Where the homepage section goes: a comment in landing/public/index.html,
// inert wherever this Worker does not run.
export const CONNECTOR_MARK = "<!-- CONNECTOR (staging Worker fills this in) -->";

const EXAMPLES = [
  "Put spreads on SPY and QQQ, 7–14 days, delta under 0.20",
  "Covered calls on the shares I hold",
  "What's open and what's at risk this week?",
  "How have my TSLA covered calls done since August?"
];

// One sample answer, internally consistent: $2 wide, credit 0.42 per share,
// max loss (2.00 - 0.42) x 100 = $158, return on risk 42 / 158 = 26.6%.
const SAMPLE_ROWS = [
  ["SPY", "560/558 put spread", "12", "0.18", "$42", "$158", "26.6%"],
  ["QQQ", "470/468 put spread", "12", "0.17", "$38", "$162", "23.5%"],
  ["SPY", "555/552 put spread", "9", "0.15", "$55", "$245", "22.4%"]
];

const SECTION_CSS = `
<style>
  .cx-box { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 28px; align-items: start; }
  .cx-lede { color: var(--ink-soft); font-size: 1.05rem; line-height: 1.6; margin: 14px 0 0; }
  .cx-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 22px; }
  .cx-chip { font-size: .82rem; padding: 6px 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); }
  .cx-ctas { display: flex; flex-wrap: wrap; gap: 10px; }
  .cx-note { margin-top: 12px; font-size: .82rem; color: var(--ink-mute); }
  .cx-chat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); padding: 16px; display: grid; gap: 12px; min-width: 0; }
  .cx-bar { display: flex; gap: 6px; }
  .cx-bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--line); }
  .cx-ask { justify-self: end; max-width: 86%; background: var(--brand-soft); color: var(--ink); border-radius: 12px 12px 4px 12px; padding: 10px 13px; font-size: .9rem; }
  .cx-tool { font-family: "IBM Plex Mono", monospace; font-size: .74rem; line-height: 1.5; color: var(--ink-mute); }
  .cx-tool b { color: var(--brand); font-weight: 500; }
  .cx-tablewrap { overflow-x: auto; }
  .cx-table { width: 100%; border-collapse: collapse; font-size: .84rem; font-variant-numeric: tabular-nums; }
  .cx-table th { text-align: left; font-weight: 500; color: var(--ink-mute); font-size: .72rem; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  /* tbody tr td outranks home.css's ".home tr:last-child td" (bold totals row) */
  .home .cx-table tbody tr td { padding: 7px 8px; border-bottom: 1px solid var(--line-soft); color: var(--ink-soft); white-space: nowrap; font-weight: 400; }
  .home .cx-table tbody tr td:first-child { color: var(--ink); font-weight: 600; }
  .home .cx-table tbody tr:last-child td { border-bottom: 0; }
  .cx-table .r { text-align: right; }
  .cx-foot { font-size: .78rem; color: var(--ink-mute); }
  @media (max-width: 860px) { .cx-box { grid-template-columns: 1fr; } }
  /* Phone: drop the days column (the request names the window) and the words
     "put spread", so RoR -- the ranking -- stays in view without scrolling. */
  @media (max-width: 560px) {
    .cx-table { font-size: .78rem; }
    .cx-chat { padding: 12px; }
    .cx-table th, .home .cx-table tbody tr td { padding: 6px 4px; }
    .cx-table th { letter-spacing: 0; }
    .cx-table .cx-days, .cx-table .cx-kind { display: none; }
  }
</style>`;

// "560/558 put spread" -> strikes always shown, the kind hidden on a phone.
const strikes = (structure) => {
  const [k, ...rest] = String(structure).split(" ");
  return `${esc(k)}<span class="cx-kind"> ${esc(rest.join(" "))}</span>`;
};

export function connectorSection() {
  const rows = SAMPLE_ROWS.map(
    (r) => `<tr><td>${esc(r[0])}</td><td>${strikes(r[1])}</td><td class="r cx-days">${esc(r[2])}</td><td class="r">${esc(r[3])}</td><td class="r">${esc(r[4])}</td><td class="r">${esc(r[5])}</td><td class="r">${esc(r[6])}</td></tr>`
  ).join("");
  return `
<!-- CONNECTOR (rendered by the staging Worker: landing/src/connector.js) -->
<section id="claude">${SECTION_CSS}
  <div class="wrap">
    <div class="cx-box">
      <div>
        <div class="eyebrow">Works with Claude</div>
        <h2>Ask Claude. It reads your DeltaMint account.</h2>
        <p class="cx-lede">Connect DeltaMint to Claude once. Then ask in plain English: Claude runs the Strategy Scanner on your filters, reads your positions and your closed trades, and answers in the chat. It is read-only — nothing it does can place, change or cancel an order.</p>
        <div class="cx-chips">${EXAMPLES.map((e) => `<span class="cx-chip">${esc(e)}</span>`).join("")}</div>
        <div class="cx-ctas">
          <a class="h-btn h-btn-brand" href="/connect">Connect to Claude</a>
          <a class="h-btn h-btn-ghost" href="/connect#can">What it can and can't do</a>
        </div>
        <p class="cx-note">You sign in to DeltaMint and approve the connection. Disconnect any time.</p>
      </div>
      <div class="cx-chat" aria-label="Sample conversation">
        <div class="cx-bar" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="cx-ask">Find put credit spreads on SPY and QQQ, 7 to 14 days out, short delta under 0.20.</div>
        <div class="cx-tool">DeltaMint · <b>find_trades</b> · put_spread · SPY, QQQ · 7–14 days</div>
        <div class="cx-tablewrap"><table class="cx-table">
          <thead><tr><th>Ticker</th><th>Spread</th><th class="r cx-days">Days</th><th class="r">Δ</th><th class="r">Credit</th><th class="r">Max loss</th><th class="r">RoR</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="cx-foot">Sample answer. Days to expiry, short delta, credit and max loss per contract, return on risk (RoR). Matches to the filters you give, ranked by RoR, with live bid/ask and the time it was read — not advice.</div>
      </div>
    </div>
  </div>
</section>`;
}

// Fill the homepage's marker. Unchanged HTML if the marker is missing, so a
// homepage edit that drops it costs the section, never the page.
export function injectConnector(html) {
  return html.includes(CONNECTOR_MARK) ? html.replace(CONNECTOR_MARK, connectorSection()) : html;
}

const CONNECT_CSS = `
<style>
  .cx-url { display: flex; gap: 8px; align-items: center; margin: 14px 0 6px; padding: 10px 10px 10px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .cx-url code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font-size: 14px; color: var(--ink); }
  .cx-copy { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
  .cx-copy:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .cx-two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 14px 0; }
  .cx-card { border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; background: var(--surface); }
  .cx-card h3 { margin: 0 0 8px; font-size: 16px; }
  .cx-card ul { margin: 0; padding-left: 20px; }
  .cx-card li { font-size: 15.5px; margin: 6px 0; }
  .doc ol.cx-steps li { margin: 10px 0; }
  @media (max-width: 700px) { .cx-two { grid-template-columns: 1fr; } }
</style>
<script>
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-copy]");
    if (!b) return;
    var t = document.getElementById(b.getAttribute("data-copy")).textContent;
    var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {});
  });
</script>`;

// The dashboard this deployment pairs with: dev-dash on staging, where the
// in-app connector page exists.
const appUrl = (env) => String(env.CONNECTOR_APP_URL || "https://dashboard.deltamint.app").replace(/\/+$/, "");

export function renderConnectPage(env, site, noindex) {
  const url = connectorAddress(site);
  const app = appUrl(env);
  const body = `
<article class="doc">
  <div class="crumbs"><a href="/">Home</a> · Claude connector</div>
  <h1>Use DeltaMint from Claude</h1>
  <p class="lede">Connect once, then ask Claude in plain English. It runs DeltaMint's Strategy Scanner on your filters, reads your positions, option chains and closed trades, and answers in the chat — with the same numbers DeltaMint shows. It is read-only: nothing it does can place a trade.</p>

  <h2>Connector address</h2>
  <div class="cx-url"><code id="cx-mcp">${esc(url)}</code><button class="cx-copy" type="button" data-copy="cx-mcp">Copy</button></div>

  <h2>Add it to Claude</h2>
  <ol class="cx-steps">
    <li>In Claude, open <strong>Settings</strong>, then <strong>Connectors</strong>.</li>
    <li>Choose <strong>Add custom connector</strong>, name it DeltaMint, and paste the address above.</li>
    <li>Click <strong>Add</strong>, then <strong>Connect</strong>. Sign in to DeltaMint when asked and choose <strong>Allow</strong>.</li>
    <li>Ask away. Try one of the questions below.</li>
  </ol>

  <h2 id="can">What it can and can't do</h2>
  <div class="cx-two">
    <div class="cx-card">
      <h3>Claude can</h3>
      <ul>
        <li>List your connected accounts, balances and buying power</li>
        <li>Read your open positions as the Dashboard groups them</li>
        <li>Run the Strategy Scanner on the filters you give it</li>
        <li>Read option chains for the symbols you ask about</li>
        <li>Read your closed trades, totals and win rate</li>
      </ul>
    </div>
    <div class="cx-card">
      <h3>Claude can't</h3>
      <ul>
        <li>Place, change or cancel any order</li>
        <li>Change your accounts, settings or billing</li>
        <li>See your password or your broker login</li>
      </ul>
    </div>
  </div>
  <p>Trades it finds are matches to the filters you set, ranked by return on risk — the Scanner's own ranking. They are not recommendations. To place one, you open DeltaMint and send it yourself, and DeltaMint checks the price again before anything goes to your broker.</p>

  <h2>Questions to try</h2>
  <ul>
    ${EXAMPLES.map((e) => `<li>“${esc(e)}”</li>`).join("\n    ")}
    <li>“Show me the AAPL chain for next Friday.”</li>
  </ul>

  <h2>Your data</h2>
  <p>Claude sees your DeltaMint data only after you sign in and choose Allow, and only while the connector is connected. Disconnect any time in Claude's connector settings, or in DeltaMint under <a href="${esc(app)}/connect-claude">Use with Claude</a>. DeltaMint is software, not a broker-dealer or investment adviser.</p>

  <p class="startfree"><a class="btn btn-primary" href="${esc(app)}/register?ref=connect">Create a free DeltaMint account</a></p>
</article>`;
  return page({
    title: "Use DeltaMint from Claude — DeltaMint",
    description: "Connect DeltaMint to Claude and ask about your positions, trades and scans in plain English. Read-only.",
    canonical: `${site}/connect`,
    head: CONNECT_CSS + (noindex ? '<meta name="robots" content="noindex">' : ""),
    body,
    current: null
  });
}
