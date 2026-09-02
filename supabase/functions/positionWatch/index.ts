import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch } from "../_shared/alpaca.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { getSpots, getClosingSpots } from "../_shared/marketPrice.ts";
import { parseOCCSymbol } from "../_shared/occ.ts";
import { earningsThrough, daysUntil } from "../_shared/earnings.ts";
import { sendEmail } from "../_shared/email.ts";
import { accountFacts, buildDailyReport } from "../_shared/watchReport.ts";
import { sharesByTicker, nakedShortCalls } from "../_shared/watchRules.ts";

// The money-safety watch.
//
// Runs on a schedule (pg_cron -> this function), reads every connected account's
// RAW broker positions, applies head-of-trading's rules, and records anything
// that is off. It emails the owner what is new or newly worse, and once a day
// sends a plain report whether or not anything fired.
//
// Why raw positions and not the dashboard's paired view: the pairing drops any
// leg it cannot partner, so a naked short — the single most dangerous thing an
// account can hold — is invisible on the dashboard. The watch reads
// GET /v2/positions directly and reasons per leg, so the thing most worth an
// alert is exactly the thing it can see.
//
// Trust is honoured, not defaulted. A price the trust ladder rejects never
// silently becomes a moneyness verdict; it becomes an alert that the watch
// could not judge the position, which is itself worth knowing.

// One connected account, credentials decrypted for the length of this request.
async function loadAllAccounts(admin) {
  const { data, error } = await admin
    .from("trading_accounts")
    .select("*")
    .or("oauth_access_token.not.is.null,api_key.not.is.null");
  if (error) throw new Error(error.message);
  const out = [];
  for (const a of data || []) {
    out.push({
      ...a,
      api_key: await decryptSecret(a.api_key),
      api_secret: await decryptSecret(a.api_secret),
      oauth_access_token: await decryptSecret(a.oauth_access_token)
    });
  }
  return out;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

// The rules. Each returns zero or more raised conditions for one account.
// Thresholds come from watch_settings — never a literal here.
function evaluate(account, positions, spots, earnings, equity, settings, shares = {}, cash = null) {
  const raised = [];
  // Parsed once here and handed back, so the report does not re-parse OCC
  // symbols to say how many legs an account holds.
  const parsed = [];
  const add = (rule, severity, symbol, title, detail) =>
    raised.push({ rule, severity, symbol, title, detail });

  for (const p of positions) {
    const occ = parseOCCSymbol(p.symbol);
    if (!occ) continue; // a share position, not an option leg
    const qty = parseFloat(p.qty); // signed: negative = short
    const isShort = qty < 0;
    const isCall = occ.type === "C";
    const spot = spots[occ.ticker];
    parsed.push({ symbol: p.symbol, occ, qty, marketValue: parseFloat(p.market_value || "0") });

    // Rule: a short leg through or near its strike, judged only on a trusted
    // price. An untrusted price is its own alert, not a silent pass.
    if (isShort) {
      if (!spot || !(spot.price > 0)) {
        add("price_untrusted", "warning", p.symbol,
          `Can't judge ${occ.ticker} ${occ.strike}${occ.type} — no usable price`,
          { reason: spot?.reason || "no price" });
      } else if (!spot.trusted) {
        add("price_untrusted", "warning", p.symbol,
          `${occ.ticker} price not trusted — ${occ.strike}${occ.type} unjudged`,
          { price: spot.price, reason: spot.reason });
      } else {
        const through = isCall ? spot.price >= occ.strike : spot.price <= occ.strike;
        const near = Math.abs(spot.price - occ.strike) / occ.strike <= settings.strike_proximity_pct;
        if (through) {
          add("short_through_strike", "critical", p.symbol,
            `${occ.ticker} ${occ.strike}${occ.type} is in the money — spot ${spot.price.toFixed(2)}`,
            { spot: spot.price, strike: occ.strike, qty });
        } else if (near) {
          add("short_near_strike", "warning", p.symbol,
            `${occ.ticker} ${occ.strike}${occ.type} is within ${(settings.strike_proximity_pct * 100).toFixed(0)}% of its strike`,
            { spot: spot.price, strike: occ.strike, qty });
        }
      }
    }

    // Rule: earnings before this contract expires, inside the window.
    const e = earnings[occ.ticker];
    if (e && e.reportDate && e.reportDate <= occ.expiryFormatted) {
      const d = daysUntil(e.reportDate);
      if (d <= settings.earnings_within_days) {
        add("earnings_before_expiry", "warning", p.symbol,
          `${occ.ticker} reports ${e.reportDate}, before the ${occ.strike}${occ.type} expiry`,
          { report_date: e.reportDate, expiry: occ.expiryFormatted, days: d });
      }
    }

    // Rule: a single position past a share of account equity. Uses the broker's
    // own market value, which does not depend on our pairing or pricing.
    const mv = Math.abs(parseFloat(p.market_value || "0"));
    if (equity > 0 && mv / equity > settings.position_max_pct) {
      add("position_oversized", "warning", p.symbol,
        `${occ.ticker} ${occ.strike}${occ.type} is ${((mv / equity) * 100).toFixed(0)}% of account equity`,
        { market_value: mv, equity, pct: mv / equity });
    }
  }

  // Rule: a short call the shares in this account do not cover. Unlimited
  // risk, and exactly the position the dashboard's pairing used to hide. It
  // fires whatever the price is doing -- a naked call is critical at any spot.
  for (const n of nakedShortCalls(parsed, shares, cash)) {
    add("naked_short_call", "critical", n.symbol,
      `${n.occ.ticker} ${n.occ.strike}C: ${n.uncovered} of ${n.contracts} short uncovered — no long call and ${n.shares} shares behind it`,
      { contracts: n.contracts, uncovered: n.uncovered, shares: n.shares, coveredByLongs: n.coveredByLongs });
  }
  return { raised, legs: parsed };
}

// Persist raised conditions; return the ones that are new or escalated, which
// are the only ones worth an email.
async function reconcile(admin, account, raised) {
  const day = todayKey();
  const toNotify = [];
  // Matched on the condition itself rather than the dated key, because the same
  // condition raised yesterday and still true today is ONE condition.
  const seenConditions = new Set();

  for (const r of raised) {
    const dedupe_key = `${account.id}·${r.rule}·${r.symbol || ""}·${day}`;
    seenConditions.add(`${r.rule}·${r.symbol || ""}`);
    const { data: existing } = await admin
      .from("alerts")
      .select("id, severity, emailed_at")
      .eq("dedupe_key", dedupe_key)
      .maybeSingle();

    const sevRank = { info: 0, warning: 1, critical: 2 };
    if (!existing) {
      const { data: ins } = await admin.from("alerts").insert({
        user_id: account.user_id,
        account_id: account.id,
        rule: r.rule,
        severity: r.severity,
        symbol: r.symbol,
        title: r.title,
        detail: r.detail,
        dedupe_key
      }).select("id").single();
      toNotify.push({ ...r, id: ins?.id });
    } else {
      const escalated = sevRank[r.severity] > sevRank[existing.severity];
      await admin.from("alerts").update({
        last_seen_at: new Date().toISOString(),
        severity: escalated ? r.severity : existing.severity,
        title: r.title,
        detail: r.detail
      }).eq("id", existing.id);
      if (escalated || !existing.emailed_at) toNotify.push({ ...r, id: existing.id });
    }
  }

  // Resolve anything for this account that this run did not re-raise --
  // whatever day its key carries.
  //
  // This used to filter on `%·<today>`, so an alert raised yesterday and no
  // longer true was never resolved, while today's run wrote a fresh row under
  // today's key. The open set therefore grew by every condition, every weekday,
  // and the daily report read back all of it: thirteen rows becomes twenty-six
  // becomes thirty-nine, none of them ever going away.
  const { data: open } = await admin
    .from("alerts")
    .select("id, rule, symbol")
    .eq("account_id", account.id)
    .is("resolved_at", null);
  const stale = (open || []).filter((o) => !seenConditions.has(`${o.rule}·${o.symbol || ""}`));
  if (stale.length) {
    await admin
      .from("alerts")
      .update({ resolved_at: new Date().toISOString() })
      .in("id", stale.map((o) => o.id));
  }

  return toNotify;
}

const sev = (s) => (s === "critical" ? "🔴" : s === "warning" ? "🟠" : "⚪");

function alertEmail(accountName, items) {
  const rows = items
    .map((i) => `<tr><td style="padding:6px 10px">${sev(i.severity)}</td><td style="padding:6px 10px">${i.title}</td></tr>`)
    .join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
    <p style="font-size:15px;font-weight:600">DeltaMint — ${accountName}</p>
    <p style="font-size:13px;color:#475569">Something in this account needs a look:</p>
    <table style="border-collapse:collapse;font-size:13px">${rows}</table>
    <p style="font-size:11px;color:#94a3b8;margin-top:16px">A monitoring alert, not advice. Positions are yours; check them in your broker. DeltaMint never holds your funds or securities.</p>
  </div>`;
  const text = items.map((i) => `- ${i.title}`).join("\n");
  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { mode = "watch" } = await req.json().catch(() => ({}));
    const admin = adminClient();

    const { data: settings } = await admin.from("watch_settings").select("*").eq("id", true).maybeSingle();
    if (!settings?.enabled) return jsonResponse({ skipped: "watch disabled" });
    const recipient = settings.recipient_email;

    const accounts = await loadAllAccounts(admin);
    const perAccount = [];

    for (const account of accounts) {
      try {
        const base = tradingBase(account);
        const [info, positions] = await Promise.all([
          alpacaFetch(`${base}/account`, account),
          alpacaFetch(`${base}/positions`, account)
        ]);
        const equity = parseFloat(info?.equity || info?.portfolio_value || "0");
        const legs = (Array.isArray(positions) ? positions : []).filter((p) => parseOCCSymbol(p.symbol));
        const tickers = [...new Set(legs.map((p) => parseOCCSymbol(p.symbol).ticker))];
        // After the close, judged on the close. The live ladder marks anything
        // older than thirty minutes untrusted, which at 21:15 UTC is every
        // price there is -- so the daily report raised nothing but
        // "price not trusted" and could never reach the rules that matter.
        const spots = tickers.length
          ? await (mode === "daily" ? getClosingSpots(account, tickers) : getSpots(account, tickers))
          : {};
        const through = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
        const earnings = tickers.length ? await earningsThrough(admin, tickers, through) : {};

        const allPositions = Array.isArray(positions) ? positions : [];
        const { raised, legs: parsedLegs } = evaluate(
          account, legs, spots, earnings, equity, settings,
          sharesByTicker(allPositions),
          info?.cash !== undefined ? parseFloat(info.cash) : null
        );
        const toNotify = await reconcile(admin, account, raised);

        if (mode === "watch" && toNotify.length) {
          const { html, text } = alertEmail(account.name, toNotify);
          const r = await sendEmail(recipient, `DeltaMint alert — ${account.name}`, html, text);
          if (r.sent) {
            const ids = toNotify.map((t) => t.id).filter(Boolean);
            if (ids.length) await admin.from("alerts").update({ emailed_at: new Date().toISOString() }).in("id", ids);
          }
        }

        const { data: openAlerts } = await admin
          .from("alerts")
          .select("rule, severity, title")
          .eq("account_id", account.id)
          .is("resolved_at", null)
          .gte("first_seen_at", `${todayKey()}T00:00:00Z`)
          .order("severity", { ascending: false });
        perAccount.push({
          name: account.name,
          alerts: openAlerts || [],
          // Seven days, not the earnings window: "expiring soon" is about
          // gamma and assignment, which is a different question from whether a
          // company reports before expiry.
          facts: accountFacts(parsedLegs, spots, 7)
        });
      } catch (e) {
        console.error(`positionWatch ${account.id}: ${e?.message || e}`);
        perAccount.push({
          name: account.name,
          // An account we could not read is itself worth a line — it is the one
          // failure that IS actionable, since nothing about it was checked.
          alerts: [{ rule: "account_unreadable", severity: "critical", title: `Could not read this account: ${e?.message || e}` }],
          facts: null
        });
      }
    }

    if (mode === "daily") {
      const { html, text, actionable } = buildDailyReport(perAccount, todayKey());
      const subject = actionable
        ? `DeltaMint — ${actionable} to look at · ${todayKey()}`
        : `DeltaMint — all clear · ${todayKey()}`;
      await sendEmail(recipient, subject, html, text);
    }

    return jsonResponse({ mode, accounts: perAccount.length });
  } catch (error) {
    console.error("positionWatch failed", error?.message || error);
    return jsonResponse({ error: error.message }, 500);
  }
});
