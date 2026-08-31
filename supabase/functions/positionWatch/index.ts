import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch } from "../_shared/alpaca.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { getSpots } from "../_shared/marketPrice.ts";
import { parseOCCSymbol } from "../_shared/occ.ts";
import { earningsThrough, daysUntil } from "../_shared/earnings.ts";
import { sendEmail } from "../_shared/email.ts";

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
function evaluate(account, positions, spots, earnings, equity, settings) {
  const raised = [];
  const add = (rule, severity, symbol, title, detail) =>
    raised.push({ rule, severity, symbol, title, detail });

  for (const p of positions) {
    const occ = parseOCCSymbol(p.symbol);
    if (!occ) continue; // a share position, not an option leg
    const qty = parseFloat(p.qty); // signed: negative = short
    const isShort = qty < 0;
    const isCall = occ.type === "C";
    const spot = spots[occ.ticker];

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
  return raised;
}

// Persist raised conditions; return the ones that are new or escalated, which
// are the only ones worth an email.
async function reconcile(admin, account, raised) {
  const day = todayKey();
  const toNotify = [];
  const seenKeys = new Set();

  for (const r of raised) {
    const dedupe_key = `${account.id}·${r.rule}·${r.symbol || ""}·${day}`;
    seenKeys.add(dedupe_key);
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

  // Resolve today's alerts for this account that no longer appear.
  const { data: open } = await admin
    .from("alerts")
    .select("id, dedupe_key")
    .eq("account_id", account.id)
    .is("resolved_at", null)
    .like("dedupe_key", `%·${day}`);
  for (const o of open || []) {
    if (!seenKeys.has(o.dedupe_key)) {
      await admin.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", o.id);
    }
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

function dailyEmail(perAccount) {
  const blocks = perAccount.map(({ name, openAlerts }) => {
    const body = openAlerts.length
      ? openAlerts.map((a) => `<tr><td style="padding:5px 10px">${sev(a.severity)}</td><td style="padding:5px 10px">${a.title}</td></tr>`).join("")
      : `<tr><td colspan="2" style="padding:5px 10px;color:#0F6E56">Nothing flagged.</td></tr>`;
    return `<p style="font-size:14px;font-weight:600;margin:14px 0 4px">${name}</p><table style="border-collapse:collapse;font-size:13px">${body}</table>`;
  }).join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
    <p style="font-size:15px;font-weight:600">DeltaMint — daily position report</p>
    <p style="font-size:12px;color:#94a3b8">${todayKey()}</p>
    ${blocks}
    <p style="font-size:11px;color:#94a3b8;margin-top:16px">A monitoring summary, not advice. Your broker's records govern.</p>
  </div>`;
  return { html, text: `DeltaMint daily report ${todayKey()}` };
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
        const spots = tickers.length ? await getSpots(account, tickers) : {};
        const through = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
        const earnings = tickers.length ? await earningsThrough(admin, tickers, through) : {};

        const raised = evaluate(account, legs, spots, earnings, equity, settings);
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
          .select("severity, title")
          .eq("account_id", account.id)
          .is("resolved_at", null)
          .order("severity", { ascending: false });
        perAccount.push({ name: account.name, openAlerts: openAlerts || [] });
      } catch (e) {
        console.error(`positionWatch ${account.id}: ${e?.message || e}`);
        perAccount.push({ name: account.name, openAlerts: [{ severity: "warning", title: `Could not read this account: ${e?.message || e}` }] });
      }
    }

    if (mode === "daily") {
      const { html, text } = dailyEmail(perAccount);
      await sendEmail(recipient, `DeltaMint — daily position report ${todayKey()}`, html, text);
    }

    return jsonResponse({ mode, accounts: perAccount.length });
  } catch (error) {
    console.error("positionWatch failed", error?.message || error);
    return jsonResponse({ error: error.message }, 500);
  }
});
