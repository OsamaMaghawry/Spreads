import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import PostPreview from "@/components/admin/PostPreview";

const SITE = import.meta.env.VITE_SITE_URL || "https://deltamint.app";

// A draft, on its own page, in a tab of its own.
//
// The blog itself cannot serve this: row-level security limits the anon key
// the Worker uses to published rows, so a draft has no public URL by design.
// Rather than open a hole in that with a preview token, the preview is served
// from the dashboard, where the reader is already an authenticated admin and
// `adminData.listPosts` runs as the service role.
//
// Deliberately outside the dashboard Layout — no nav, no sidebar, nothing but
// the post — because the question a preview answers is "how does this read to
// somebody who is not us", and a page wrapped in our own chrome does not
// answer it.
export default function BlogPreview() {
  const { slug } = useParams();
  const [post, setPost] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    let live = true;
    invokeFunction("adminData", { action: "listPosts" })
      .then(({ data }) => {
        if (!live) return;
        if (data?.error) { setPost(null); return; }
        setPost((data?.posts || []).find((p) => p.slug === slug) || null);
      })
      .catch(() => live && setPost(null));
    return () => { live = false; };
  }, [slug]);

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="mx-auto max-w-[760px] px-4">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
          <Link to="/admin" className="text-emerald-700 underline">← Admin</Link>
          <span className="font-mono">/blog/{slug}</span>
          {post && (
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                post.status === "published"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-white text-slate-500"
              }`}
            >
              {post.status}
            </span>
          )}
          {post?.status === "published" && (
            <a href={`${SITE}/blog/${slug}`} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
              open the live page
            </a>
          )}
        </div>

        {post === undefined ? (
          <div className="rounded-lg border border-slate-200 bg-white py-20 text-center text-sm text-slate-500">Loading…</div>
        ) : post === null ? (
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
            No post with the slug <span className="font-mono">{slug}</span>.
          </div>
        ) : (
          <PostPreview post={post} site={SITE} chrome={false} />
        )}
      </div>
    </div>
  );
}
