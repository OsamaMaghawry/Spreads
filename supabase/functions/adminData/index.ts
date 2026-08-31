import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { selectAll, listAllUsers } from "../_shared/paging.ts";
import { requireAdmin, isOwnerEmail } from "../_shared/admin.ts";
import { readSettings, writeSetting, WRITABLE_SETTINGS } from "../_shared/settings.ts";

// Back-office reads and writes: users and their activity, engagement figures,
// blog posts, and the internal customer record.
//
// One function with an `action` rather than a function per endpoint, so the
// administrator check in requireAdmin() runs on exactly one code path. Every
// action here reads across all users, so none of it is reachable without it.
//
// The engagement figures are derived from tables the product already writes —
// profiles, trading_accounts, trade_records. No tracking or event collection
// is involved in anything below.

// Three bulk queries and a group-by in memory, rather than a query per user.
// A view would push the aggregation into Postgres, but a view over these
// tables runs as its owner and would bypass RLS for anyone able to select it,
// so it would need its own grants to stay safe. Not worth the extra surface at
// this size; revisit if the user count reaches the thousands.
async function loadUsers(admin: any) {
  const [authUserList, accounts, trades, profiles] = await Promise.all([
    listAllUsers(admin),
    selectAll(admin, "trading_accounts", "id, user_id, is_paper, created_at"),
    selectAll(admin, "trade_records", "user_id, account_id, open_date, close_date, realized_pl, created_at"),
    selectAll(admin, "profiles", "id, role, last_active_at")
  ]);
  const authUsers = { users: authUserList };

  const byUser = new Map<string, any>();
  for (const u of authUsers.users) {
    // An owner's profiles.role is usually still 'user' — their access comes
    // from the ADMIN_EMAILS secret, not the database. Reporting the raw role
    // would show the owner as an ordinary user in their own panel.
    const owner = isOwnerEmail(u.email);
    byUser.set(u.id, {
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      // Authentication time, not use. GoTrue stamps this only when a user
      // actually signs in; a live session refreshed for weeks never moves it,
      // which is why the panel showed a user active today as last seen
      // whenever they last typed a password. Kept because "when did they last
      // authenticate" is still a real question — just not this one.
      lastSignInAt: u.last_sign_in_at,
      // Filled from profiles.last_active_at below: the app stamps it on use.
      lastActiveAt: null as string | null,
      isOwner: owner,
      role: owner ? "owner" : "user",
      accounts: 0,
      liveAccounts: 0,
      paperAccounts: 0,
      firstAccountAt: null as string | null,
      trades: 0,
      // Trades on a non-paper account. The funnel's last stage used to be
      // "has a live account connected", which is not a subset of "has traded"
      // — so the panel could and did show more people trading live than
      // trading at all. This counts the thing the label claims.
      liveTrades: 0,
      lastTradeAt: null as string | null,
      realizedPL: 0
    });
  }

  for (const p of profiles || []) {
    const u = byUser.get(p.id);
    if (!u) continue;
    // Owner outranks whatever the row says; the env grant is what is actually
    // enforced, so it is what gets displayed.
    if (!u.isOwner) u.role = p.role;
    u.lastActiveAt = p.last_active_at || null;
  }

  const liveAccountIds = new Set(
    (accounts || []).filter((a: any) => !a.is_paper).map((a: any) => a.id)
  );

  for (const a of accounts || []) {
    const u = byUser.get(a.user_id);
    if (!u) continue;
    u.accounts += 1;
    if (a.is_paper) u.paperAccounts += 1;
    else u.liveAccounts += 1;
    if (!u.firstAccountAt || a.created_at < u.firstAccountAt) u.firstAccountAt = a.created_at;
  }

  for (const t of trades || []) {
    const u = byUser.get(t.user_id);
    if (!u) continue;
    u.trades += 1;
    if (liveAccountIds.has(t.account_id)) u.liveTrades += 1;
    u.realizedPL += Number(t.realized_pl || 0);
    const when = t.close_date || t.open_date || t.created_at;
    if (when && (!u.lastTradeAt || when > u.lastTradeAt)) u.lastTradeAt = when;
  }

  return [...byUser.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Activation is the funnel that matters for this product: an account that
// signed up but never connected a broker is a very different problem from one
// that connected and never traded.
function engagement(users: any[]) {
  const signedUp = users.length;
  const connected = users.filter((u) => u.accounts > 0).length;
  const traded = users.filter((u) => u.trades > 0).length;
  // Traded on a live account — a genuine subset of `traded`. Reported
  // separately from `liveConnected`, which is the older figure: connecting a
  // live account is real progress, it is just not trading, and presenting it
  // as the final funnel stage is what made the numbers impossible.
  const live = users.filter((u) => u.liveTrades > 0).length;
  const liveConnected = users.filter((u) => u.liveAccounts > 0).length;

  const day = 86400000;
  const now = Date.now();
  // Real use first, falling back to authentication and then signup for users
  // who predate activity tracking — otherwise everyone connected before this
  // shipped would read as dormant on the day it deployed.
  const activeWithin = (days: number) =>
    users.filter((u) => {
      const seen = u.lastActiveAt || u.lastSignInAt || u.createdAt;
      return seen && now - new Date(seen).getTime() <= days * day;
    }).length;

  // Signups per day for the last 30 days, zero-filled so a gap reads as zero
  // rather than disappearing from the series.
  const signupsByDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    signupsByDay[new Date(now - i * day).toISOString().slice(0, 10)] = 0;
  }
  for (const u of users) {
    const d = (u.createdAt || "").slice(0, 10);
    if (d in signupsByDay) signupsByDay[d] += 1;
  }

  return {
    funnel: { signedUp, connected, traded, live, liveConnected },
    active: { day: activeWithin(1), week: activeWithin(7), month: activeWithin(30) },
    totals: {
      trades: users.reduce((n, u) => n + u.trades, 0),
      realizedPL: users.reduce((n, u) => n + u.realizedPL, 0)
    },
    signupsByDay: Object.entries(signupsByDay).map(([date, count]) => ({ date, count }))
  };
}

// A slug is a permalink: once a post is published and indexed, changing it
// costs the ranking. Normalising here keeps a typo from becoming permanent.
function normaliseSlug(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate.response) return gate.response;
    const admin = gate.admin!;
    const user = gate.user!;

    const { action, ...payload } = await req.json();

    switch (action) {
      // Cheapest possible authorized call: reaching this line already means
      // requireAdmin passed. The client uses it instead of deciding for itself
      // whether someone is an admin — see src/lib/useIsAdmin.js.
      case "whoami": {
        return jsonResponse({ isAdmin: true, isOwner: gate.isOwner, email: user.email });
      }

      // Operator switches. Read here rather than from the browser because
      // app_settings denies every client role — the panel and the Accounts page
      // both ask through this action.
      case "getSettings": {
        return jsonResponse({ settings: await readSettings(admin) });
      }

      case "setSetting": {
        if (!WRITABLE_SETTINGS.includes(payload.key)) {
          return jsonResponse({ error: `Unknown setting "${payload.key}"` }, 400);
        }
        // Booleans are all these switches are today, and coercing here means a
        // stray string can never land in the column and read as truthy.
        await writeSetting(admin, payload.key, payload.value === true, user.id);
        return jsonResponse({ settings: await readSettings(admin) });
      }

      case "overview": {
        const users = await loadUsers(admin);
        return jsonResponse({ users, engagement: engagement(users) });
      }

      case "userDetail": {
        const [{ data: notes, error: nErr }, { data: crm, error: cErr }, { data: issues, error: iErr }] =
          await Promise.all([
            admin.from("user_notes").select("id, body, created_at, author_id").eq("user_id", payload.userId)
              .order("created_at", { ascending: false }),
            admin.from("user_crm").select("status, tags").eq("user_id", payload.userId).maybeSingle(),
            // Environments the broker refused during a connect. Without these a
            // user whose live account was rejected looks identical to one who
            // only ever authorized paper — which is the support question that
            // could not be answered before.
            admin.from("broker_connection_issues")
              .select("id, broker, environment, status, detail, created_at")
              .eq("user_id", payload.userId)
              .order("created_at", { ascending: false })
              .limit(20)
          ]);
        if (nErr) throw new Error(nErr.message);
        if (cErr) throw new Error(cErr.message);
        if (iErr) throw new Error(iErr.message);
        return jsonResponse({
          notes: notes || [],
          crm: crm || { status: null, tags: [] },
          connectionIssues: issues || []
        });
      }

      case "addNote": {
        const body = String(payload.body || "").trim();
        if (!body) return jsonResponse({ error: "Note cannot be empty" }, 400);
        const { data, error } = await admin
          .from("user_notes")
          .insert({ user_id: payload.userId, author_id: user.id, body })
          .select("id, body, created_at, author_id")
          .single();
        if (error) throw new Error(error.message);
        return jsonResponse({ note: data });
      }

      case "deleteNote": {
        const { error } = await admin.from("user_notes").delete().eq("id", payload.id);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      case "saveCrm": {
        const { error } = await admin.from("user_crm").upsert(
          {
            user_id: payload.userId,
            status: payload.status || null,
            tags: Array.isArray(payload.tags) ? payload.tags : [],
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id" }
        );
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      case "setRole": {
        const role = payload.role === "admin" ? "admin" : "user";

        // Refusing self-changes is what keeps at least one administrator in
        // existence. Demoting yourself is the only single action that can take
        // the count to zero, and recovering from zero needs direct database
        // access — there is no way back through the app.
        if (payload.userId === user.id) {
          return jsonResponse(
            { error: "You can't change your own role — that could leave the panel with no administrator." },
            400
          );
        }

        // An owner's access comes from ADMIN_EMAILS, which this cannot touch.
        // Writing profiles.role for them would succeed and change nothing —
        // the UI would report a demotion that did not happen.
        const { data: target } = await admin.auth.admin.getUserById(payload.userId);
        if (isOwnerEmail(target?.user?.email)) {
          return jsonResponse(
            {
              error:
                "That account is an owner via the ADMIN_EMAILS secret. Remove the email there to revoke it — a role change here would have no effect."
            },
            409
          );
        }

        const { error } = await admin.from("profiles").update({ role }).eq("id", payload.userId);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true, role });
      }

      case "listPosts": {
        // Drafts included — this path is the service role, unlike the public
        // Worker which RLS limits to published posts.
        const { data, error } = await admin
          .from("blog_posts")
          .select("id, slug, title, excerpt, body, author, meta_description, og_image, status, published_at, updated_at")
          .order("updated_at", { ascending: false });
        if (error) throw new Error(error.message);
        return jsonResponse({ posts: data || [] });
      }

      case "savePost": {
        const slug = normaliseSlug(payload.slug || payload.title);
        if (!slug) return jsonResponse({ error: "A slug is required" }, 400);
        if (!String(payload.title || "").trim()) return jsonResponse({ error: "A title is required" }, 400);

        const status = payload.status === "published" ? "published" : "draft";
        const row: Record<string, unknown> = {
          slug,
          title: payload.title,
          excerpt: payload.excerpt || null,
          body: payload.body || "",
          author: payload.author || "DeltaMint",
          meta_description: payload.meta_description || null,
          og_image: payload.og_image || null,
          status,
          updated_at: new Date().toISOString()
        };

        // Publishing stamps the date once and never moves it: dateModified is
        // what changes on an edit, and rewriting datePublished on every save
        // would misrepresent the post's age to search engines.
        if (status === "published") {
          row.published_at = payload.published_at || new Date().toISOString();
        }

        const query = payload.id
          ? admin.from("blog_posts").update(row).eq("id", payload.id)
          : admin.from("blog_posts").insert(row);
        const { data, error } = await query.select("id, slug, status, published_at").single();
        if (error) {
          // 23505 is a unique violation, which here can only be the slug.
          if ((error as any).code === "23505") {
            return jsonResponse({ error: `The slug "${slug}" is already in use.` }, 409);
          }
          throw new Error(error.message);
        }
        return jsonResponse({ post: data });
      }

      case "deletePost": {
        const { error } = await admin.from("blog_posts").delete().eq("id", payload.id);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      default:
        return jsonResponse({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
