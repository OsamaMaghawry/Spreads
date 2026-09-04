import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch } from "../_shared/alpaca.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { getSpots, getClosingSpots } from "../_shared/marketPrice.ts";
import { parseOCCSymbol } from "../_shared/occ.ts";
import { earningsThrough, daysUntil } from "../_shared/earnings.ts";
import { sendEmail } from "../_shared/email.ts";
import { accountFacts, buildDailyReport } from "../_shared/watchReport.ts";
import { sharesByTicker, nakedShortCalls, judgeOnLivePrices } from "../_shared/watchRules.ts";

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
  // Tickers whose price could not be judged this run, with why. Collected
  // rather than raised per leg, and handed back so reconcile knows which
  // conditions were never actually evaluated.
  const unjudged = new Map();
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
        // One note per TICKER, not per leg, and recorded rather than raised
        // here -- four short MSFT contracts are one price problem, and used to
        // send four identical lines.
        unjudged.set(occ.ticker, { reason: spot?.reason || "no price", price: null });
      } else if (!spot.trusted) {
        unjudged.set(occ.ticker, { reason: spot.reason, price: spot.price });
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
  // One liveness note per ticker, at info severity, carrying the reason.
  //
  // This is not something the owner can act on in a broker: it says "I am
  // watching and cannot currently see", which belongs in the daily report and
  // not in the inbox. The session email sends only conditions about positions,
  // so a run that raises nothing but these sends nothing at all. The reason was
  // being stored and never shown, which is why the mail could not be understood
  // by the person receiving it.
  for (const [ticker, info] of unjudged) {
    add("price_untrusted", "info", ticker,
      info.price
        ? `Can't judge ${ticker} — ${info.reason}; last seen $${Number(info.price).toFixed(2)}`
        : `Can't judge ${ticker} — ${info.reason}`,
      { price: info.price, reason: info.reason });
  }

  return { raised, legs: parsed, unjudged: new Set(unjudged.keys()) };
}

// Persist raised conditions; return the ones that are new or escalated, which
// are the only ones worth an email.
async function reconcile(admin, account, raised, unjudged = new Set()) {
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
      .select("id, severity, emailed_at, resolved_at")
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
      // A condition that comes back is open again. Without clearing this, a row
      // resolved earlier in the day kept resolved_at set while last_seen_at
      // went on advancing: invisible in the open list, and never notified
      // again. Twelve of one day's rows were in exactly that state.
      const returning = !!existing.resolved_at;
      await admin.from("alerts").update({
        last_seen_at: new Date().toISOString(),
        severity: escalated ? r.severity : existing.severity,
        title: r.title,
        detail: r.detail,
        resolved_at: null,
        // A critical that returns must reach the owner, so the day-keyed
        // dedupe is cleared for it. A warning that flaps must not, or a
        // borderline strike would mail on every fifteen-minute pass.
        ...(returning && r.severity === "critical" ? { emailed_at: null } : {})
      }).eq("id", existing.id);
      if (escalated || !existing.emailed_at || (returning && r.severity === "critical")) {
        toNotify.push({ ...r, id: existing.id });
      }
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
  // Rules whose answer depends on a price we may not have had this run.
  const PRICE_DEPENDENT = new Set(["short_through_strike", "short_near_strike"]);
  const stale = (open || []).filter((o) => {
    if (seenConditions.has(`${o.rule}·${o.symbol || ""}`)) return false;
    // Unknown is not resolved.
    //
    // When a spot went untrusted the leg fell into the price_untrusted branch,
    // so short_through_strike was never re-raised, so it was not in
    // seenConditions, so it was marked resolved -- while still true. Four ITM
    // criticals were closed that way in a single day (NFLX 82C, NVDA 222.5C,
    // NVDA 225P, MU 950C), every one of them still being seen hours later, and
    // because the daily report reads open alerts as resolved_at is null, all
    // four were missing from the report that evening. "I could not look" was
    // being recorded as "it is gone".
    if (PRICE_DEPENDENT.has(o.rule)) {
      const ticker = parseOCCSymbol(o.symbol || "")?.ticker || o.symbol;
      if (unjudged.has(ticker)) return false;
    }
    return true;
  });
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
        // Judged on the close whenever the market is shut — decided by the
        // clock, not by the mode.
        //
        // The live ladder marks anything older than thirty minutes untrusted,
        // which outside the session is every price there is. That cure was
        // written for `daily` only, so the session watch walked into the same
        // wall twice a day: the ten runs it makes between 13:00 and 13:30 and
        // between 20:00 and 21:59 UTC judged live prices on a market that was
        // not trading. Those runs raised nothing but "price not trusted" and
        // never reached the rules that matter.
        const live = judgeOnLivePrices();
        const spots = tickers.length
          ? await (mode === "daily" || !live ? getClosingSpots(account, tickers) : getSpots(account, tickers))
          : {};
        const through = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
        const earnings = tickers.length ? await earningsThrough(admin, tickers, through) : {};

        const allPositions = Array.isArray(positions) ? positions : [];
        const { raised, legs: parsedLegs, unjudged } = evaluate(
          account, legs, spots, earnings, equity, settings,
          sharesByTicker(allPositions),
          info?.cash !== undefined ? parseFloat(info.cash) : null
        );
        const toNotify = await reconcile(admin, account, raised, unjudged);

        // The session email carries conditions about POSITIONS only.
        //
        // Liveness notes are recorded and shown in the daily report, but they
        // are not something the owner can act on in a broker, and mailing them
        // is what filled the inbox: of one day's twelve emails, most carried
        // nothing but "price not trusted". A run that raises only info now
        // sends nothing at all.
        const mailable = toNotify.filter((t) => t.severity !== "info");
        if (mode === "watch" && mailable.length) {
          const { html, text } = alertEmail(account.name, mailable);
          const r = await sendEmail(recipient, `DeltaMint alert — ${account.name}`, html, text);
          if (r.sent) {
            const ids = mailable.map((t) => t.id).filter(Boolean);
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
