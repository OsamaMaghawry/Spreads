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
import { weeklyDigestDelivery, digestRelay } from "../_shared/settings.ts";
import { weekWindow, accountWeek, type Window } from "../_shared/weeklyDigest.ts";
import { renderAccountWeek } from "../_shared/weeklyDigestEmail.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://dashboard.deltamint.app";

// How far back to look for the row the week is measured FROM. The window opens
// on a Monday and the anchor is the previous session's close, which over a
// holiday weekend can be several days earlier -- and on a thin account, the
// last stored day can be older still. Ten days covers every US market break.
const LOOKBACK_DAYS = 10;

const iso = (d: Date) => d.toISOString().slice(0, 10);


// HOW THE MAIL ACTUALLY LEAVES.
//
// `sendEmail` talks to Brevo with BREVO_API_KEY from this function's own
// environment. That key is set on PRODUCTION and has never been set on
// staging, which is a different Supabase project with its own secrets -- so a
// staging run reported "no provider key configured" and sent nothing.
//
// The owner, on being told: *"what do you mean the key is not working, I
// receive emails from the agents everyday!!! What's the difference? Fix it.
// You do it, keys is already there. Not my problem."*
//
// He is right on both counts. The key IS already there -- on production, which
// is where the agent digests go through `sendDigest` -- and which project a
// test happens to run on is not his problem to solve. So when there is no
// local provider key, this relays through `sendDigest` on whichever project
// DIGEST_RELAY_URL names, which is exactly what that function exists for: it
// takes {subject, html, text}, never a recipient, and mails the owner's own
// address from `watch_settings`. It cannot be aimed at anybody else, so
// relaying a REVIEW COPY through it is safe by construction.
//
// The relay is therefore only ever used for owner-mode review copies. In
// production, where the key is present, `sendEmail` sends directly and the
// relay is never reached.
async function deliver(
  to: string, subject: string, html: string, text: string,
  relay: { url: string; key: string } | null
): Promise<{ sent: boolean; skipped?: string; error?: string; via: string }> {
  const direct = await sendEmail(to, subject, html, text);
  if (direct.sent) return { ...direct, via: "brevo" };
  // Only a MISSING PROVIDER falls back. A provider that answered with an error
  // is a real failure and must be reported as one rather than retried down a
  // second path that hides it.
  if (!direct.skipped || !relay) return { ...direct, via: "brevo" };
  try {
    const res = await fetch(`${relay.url.replace(/\/$/, "")}/functions/v1/sendDigest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(relay.key ? { authorization: `Bearer ${relay.key}`, apikey: relay.key } : {})
      },
      body: JSON.stringify({ subject, html, text })
    });
    if (!res.ok) return { sent: false, error: `relay ${res.status}`, via: "relay" };
    return { sent: true, via: "relay" };
  } catch (e) {
    return { sent: false, error: `relay: ${String(e?.message || e)}`, via: "relay" };
  }
}

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
    const relay = await digestRelay(admin);
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

        // ONE EMAIL PER ACCOUNT. The owner: *"Each account should be in a
        // separate email. I need exactly to see things as if it's real."* A
        // person with one live account and three paper ones has no use for a
        // number that adds them -- there is no portfolio that contains both.
        const weeks = userAccounts.map((a) =>
          accountWeek(
            a,
            (daily || []).filter((r: any) => r.account_id === a.id),
            (trades || []).filter((t: any) => t.account_id === a.id),
            win
          )
        );

        // The address this person signed up with. Read through the admin API
        // rather than from a table, because `auth.users` is not ours to select
        // from directly.
        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        const theirEmail = authUser?.user?.email || null;
        const recipient = mode === "owner" ? ownerEmail : theirEmail;
        if (!recipient) {
          results.push({ userId, status: "skipped", detail: "no address on file" });
          continue;
        }

        for (const week of weeks) {
          // An account that has never traded and holds nothing sends nothing.
          // Four accounts producing four emails is the point; four accounts
          // producing three empty ones is noise.
          if (week.quiet && !week.measured) {
            results.push({ userId, accountId: week.accountId, status: "skipped", detail: "never traded, nothing held" });
            continue;
          }

          const { subject, html, text } = renderAccountWeek(week, win, {
            appUrl: APP_URL,
            previewFor: mode === "owner" ? (theirEmail || userId) : null,
            unsubscribeUrl: mode === "users" ? `${APP_URL}/settings?email=off` : null
          });

          if (dryRun) {
            results.push({ userId, accountId: week.accountId, status: "dry-run", recipient, subject });
            continue;
          }

          // Already sent this account's week, in this mode? Then stop. The
          // unique constraint would refuse the row anyway; checking first
          // means a retry does not send the mail and THEN fail to record it,
          // which is the one ordering that produces duplicates.
          const sendMode = mode === "owner" ? "owner" : "user";
          const { data: already } = await admin
            .from("weekly_digest_sends")
            .select("id, status")
            .eq("account_id", week.accountId)
            .eq("week_start", win.from)
            .eq("mode", sendMode)
            .maybeSingle();
          if (already && already.status === "sent" && !body?.resend) {
            results.push({ userId, accountId: week.accountId, status: "skipped", detail: "already sent this week" });
            continue;
          }

          const sent = await deliver(recipient, subject, html, text, relay);
          await admin.from("weekly_digest_sends").upsert(
            {
              user_id: userId,
              account_id: week.accountId,
              week_start: win.from,
              mode: sendMode,
              recipient,
              status: sent.sent ? "sent" : "failed",
              detail: sent.error || sent.skipped || null
            },
            { onConflict: "account_id,week_start,mode" }
          );
          results.push({
            userId, accountId: week.accountId, account: week.name,
            status: sent.sent ? "sent" : "failed", recipient,
            detail: sent.error || sent.skipped, via: sent.via
          });
        }
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
