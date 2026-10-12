// The market emails. Three modes, all called by the scheduler with a cron
// ticket (trigger_market_mail in 0061), never by a browser:
//
//   brief     Every 15 minutes in the morning; acts only between 8:40 and
//             9:25 New York time on a trading day. Builds the morning in
//             steps -- research, market section, then one email per reader --
//             storing each step as it finishes and starting the next run
//             itself, because a free-plan function gets 150 seconds and the
//             research alone can take most of that.
//   alerts    Every 15 minutes in the session; acts only while Alpaca's clock
//             says the market is open. New headlines on held stocks are judged
//             once each; a major one, or a move of 5% either way, is emailed
//             to the readers who hold that stock, at most six a day each.
//   preview   For the owner's review: the brief now, whatever the time, stamped
//             [Preview]. `fresh: true` redoes this morning's research.
//   alerts-preview  The alert pass over the last `hours` of news (default 24),
//             at most three emails, nothing recorded as judged.
//
// WHO RECEIVES THEM is app_settings.market_mail_delivery: "off", "owner" (the
// default, watch_settings.recipient_email, for their own accounts) or
// "users". The owner reviews the writing, the news and the design on real
// mornings before it is "users".

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
import { inBackground } from "../_shared/background.ts";
import { alpacaFetch, tradingBase, loadAccount } from "../_shared/alpaca.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { fetchSnapTradeRaw } from "../_shared/snaptradeAccount.ts";
import { earningsThrough } from "../_shared/earnings.ts";
import { sendEmail } from "../_shared/email.ts";
import { digestRelay } from "../_shared/settings.ts";
import {
  etClock, inBriefWindow, MARKET_TAPE, moveFromSnapshot, holdingsOf, renderBrief, renderAlert, pct, usd,
  type AccountHoldings, type HoldingLine, type MarketSection, type Move, type SymbolNote
} from "../_shared/marketMail.ts";
import { researchOvernight, writeMarket, writeHoldingNotes, triageNews } from "../_shared/marketWriter.ts";
import { isTradingDay, marketOpen, snapshots, news } from "../_shared/marketFeed.ts";

type Admin = ReturnType<typeof adminClient>;
interface Reader { userId: string; email: string }

const PURPOSE = "market_mail";
const DAILY_ALERT_CAP = 6;
const BIG_MOVE = 0.05;
const STEP_LOCK_SECONDS = 160;

// ---------- who, and with what data ----------

async function delivery(admin: Admin): Promise<"off" | "owner" | "users"> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "market_mail_delivery").maybeSingle();
  return data?.value === "users" ? "users" : data?.value === "off" ? "off" : "owner";
}

async function userIdByEmail(admin: Admin, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u: any) => String(u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function readersFor(admin: Admin, mode: "owner" | "users"): Promise<Reader[]> {
  if (mode === "owner") {
    const { data } = await admin.from("watch_settings").select("recipient_email").eq("id", true).maybeSingle();
    const email = data?.recipient_email;
    if (!email) throw new Error("watch_settings.recipient_email is not set");
    const userId = await userIdByEmail(admin, email);
    if (!userId) throw new Error(`no DeltaMint user signs in as the owner's address ${email}`);
    return [{ userId, email }];
  }
  const { data: rows } = await admin.from("trading_accounts").select("user_id");
  const ids = [...new Set((rows || []).map((r: any) => r.user_id))];
  const out: Reader[] = [];
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) out.push({ userId: id, email: data.user.email });
  }
  return out;
}

const connected = (a: any) => a.provider === "snaptrade" || a.api_key || a.oauth_access_token;

// Market data -- prices and news -- is public information, read on one
// account for every reader: the house data account where one is set, else
// the first account connected directly to Alpaca.
async function dataAccount(admin: Admin): Promise<any> {
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "house_data_account").maybeSingle();
  let q = admin.from("trading_accounts").select("*").or("oauth_access_token.not.is.null,api_key.not.is.null");
  if (typeof setting?.value === "string") q = q.eq("id", setting.value);
  const { data } = await q.order("created_at").limit(1);
  const row = data?.[0];
  if (!row) throw new Error("no account connected to Alpaca to read market data with");
  return {
    ...row,
    api_key: await decryptSecret(row.api_key),
    api_secret: await decryptSecret(row.api_secret),
    oauth_access_token: await decryptSecret(row.oauth_access_token)
  };
}

async function readerHoldings(admin: Admin, userId: string): Promise<AccountHoldings[]> {
  const { data: rows } = await admin
    .from("trading_accounts")
    .select("id, name, is_paper, provider, api_key, oauth_access_token")
    .eq("user_id", userId)
    .order("created_at");
  const out: AccountHoldings[] = [];
  for (const row of (rows || []).filter(connected)) {
    try {
      const account = await loadAccount(admin, row.id, userId, { readOnly: true });
      const positions = account.provider === "snaptrade"
        ? (await fetchSnapTradeRaw(admin, account)).positions
        : await alpacaFetch(`${tradingBase(account)}/positions`, account);
      out.push({ name: row.name, isPaper: !!row.is_paper, holdings: holdingsOf(positions) });
    } catch (e) {
      console.error(`marketMail holdings ${row.id}: ${(e as Error)?.message || e}`);
      out.push({ name: row.name, isPaper: !!row.is_paper, holdings: [], error: String((e as Error)?.message || e) });
    }
  }
  return out;
}

// ---------- sending ----------

// Direct through Brevo where this project has the key. Staging has none, so an
// owner copy relays through production's sendDigest, which can only ever mail
// the owner (see sendDigest). A user's email is never relayed.
async function deliver(admin: Admin, to: string, mail: { subject: string; html: string; text: string }, ownerOnly: boolean) {
  const direct = await sendEmail(to, mail.subject, mail.html, mail.text);
  if (direct.sent || !direct.skipped || !ownerOnly) return direct;
  const relay = await digestRelay(admin);
  if (!relay) return direct;
  try {
    const res = await fetch(`${relay.url.replace(/\/$/, "")}/functions/v1/sendDigest`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(relay.key ? { authorization: `Bearer ${relay.key}`, apikey: relay.key } : {}) },
      body: JSON.stringify(mail)
    });
    return res.ok ? { sent: true } : { sent: false, error: `relay ${res.status}: ${await res.text()}` };
  } catch (e) {
    return { sent: false, error: `relay: ${(e as Error)?.message || e}` };
  }
}

async function logged(admin: Admin, kind: string, userId: string, ref: string) {
  const { data } = await admin.from("market_mail_log").select("id").eq("kind", kind).eq("user_id", userId).eq("ref", ref).maybeSingle();
  return !!data;
}

async function log(admin: Admin, kind: string, userId: string, ref: string, symbol: string | null, subject: string) {
  await admin.from("market_mail_log").insert({ kind, user_id: userId, ref, symbol, subject });
}

// The next step of the brief, as a new run with its own time budget.
async function chain(admin: Admin, body: Record<string, unknown>) {
  const { data: ticket, error } = await admin.rpc("mint_cron_ticket", { p_purpose: PURPOSE });
  if (error) throw new Error(`chain: ${error.message}`);
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/marketMail`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ ...body, ticket })
  });
}

// ---------- the brief ----------

async function claim(admin: Admin, day: string): Promise<any | null> {
  await admin.from("market_mail_runs").upsert({ day }, { onConflict: "day", ignoreDuplicates: true });
  const now = new Date();
  const until = new Date(now.getTime() + STEP_LOCK_SECONDS * 1000).toISOString();
  const { data } = await admin
    .from("market_mail_runs")
    .update({ locked_until: until, updated_at: now.toISOString() })
    .eq("day", day)
    .or(`locked_until.is.null,locked_until.lt."${now.toISOString()}"`)
    .select("*");
  return data?.[0] || null;
}

const release = (admin: Admin, day: string, patch: Record<string, unknown> = {}) =>
  admin.from("market_mail_runs").update({ ...patch, locked_until: null, updated_at: new Date().toISOString() }).eq("day", day);

async function brief(admin: Admin, body: any, preview: boolean) {
  const clock = etClock();
  const setting = await delivery(admin);
  if (!preview && setting === "off") return { skipped: "delivery is off" };
  if (!preview && !inBriefWindow(clock)) return { skipped: `outside the brief window (${clock.minutes} min ET)` };
  const data = await dataAccount(admin);
  if (!preview && !(await isTradingDay(data, clock.day))) return { skipped: `${clock.day} is not a trading day` };

  if (preview && body.fresh && !body.chained) {
    await admin.from("market_mail_runs").upsert({ day: clock.day, research: null, research_urls: null, research_at: null, market: null, market_at: null, locked_until: null }, { onConflict: "day" });
  }
  const run = await claim(admin, clock.day);
  if (!run) return { skipped: "another run holds this morning" };
  const next = { mode: body.mode, chained: true };
  const when = {
    date: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "full" }).format(new Date()),
    time: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date()) + " ET"
  };

  try {
    if (!run.research) {
      const r = await researchOvernight(when);
      await release(admin, clock.day, { research: r.notes, research_urls: r.urls, research_at: new Date().toISOString(), last_error: null });
      await chain(admin, next);
      return { step: "research", urls: r.urls.length };
    }

    if (!run.market) {
      const tapeSnaps = await snapshots(data, MARKET_TAPE.map(([s]) => s));
      const tape = MARKET_TAPE.map(([s, label]) => moveFromSnapshot(s, tapeSnaps[s], label));
      const since = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
      const headlines = await news(data, { start: since, pages: 1 });
      const market = await writeMarket({ ...when, tape, research: run.research, researchUrls: run.research_urls || [], news: headlines });
      await release(admin, clock.day, { market: { ...market, tape }, market_at: new Date().toISOString(), last_error: null });
      await chain(admin, next);
      return { step: "market" };
    }

    const sent = await sendBriefs(admin, data, run, setting === "users" && !preview ? "users" : "owner", preview);
    await release(admin, clock.day, { last_error: null });
    return { step: "send", sent };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error(`marketMail brief: ${msg}`);
    await release(admin, clock.day, { last_error: msg.slice(0, 1000) });
    return { error: msg };
  }
}

async function sendBriefs(admin: Admin, data: any, run: any, who: "owner" | "users", preview: boolean) {
  const readers = await readersFor(admin, who);
  const day = run.day;
  const market = run.market as MarketSection & { tape: Move[] };
  const todo: { reader: Reader; accounts: AccountHoldings[] }[] = [];
  for (const reader of readers) {
    if (!preview && (await logged(admin, "brief", reader.userId, day))) continue;
    todo.push({ reader, accounts: await readerHoldings(admin, reader.userId) });
  }
  if (!todo.length) return 0;

  // One pass over every held stock, however many readers hold it.
  const symbols = [...new Set(todo.flatMap((t) => t.accounts.flatMap((a) => a.holdings.map((h: HoldingLine) => h.symbol))))];
  const snaps = symbols.length ? await snapshots(data, symbols) : {};
  const moves = new Map(symbols.map((s) => [s, moveFromSnapshot(s, snaps[s])]));
  const through = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const er = symbols.length ? await earningsThrough(admin, symbols, through) : {};
  const earnings: Record<string, string> = {};
  for (const [s, ev] of Object.entries(er)) if ((ev as any)?.report_date) earnings[s] = (ev as any).report_date;
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const held = symbols.length ? await news(data, { symbols, start: since, pages: 1 }) : [];
  const bySymbol = new Map(symbols.map((s) => [s, held.filter((n) => n.symbols?.includes(s))]));
  const written = await writeHoldingNotes(symbols.map((s) => ({
    symbol: s, move: moves.get(s) || null, earnings: earnings[s] || null, news: bySymbol.get(s) || []
  })));
  const notes = new Map<string, SymbolNote>(written.map((n) => [n.symbol, n]));

  let sent = 0;
  for (const { reader, accounts } of todo) {
    const mail = renderBrief({
      date: new Date(), market, tape: market.tape, tapeAsOf: market.tape.find((t) => t.asOf)?.asOf || null,
      accounts, notes, moves, earnings, preview
    });
    const r = await deliver(admin, reader.email, mail, who === "owner");
    if (r.sent) {
      sent++;
      await log(admin, preview ? "preview" : "brief", reader.userId, preview ? `brief:${new Date().toISOString()}` : day, null, mail.subject);
    } else {
      console.error(`marketMail brief to ${reader.userId}: ${(r as any).error || (r as any).skipped}`);
    }
  }
  return sent;
}

// ---------- intraday alerts ----------

async function alerts(admin: Admin, body: any, preview: boolean) {
  const setting = await delivery(admin);
  if (!preview && setting === "off") return { skipped: "delivery is off" };
  const data = await dataAccount(admin);
  if (!preview && !(await marketOpen(data))) return { skipped: "market closed" };
  const clock = etClock();
  const readers = await readersFor(admin, setting === "users" && !preview ? "users" : "owner");

  // symbol -> who holds it, and how
  const holders = new Map<string, { reader: Reader; account: string; lines: string[] }[]>();
  for (const reader of readers) {
    for (const a of await readerHoldings(admin, reader.userId)) {
      for (const h of a.holdings) {
        const list = holders.get(h.symbol) || [];
        list.push({ reader, account: a.name, lines: h.lines });
        holders.set(h.symbol, list);
      }
    }
  }
  const symbols = [...holders.keys()];
  if (!symbols.length) return { skipped: "nothing held" };

  const hours = preview ? Math.min(72, Number(body.hours) || 24) : 0.5;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const fresh = await news(data, { symbols, start: since, pages: preview ? 2 : 1 });
  let unseen = fresh;
  if (!preview && fresh.length) {
    const { data: seen } = await admin.from("market_news_seen").select("news_id").in("news_id", fresh.map((n) => n.id));
    const done = new Set((seen || []).map((r: any) => Number(r.news_id)));
    unseen = fresh.filter((n) => !done.has(n.id));
  }
  const triaged = unseen.length ? await triageNews(unseen, symbols) : [];
  if (!preview && triaged.length) {
    await admin.from("market_news_seen").upsert(
      triaged.map((t) => ({ news_id: t.id, symbol: t.symbol, major: t.major, title: t.title || null, what: t.what || null })),
      { onConflict: "news_id", ignoreDuplicates: true }
    );
  }

  const snaps = await snapshots(data, symbols);
  const moves = new Map<string, Move>(symbols.map((s) => [s, moveFromSnapshot(s, snaps[s])]));
  const cap = preview ? 3 : DAILY_ALERT_CAP;
  const sentToday = new Map<string, number>();
  const countFor = async (userId: string) => {
    if (preview) return sentToday.get(userId) || 0;
    if (!sentToday.has(userId)) {
      const { count } = await admin.from("market_mail_log").select("id", { count: "exact", head: true })
        .eq("user_id", userId).in("kind", ["news", "move"]).gte("sent_at", new Date(Date.now() - 16 * 3600 * 1000).toISOString());
      sentToday.set(userId, count || 0);
    }
    return sentToday.get(userId)!;
  };

  let sent = 0;
  const send = async (kind: "news" | "move", ref: string, symbol: string, build: (held: { account: string; lines: string[] }[]) => any) => {
    const byReader = new Map<string, { reader: Reader; held: { account: string; lines: string[] }[] }>();
    for (const h of holders.get(symbol) || []) {
      const row = byReader.get(h.reader.userId) || { reader: h.reader, held: [] };
      row.held.push({ account: h.account, lines: h.lines });
      byReader.set(h.reader.userId, row);
    }
    for (const { reader, held } of byReader.values()) {
      if (!preview && (await logged(admin, kind, reader.userId, ref))) continue;
      if ((await countFor(reader.userId)) >= cap) continue;
      const mail = renderAlert({ ...build(held), held, preview });
      const r = await deliver(admin, reader.email, mail, setting !== "users" || preview);
      if (r.sent) {
        sent++;
        sentToday.set(reader.userId, (sentToday.get(reader.userId) || 0) + 1);
        await log(admin, preview ? "preview" : kind, reader.userId, preview ? `${ref}:${Date.now()}` : ref, symbol, mail.subject);
      }
    }
  };

  const byId = new Map(fresh.map((n) => [n.id, n]));
  for (const t of triaged.filter((x) => x.major)) {
    const item = byId.get(t.id);
    await send("news", `news:${t.id}`, t.symbol, () => ({
      symbol: t.symbol, title: t.title || item?.headline || "News", what: t.what || item?.headline || "",
      urls: item?.url ? [item.url] : [], publishedAt: item?.created_at || null,
      move: moves.get(t.symbol) || null, kind: "news"
    }));
  }

  for (const [symbol, m] of moves) {
    if (m.change == null || Math.abs(m.change) < BIG_MOVE) continue;
    const latest = fresh.filter((n) => n.symbols?.includes(symbol)).slice(0, 2);
    await send("move", `move:${symbol}:${clock.day}`, symbol, () => ({
      symbol,
      title: `${m.change! >= 0 ? "Up" : "Down"} ${pct(Math.abs(m.change!)).slice(1)} today`,
      what: `${symbol} is at ${usd(m.price)}, ${pct(m.change)} against yesterday's close.` +
        (latest.length ? ` Latest headline: ${latest[0].headline}.` : " We found no company headline in the news feed that explains it yet."),
      urls: latest.map((n) => n.url).filter(Boolean) as string[],
      publishedAt: latest[0]?.created_at || null,
      move: m, kind: "move"
    }));
  }

  return { judged: triaged.length, major: triaged.filter((t) => t.major).length, sent };
}

// Reads everything the emails are built from and writes nothing: no model, no
// email. Answers in the response, so a test from SQL can read it back from
// net._http_response.
async function check(admin: Admin) {
  const clock = etClock();
  const data = await dataAccount(admin);
  const [tradingDay, open, readers] = await Promise.all([
    isTradingDay(data, clock.day), marketOpen(data), readersFor(admin, "owner")
  ]);
  const accounts = await readerHoldings(admin, readers[0].userId);
  const symbols = [...new Set(accounts.flatMap((a) => a.holdings.map((h) => h.symbol)))];
  const tapeSnaps = await snapshots(data, MARKET_TAPE.map(([s]) => s));
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const [marketNews, heldNews] = await Promise.all([
    news(data, { start: since, pages: 1 }),
    symbols.length ? news(data, { symbols, start: since, pages: 1 }) : Promise.resolve([])
  ]);
  return {
    clock, tradingDay, open, dataAccount: data.name,
    anthropicKey: !!Deno.env.get("ANTHROPIC_API_KEY"),
    tape: MARKET_TAPE.map(([s, l]) => { const m = moveFromSnapshot(s, tapeSnaps[s], l); return `${s} ${usd(m.price)} ${pct(m.change)}`; }),
    accounts: accounts.map((a) => ({ name: a.name, error: a.error || null, holdings: a.holdings.map((h) => `${h.symbol}: ${h.lines.join("; ")}`) })),
    marketNews: marketNews.length,
    heldNews: heldNews.length,
    heldNewsSample: heldNews.slice(0, 5).map((n) => `${n.created_at} ${(n.symbols || []).join(",")} ${n.headline}`)
  };
}

// ---------- entry ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  if (!(await redeemCronTicket(admin, body.ticket, PURPOSE))) return jsonResponse({ error: "not authorised" }, 401);

  const mode = String(body.mode || "");
  if (mode === "check") {
    try {
      return jsonResponse(await check(admin));
    } catch (e) {
      return jsonResponse({ error: String((e as Error)?.message || e) }, 500);
    }
  }
  const work =
    mode === "brief" ? brief(admin, body, false)
      : mode === "preview" ? brief(admin, body, true)
        : mode === "alerts" ? alerts(admin, body, false)
          : mode === "alerts-preview" ? alerts(admin, body, true)
            : null;
  if (!work) return jsonResponse({ error: `unknown mode "${mode}"` }, 400);

  // Answered at once, worked in the background: the scheduler only needs the
  // hand-off, and the work can take most of the run's 150 seconds.
  inBackground(work.then((r) => console.log(JSON.stringify({ marketMail: mode, ...r })))
    .catch((e) => console.error(`marketMail ${mode}: ${(e as Error)?.message || e}`)));
  return jsonResponse({ accepted: mode }, 202);
});
