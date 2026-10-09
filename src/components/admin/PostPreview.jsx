import { useMemo } from "react";
import { markdown } from "../../../landing/src/render.js";

// The post as the blog will actually render it, before it is published.
//
// This imports the SAME `markdown()` the Worker runs (landing/src/render.js)
// rather than a markdown library, and that is the whole point: the blog
// supports a deliberate subset — headings, pipe tables, figures, lists,
// quotes, four-space code — and anything outside it renders as literal text
// on the live page. A preview built on a fuller parser would show a table
// where the blog shows a row of pipes, which is worse than no preview,
// because it would be confidently wrong.
//
// Asset paths are the one thing that cannot be honest here. A post's figures
// live on the landing site (`/assets/blog/…`), not on the dashboard origin,
// so they are rewritten to VITE_SITE_URL to load. A figure whose file has not
// been deployed yet will show its caption and a broken image — which is the
// truth about that post, not a defect in the preview.
export default function PostPreview({ post, site, chrome = true }) {
  const html = useMemo(() => {
    const rendered = markdown(post.body || "");
    return site ? rendered.replace(/src="\/assets\//g, `src="${site}/assets/`) : rendered;
  }, [post.body, site]);

  const date = post.published_at ? new Date(post.published_at) : new Date();

  return (
    <div className="rounded-lg border border-dm-line bg-white">
      {chrome && (
        <div className="flex items-center gap-2 border-b border-dm-line px-4 py-2 text-[11px] text-dm-sub">
          <span className="rounded-full border border-dm-line bg-dm-bg px-1.5 py-0.5 font-semibold uppercase tracking-wider">
            Preview
          </span>
          <span>rendered with the blog&rsquo;s own renderer — this is what publishing produces</span>
        </div>
      )}

      {/* The blog's own measure and rhythm, so line length and heading weight
          read as they will on the page rather than as dashboard chrome. */}
      <article className="mx-auto max-w-[680px] px-6 py-8 text-[15px] leading-[1.7] text-slate-700 [&_a]:text-emerald-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-500 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_figcaption]:mt-2 [&_figcaption]:text-[13px] [&_figcaption]:text-slate-500 [&_figure]:my-7 [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-[21px] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:text-slate-900 [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-[17px] [&_h3]:font-semibold [&_h3]:text-slate-900 [&_img]:w-full [&_li]:mb-1.5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-[13px] [&_pre]:text-slate-100 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14px] [&_td]:border-t [&_td]:border-slate-200 [&_td]:py-2 [&_td]:pr-4 [&_th]:border-b [&_th]:border-slate-300 [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_th]:text-slate-900 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="mb-2 text-[32px] font-bold leading-tight tracking-tight text-slate-900">
          {post.title || "Untitled"}
        </h1>
        <p className="mb-8 text-[13px] text-slate-500">
          {post.author || "DeltaMint"} ·{" "}
          {date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          {post.status !== "published" && " · not published"}
        </p>
        <div className="[&>div.tablewrap]:my-6 [&>div.tablewrap]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
}
