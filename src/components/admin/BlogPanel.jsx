import { useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { toast } from "@/components/ui/use-toast";
import { Trash2, ExternalLink, Eye, PenLine } from "lucide-react";
import PostPreview from "./PostPreview";

// Per-environment, so the staging admin links to the staging blog rather than
// sending you to production. Set in .env.production / .env.staging.
const SITE = import.meta.env.VITE_SITE_URL || "https://deltamint.app";

const EMPTY = {
  id: null,
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  author: "",
  meta_description: "",
  og_image: "",
  status: "draft",
  published_at: null
};

const input =
  "w-full rounded-lg border border-dm-line bg-dm-panel px-3 py-2 text-sm text-dm-text focus:outline-none focus:border-dm-accent";
const label = "mb-1.5 block text-xs text-dm-sub";

// Mirrors normaliseSlug() in supabase/functions/adminData/index.ts. Shown here
// so the permalink is visible before saving — the server still normalises on
// write, because this preview must never be the only thing enforcing it.
const previewSlug = (s) =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export default function BlogPanel() {
  const [posts, setPosts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const load = async () => {
    const res = await invokeFunction("adminData", { action: "listPosts" });
    if (res.data?.error) toast({ title: "Couldn't load posts", description: res.data.error, variant: "destructive" });
    else setPosts(res.data.posts || []);
  };

  useEffect(() => { load(); }, []);

  // Preview is a view of the draft being edited, not a separate saved thing:
  // it renders whatever is in the form right now, so it answers "what will
  // publishing produce" rather than "what did I last save".
  const [preview, setPreview] = useState(false);

  const save = async (status) => {
    if (saving) return;
    setSaving(true);
    const res = await invokeFunction("adminData", { action: "savePost", ...editing, status });
    if (res.data?.error) {
      toast({ title: "Couldn't save", description: res.data.error, variant: "destructive" });
    } else {
      toast({ title: status === "published" ? "Published" : "Draft saved" });
      setEditing(null);
      load();
    }
    setSaving(false);
  };

  const remove = async (post) => {
    const res = await invokeFunction("adminData", { action: "deletePost", id: post.id });
    if (res.data?.error) toast({ title: "Couldn't delete", description: res.data.error, variant: "destructive" });
    else { setPosts((p) => p.filter((x) => x.id !== post.id)); toast({ title: `Deleted "${post.title}"` }); }
    setConfirming(null);
  };

  if (editing) {
    const slug = previewSlug(editing.slug || editing.title);
    const isPublished = editing.status === "published";
    return (
      <div className="space-y-4 rounded-lg border border-dm-line bg-dm-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Title</label>
            <input className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>
              Slug <span className="text-dm-sub/70">the permanent URL — changing it after publishing loses the ranking</span>
            </label>
            <input
              className={input}
              value={editing.slug}
              placeholder={previewSlug(editing.title) || "auto-generated from the title"}
              onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-dm-sub">
              {slug ? `${SITE}/blog/${slug}` : "A title or slug is required."}
            </p>
          </div>

          <div>
            <label className={label}>Author</label>
            <input className={input} value={editing.author} placeholder="DeltaMint"
              onChange={(e) => setEditing({ ...editing, author: e.target.value })} />
          </div>
          <div>
            <label className={label}>Social image URL <span className="text-dm-sub/70">optional</span></label>
            <input className={input} value={editing.og_image || ""} placeholder="Defaults to the site card"
              onChange={(e) => setEditing({ ...editing, og_image: e.target.value })} />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Excerpt <span className="text-dm-sub/70">shown in the post list</span></label>
            <input className={input} value={editing.excerpt || ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>
              Meta description <span className="text-dm-sub/70">written for the search result, not the page</span>
            </label>
            <input
              className={input}
              value={editing.meta_description || ""}
              onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-dm-sub tabular-nums">
              {(editing.meta_description || "").length} characters
              {(editing.meta_description || "").length > 160 && " — Google usually truncates past ~160"}
            </p>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <label className={`${label} mb-0`}>
                Body <span className="text-dm-sub/70">Markdown: ## heading, **bold**, - list, [text](https://url)</span>
              </label>
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dm-line px-2.5 py-1 text-xs text-dm-sub transition-colors hover:text-dm-text"
              >
                {preview ? <PenLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {preview ? "Back to editing" : "Preview"}
              </button>
            </div>
            {preview ? (
              <PostPreview post={editing} site={SITE} />
            ) : (
              <textarea
                className={`${input} min-h-[320px] resize-y font-mono text-[13px]`}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
          DeltaMint's Terms and its broker due-diligence answers both state that it gives no
          investment advice. Keep posts educational — explaining how a structure behaves is fine,
          recommending a specific trade contradicts what has been filed.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => save("published")}
            disabled={saving || !editing.title.trim()}
            className="rounded-lg bg-dm-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dm-accent-bright disabled:opacity-40"
          >
            {saving ? "Saving…" : isPublished ? "Update published post" : "Publish"}
          </button>
          <button
            onClick={() => save("draft")}
            disabled={saving || !editing.title.trim()}
            className="rounded-lg border border-dm-line px-4 py-2 text-sm text-dm-sub transition-colors hover:text-dm-text disabled:opacity-40"
          >
            Save as draft
          </button>
          <button onClick={() => setEditing(null)} className="ml-auto text-sm text-dm-sub hover:text-dm-text">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setEditing({ ...EMPTY })}
        className="rounded-lg bg-dm-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dm-accent-bright"
      >
        New post
      </button>

      {posts === null ? (
        <div className="py-10 text-center text-sm text-dm-sub">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-dm-line bg-dm-panel px-4 py-12 text-center text-sm text-dm-sub">
          No posts yet.
        </div>
      ) : (
        <div className="divide-y divide-dm-line overflow-hidden rounded-lg border border-dm-line bg-dm-panel">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-dm-text">{p.title}</span>
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      p.status === "published"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-dm-line bg-dm-bg text-dm-sub"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-dm-sub">/blog/{p.slug}</div>
              </div>

              {p.status === "published" ? (
                <a
                  href={`${SITE}/blog/${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View published post"
                  className="text-dm-sub transition-colors hover:text-dm-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                // A draft has no URL to open -- the blog only serves published
                // rows -- so the way to read one is to open it in the editor
                // on its preview.
                <button
                  onClick={() => { setEditing({ ...EMPTY, ...p }); setPreview(true); }}
                  aria-label="Preview draft"
                  className="text-dm-sub transition-colors hover:text-dm-accent"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setEditing({ ...EMPTY, ...p })}
                className="rounded-lg border border-dm-line px-2.5 py-1 text-xs text-dm-sub transition-colors hover:text-dm-text"
              >
                Edit
              </button>
              {confirming === p.id ? (
                <span className="flex items-center gap-2 text-xs">
                  <button onClick={() => remove(p)} className="font-medium text-rose-600 hover:underline">Delete</button>
                  <button onClick={() => setConfirming(null)} className="text-dm-sub hover:text-dm-text">Cancel</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirming(p.id)}
                  aria-label={`Delete ${p.title}`}
                  className="text-dm-sub transition-colors hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
