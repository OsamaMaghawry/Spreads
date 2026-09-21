# Duty engineer — needs you: every blog diagram since 14 Sep is a broken image on deltamint.app

> Written to be emailed, and **not delivered** — `sendDigest` answered
> `CONNECT tunnel failed, response 403` on the production project and again on
> staging, re-tested in this run. Same standing block as 2026-09-14. Kept here,
> and raised as this pull request, so the words exist where you are notified.
> Full evidence in `docs/ops/queue.md` (escalated, 2026-09-21) and the 14:06 UTC
> section of `docs/ops/2026-09-21.md`.

The posts are live. The pictures inside them are not.

## What is wrong

A post's diagrams are SVGs in `landing/public/assets/blog/`. They reach the
internet only when the **Deploy landing site** workflow uploads them with the
landing Worker — `landing/wrangler.jsonc` sets `run_worker_first` to `/blog`,
`/blog/*` and `/sitemap.xml` only, so `/assets/blog/*.svg` is served purely
from the last upload, and a file that was never uploaded returns the 404 page.

That workflow has not succeeded since **run #13, 14 September, `c835e0f`**.
Two independent things stop it, and both have to be undone before a single
diagram appears:

1. **It is never started.** `content-merge.yml` merges each post into `main`
   using the built-in `GITHUB_TOKEN`, and a push made with that token does not
   start other workflows. The gate already knows this — it dispatches
   `publish-blog.yml` by hand, with a comment saying exactly why — but it does
   not dispatch `deploy-landing.yml`. So the *text* publishes and the *pictures*
   do not. Today's *Publish blog posts* run #12 carries `event=workflow_dispatch`
   on `59a5852`, and no *Deploy landing site* run exists for that commit at all.

2. **When it is started, it refuses.** Run #14 (20 September, `7b15efe`, a real
   push) failed at its first step — *"Refuse to deploy a landing site staging
   has not served"*. The gate requires `landing/` on `main` to be
   byte-identical to `origin/staging`, and the content gate merges posts to
   `main` only, so the two trees can never agree again. Right now
   `origin/main:landing` is `535be8c` and `origin/staging:landing` is `38f1d12`.

## What is broken right now

`git diff --stat c835e0f origin/main -- landing` returns exactly four files and
nothing else:

| Live post | Missing image |
| --- | --- |
| `/blog/gamma-options-meaning` (published 20 Sep) | `gamma-across-moneyness.svg` |
| `/blog/gamma-options-meaning` | `gamma-by-dte.svg` |
| `/blog/option-assignment-what-happens` (published 21 Sep) | `assignment-account-line-by-line.svg` |
| `/blog/option-assignment-what-happens` | `assignment-put-vs-call.svg` |

Each one is referenced from the post's markdown with a full alt text, so what a
reader gets is a broken-image box where a diagram and its explanation should be.

**One thing I could not check:** the live site itself. `deltamint.app` is 403 at
CONNECT from an agent session (the standing allowlist item), so the above is
read off the deploy history, the wrangler config and the post source — not off
a browser. Opening either post settles it in a second. `site-health.yml` is
green and does not fetch a post's images, which is why nothing caught this.

## Why I did not fix it

Both halves are changes to how the **production** marketing site deploys, and
the content gate's destination was deliberately redesigned on 20 September
(`e34b3e9` / `9f9d4c8`, whose own comments argue the trunk choice at length).
That is a design decision with production blast radius, which the duty engineer
escalates rather than makes.

## What to do

**To see the four diagrams today, changing no workflow:** bring those four
files onto `staging`, then re-run *Deploy landing site* on `main` from the
Actions tab. The re-run alone is not enough — the staging-first gate refuses
until the trees match. I did not do the first half unasked because moving
content between trunks is precisely the thing that was just redesigned.

**To stop it recurring,** the smaller change is probably enough on its own:

```diff
--- a/.github/workflows/content-merge.yml
+++ b/.github/workflows/content-merge.yml
@@ (after the "Publish to the blog" step)
+      # The post's diagrams are static assets on the landing Worker, not rows
+      # in the blog table, so publishing the text is only half the job. Same
+      # GITHUB_TOKEN limitation, same explicit dispatch.
+      - name: Deploy the landing site so the post's diagrams exist
+        if: steps.gate.outputs.ok == 'true' && env.TRUNK == 'main'
+        env:
+          GH_TOKEN: ${{ github.token }}
+        run: gh workflow run deploy-landing.yml --ref main
```

That still meets the staging-first gate, so it needs one of:

- **(a)** the content gate also carries `landing/public/assets/blog/**` onto
  `staging` when it merges, which keeps the gate honest and costs one more
  push; or
- **(b)** the gate compares everything in `landing/` *except*
  `public/assets/blog/**`, on the ground that a diagram has already passed
  desk-editor and compliance-gate and contains no code.

(b) loosens a control you put there deliberately, so it is your call and not
mine. (a) keeps the rule intact.

## Also, smaller, and staging only

The staging edge functions have not deployed since 20 September. *Deploy edge
functions (staging)* run #148 failed at `npm run context:check` on `3a7e7ed`
(a stale generated doc, regenerated since), and that workflow only re-runs on a
push touching `supabase/functions/**` — so a docs-only commit never retries it.
The support/agents email sender split is therefore correct in the repo and not
yet live on the staging project; the next function push will carry it.
Production is unaffected. Nothing for you to do unless you want it sooner, in
which case re-running that workflow is enough.
