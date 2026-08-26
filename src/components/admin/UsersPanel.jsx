import { useCallback, useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { toast } from "@/components/ui/use-toast";
import { Trash2, X } from "lucide-react";

const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wider text-dm-sub font-medium whitespace-nowrap";
const td = "px-3 py-2.5 whitespace-nowrap text-sm";

const shortDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

// Notes and CRM fields for one user. Both live in tables with RLS enabled and
// no policies at all, so every read and write here goes through the admin edge
// function on the service role — the browser cannot reach them directly, which
// is deliberate: these are notes *about* a customer and must never be readable
// by that customer.
function UserDetail({ user, onClose }) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [crm, setCrm] = useState({ status: "", tags: [] });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingNote, setConfirmingNote] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await invokeFunction("adminData", { action: "userDetail", userId: user.id });
    if (res.data?.error) {
      toast({ title: "Couldn't load user", description: res.data.error, variant: "destructive" });
    } else {
      setNotes(res.data.notes || []);
      setCrm({ status: res.data.crm?.status || "", tags: res.data.crm?.tags || [] });
    }
    setLoading(false);
  }, [user.id]);

  // Keyed on user.id: without it, opening a second user's notes while the
  // panel is already mounted would reuse the first user's loaded state.
  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    const res = await invokeFunction("adminData", { action: "addNote", userId: user.id, body });
    if (res.data?.error) toast({ title: "Couldn't save note", description: res.data.error, variant: "destructive" });
    else { setNotes((n) => [res.data.note, ...n]); setDraft(""); }
    setSaving(false);
  };

  const removeNote = async (id) => {
    const res = await invokeFunction("adminData", { action: "deleteNote", id });
    if (res.data?.error) toast({ title: "Couldn't delete note", description: res.data.error, variant: "destructive" });
    else setNotes((n) => n.filter((x) => x.id !== id));
    setConfirmingNote(null);
  };

  const saveCrm = async (next) => {
    setCrm(next);
    const res = await invokeFunction("adminData", {
      action: "saveCrm", userId: user.id, status: next.status, tags: next.tags
    });
    if (res.data?.error) toast({ title: "Couldn't save", description: res.data.error, variant: "destructive" });
  };

  const input = "w-full rounded-lg border border-dm-line bg-dm-panel px-3 py-2 text-sm text-dm-text focus:outline-none focus:border-dm-accent";

  return (
    <div className="rounded-lg border border-dm-line bg-dm-panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate font-medium text-dm-text">{user.email}</div>
          <div className="mt-0.5 text-xs text-dm-sub">
            Joined {shortDate(user.createdAt)} · {user.accounts} account{user.accounts === 1 ? "" : "s"} ·{" "}
            {user.trades} trade{user.trades === 1 ? "" : "s"}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-dm-sub hover:text-dm-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-dm-sub">Loading…</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs text-dm-sub">Status</label>
              <input
                className={input}
                value={crm.status}
                placeholder="e.g. trialing, paying, churned"
                onChange={(e) => setCrm({ ...crm, status: e.target.value })}
                onBlur={() => saveCrm(crm)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-dm-sub">Tags <span className="text-dm-sub/70">comma separated</span></label>
              <input
                className={input}
                value={crm.tags.join(", ")}
                placeholder="e.g. beta, high-volume"
                onChange={(e) => setCrm({ ...crm, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                onBlur={() => saveCrm(crm)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-dm-sub">Notes</label>
            <div className="flex gap-2">
              <textarea
                className={`${input} min-h-[38px] resize-y`}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Internal note — not visible to the user"
              />
              <button
                onClick={addNote}
                disabled={!draft.trim() || saving}
                className="shrink-0 self-start rounded-lg bg-dm-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-dm-accent-bright disabled:opacity-40"
              >
                Add
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {notes.length === 0 && <p className="text-xs text-dm-sub">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-dm-line bg-dm-bg px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap text-sm text-dm-text">{n.body}</p>
                    {confirmingNote === n.id ? (
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        <button onClick={() => removeNote(n.id)} className="font-medium text-rose-600 hover:underline">Delete</button>
                        <button onClick={() => setConfirmingNote(null)} className="text-dm-sub hover:text-dm-text">Cancel</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingNote(n.id)}
                        aria-label="Delete note"
                        className="shrink-0 text-dm-sub transition-colors hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-dm-sub tabular-nums">{shortDate(n.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPanel({ users }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-4">
      {selected && <UserDetail user={selected} onClose={() => setSelected(null)} />}

      <div className="overflow-x-auto rounded-lg border border-dm-line bg-dm-panel">
        <table className="w-full">
          <thead className="border-b border-dm-line bg-dm-bg">
            <tr>
              <th className={th}>Email</th>
              <th className={th}>Joined</th>
              <th className={th}>Last seen</th>
              <th className={th}>Accounts</th>
              <th className={th}>Trades</th>
              <th className={th}>Last trade</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-dm-line/60 last:border-0">
                <td className={`${td} font-medium text-dm-text`}>
                  {u.email}
                  {u.role === "admin" && (
                    <span className="ml-2 rounded-full border border-dm-accent/30 bg-dm-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-dm-accent">
                      admin
                    </span>
                  )}
                </td>
                <td className={`${td} tabular-nums text-dm-sub`}>{shortDate(u.createdAt)}</td>
                <td className={`${td} tabular-nums text-dm-sub`}>{shortDate(u.lastSignInAt)}</td>
                <td className={`${td} tabular-nums text-dm-text`}>
                  {u.accounts}
                  {u.accounts > 0 && (
                    <span className="ml-1.5 text-[11px] text-dm-sub">
                      {u.liveAccounts > 0 ? `${u.liveAccounts} live` : "paper only"}
                    </span>
                  )}
                </td>
                <td className={`${td} tabular-nums text-dm-text`}>{u.trades}</td>
                <td className={`${td} tabular-nums text-dm-sub`}>{shortDate(u.lastTradeAt)}</td>
                <td className={td}>
                  <button
                    onClick={() => setSelected(u)}
                    className="rounded-lg border border-dm-line px-2.5 py-1 text-xs text-dm-sub transition-colors hover:text-dm-text"
                  >
                    Notes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
