// The weekly summary email: gather, build, deliver, record.
//
// Everything this function KNOWS lives in `_shared/weeklyDigest.ts` and
// `_shared/weeklyDigestEmail.ts`, both pure and both tested. What is left here
// is the part that cannot be tested without a database: reading the rows,
// deciding who gets the mail, and writing down what happened.
//
// IT TALKS TO NO BROKER. Every figure comes from `account_equity_daily` and
// `trade_records`, which the sync jobs already keep current. That is
// deliberate: a Saturday-morning job that woke thirty broker connections to
// build an email would be slow, rate-limited and able to fail for reasons
// that have nothing to do with email. It also means the email agrees with the
// Analysis page by construction -- same columns, same arithmetic.
//
// WHO IT MAILS is `weekly_digest_delivery` in app_settings, and it ships set
// to "owner": every user's email is built and sent to the owner, stamped as a
// review copy. See migration 0036 for why, and for the state machine.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { sendEmail } from "../_shared/email.ts";
import { weeklyDigestDelivery } from "../_shared/settings.ts";
import { weekWindow, accountWeek, userWeek, type Window } from "../_shared/weeklyDigest.ts";
import { renderWeekly } from "../_shared/weeklyDigestEmail.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://dashboard.deltamint.app";

// How far back to look for the row the week is measured FROM. The window opens
// on a Monday and the anchor is the previous session's close, which over a
// holiday weekend can be several days earlier -- and on a thin account, the
// last stored day can be older still. Ten days covers every US market break.
const LOOKBACK_DAYS = 10;

const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const admin = adminClient();

    // A caller may ask for a specific week (a re-run, a test) but never for a
    // different recipient: `mode` is read from settings, never from the
    // request, so nothing that can reach this function can aim it at someone.
    const win: Window = body?.weekStart && body?.weekEnd
      ? { from: String(body.weekStart), to: String(body.weekEnd) }
      : weekWindow(new Date());

    const mode = await weeklyDigestDelivery(admin);
    if (mode === "off") return jsonResponse({ ok: true, mode, skipped: "delivery is off" });

    // `dryRun` builds everything and sends nothing. It is how the shape of a
    // week is checked without putting mail in anyone's inbox, including the
    // owner's.
    const dryRun = body?.dryRun === true;
    // A single user, for a test. Still cannot change WHO receives it.
    const onlyUser = body?.userId ? String(body.userId) : null;

    const { data: accounts, error: acctErr } = await admin
      .from("trading_accounts")
      .select("id, user_id, name, is_paper")
      .order("user_id");
    if (acctErr) throw new Error(acctErr.message);

    const byUser = new Map<string, any[]>();
    for (const a of accounts || []) {
      if (onlyUser && a.user_id !== onlyUser) continue;
      const list = byUser.get(a.user_id) || [];
      list.push(a);
      byUser.set(a.user_id, list);
    }

    // The owner's address, from the same row every other email in this product
    // reports to.
    const { data: settings } = await admin
      .from("watch_settings")
      .select("recipient_email")
      .eq("id", true)
      .maybeSingle();
    const ownerEmail = settings?.recipient_email || null;
    if (mode === "owner" && !ownerEmail && !dryRun) {
      return jsonResponse({ error: "watch_settings.recipient_email is not set" }, 500);
    }

    const from = iso(new Date(new Date(win.from + "T00:00:00Z").getTime() - LOOKBACK_DAYS * 86400000));
    const results: any[] = [];

    for (const [userId, userAccounts] of byUser) {
      try {
        // Who this person is, and whether they have asked us to stop. The
        // opt-out is checked even in "owner" mode: a review copy of an email
        // somebody has opted out of is a review of something we would not
        // send, and building it would keep it alive in the owner's mind as a
        // thing that still goes out.
        const { data: profile } = await admin
          .from("profiles")
          .select("weekly_digest_opt_out")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.weekly_digest_opt_out) {
          results.push({ userId, status: "skipped", detail: "opted out" });
          continue;
        }

        const accountIds = userAccounts.map((a) => a.id);
        const [{ data: daily }, { data: trades }] = await Promise.all([
          admin
            .from("account_equity_daily")
            .select("account_id, day, equity, premium_cum, shares_booked, shares_open, shares_value, options_open, performance, unpriced")
            .in("account_id", accountIds)
            .gte("day", from)
            .lte("day", win.to),
          admin
            .from("trade_records")
            .select("account_id, ticker, strategy, open_date, close_date, qty, net_credit, close_debit, realized_pl, premium_pl, early_close_pl, stock_pl, provisional, close_reason, short_strike, expiry")
            .in("account_id", accountIds)
            // Both ends of the window matter: a row OPENED in it and a row
            // CLOSED in it are different halves of the premium story, so this
            // cannot filter on close_date alone.
            .or(`and(open_date.gte.${win.from},open_date.lte.${win.to}),and(close_date.gte.${win.from},close_date.lte.${win.to})`)
        ]);

        const weeks = userAccounts.map((a) =>
          accountWeek(
            a,
            (daily || []).filter((r: any) => r.account_id === a.id),
            (trades || []).filter((t: any) => t.account_id === a.id),
            win
          )
        );
        const summary = userWeek(weeks, win);

        // The address this person signed up with. Read through the admin API
        // rather than from a table, because `auth.users` is not ours to select
        // from directly.
        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        const theirEmail = authUser?.user?.email || null;

        const { subject, html, text } = renderWeekly(summary, {
          appUrl: APP_URL,
          previewFor: mode === "owner" ? (theirEmail || userId) : null,
          unsubscribeUrl: mode === "users" ? `${APP_URL}/settings?email=off` : null
        });

        const recipient = mode === "owner" ? ownerEmail : theirEmail;
        if (!recipient) {
          results.push({ userId, status: "skipped", detail: "no address on file" });
          continue;
        }

        if (dryRun) {
          results.push({ userId, status: "dry-run", recipient, subject, accounts: weeks.length });
          continue;
        }

        // Already sent this week, in this mode? Then stop. The unique
        // constraint would refuse the row anyway; checking first means a retry
        // does not send the mail and THEN fail to record it, which is the one
        // ordering that produces duplicates.
        const sendMode = mode === "owner" ? "owner" : "user";
        const { data: already } = await admin
          .from("weekly_digest_sends")
          .select("id, status")
          .eq("user_id", userId)
          .eq("week_start", win.from)
          .eq("mode", sendMode)
          .maybeSingle();
        if (already && already.status === "sent") {
          results.push({ userId, status: "skipped", detail: "already sent this week" });
          continue;
        }

        const sent = await sendEmail(recipient, subject, html, text);
        await admin.from("weekly_digest_sends").upsert(
          {
            user_id: userId,
            week_start: win.from,
            mode: sendMode,
            recipient,
            status: sent.sent ? "sent" : "failed",
            detail: sent.error || sent.skipped || null
          },
          { onConflict: "user_id,week_start,mode" }
        );
        results.push({ userId, status: sent.sent ? "sent" : "failed", recipient, detail: sent.error || sent.skipped });
      } catch (e) {
        // One user's bad week must not stop everybody else's email. Recorded
        // rather than thrown, so the run finishes and the failure is visible.
        console.error(`weeklyDigest: ${userId}: ${e?.message || e}`);
        results.push({ userId, status: "failed", detail: String(e?.message || e) });
      }
    }

    return jsonResponse({
      ok: true,
      mode,
      dryRun,
      window: win,
      users: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      results
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
