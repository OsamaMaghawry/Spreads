import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { invokeFunction } from "@/lib/functions";
import useIsAdmin from "@/lib/useIsAdmin";
import EngagementPanel from "@/components/admin/EngagementPanel";
import UsersPanel from "@/components/admin/UsersPanel";
import BlogPanel from "@/components/admin/BlogPanel";
import SettingsPanel from "@/components/admin/SettingsPanel";

const TABS = [
  { key: "engagement", label: "Engagement" },
  { key: "users", label: "Users" },
  { key: "blog", label: "Blog" },
  { key: "settings", label: "Settings" }
];

export default function Admin() {
  const { loading: checkingRole, isAdmin } = useIsAdmin();
  const [tab, setTab] = useState("engagement");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Needed so the users table can suppress the role control on your own row —
  // the server refuses a self-role-change, so the button would only ever error.
  const [currentUserId, setCurrentUserId] = useState(null);

  const load = useCallback(async () => {
    const res = await invokeFunction("adminData", { action: "overview" });
    if (res.data?.error) setError(res.data.error);
    else { setError(null); setData(res.data); }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
    load();
  }, [isAdmin, load]);

  if (checkingRole) {
    return <div className="py-16 text-center text-sm text-dm-sub">Checking access…</div>;
  }

  // Redirect rather than render an empty admin shell. This is presentation
  // only — the edge function refuses a non-admin token regardless of what the
  // browser decides to render, which is where the actual boundary lives.
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-dm-text">
          <ShieldCheck className="h-5 w-5 text-dm-accent" /> Admin
        </h1>
        <p className="mt-1 text-sm text-dm-sub">Users, engagement and published content.</p>
      </div>

      <div className="flex gap-1 border-b border-dm-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-dm-accent font-medium text-dm-accent"
                : "border-transparent text-dm-sub hover:text-dm-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>
      )}

      {/* Blog and Settings load their own data, so neither waits on the
          overview query. */}
      {tab === "blog" ? (
        <BlogPanel />
      ) : tab === "settings" ? (
        <SettingsPanel />
      ) : !data ? (
        <div className="py-16 text-center text-sm text-dm-sub">Loading…</div>
      ) : tab === "engagement" ? (
        <EngagementPanel engagement={data.engagement} />
      ) : (
        <UsersPanel users={data.users} currentUserId={currentUserId} onRefresh={load} />
      )}
    </div>
  );
}
