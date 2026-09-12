# Not served

Pages kept in the repo but outside `landing/public/`, which is the Worker's
asset directory. Nothing in here is reachable on the site.

## `pricing/`

Moved out on 12 Sep at the owner's instruction:

> "I need to make the integration is Demo only, hide the pricing page, I want
> to share with people and I don't want to have the pricing on something
> doesn't exist yet. Also, the product increased, so we may revise the pricing
> again."

MOVED RATHER THAN REDIRECTED, and the reason is in `wrangler.jsonc`:
production runs the Worker only for `/blog`, `/blog/*` and `/sitemap.xml`.
Every other path is served straight from static assets with no Worker
execution, so a redirect written in `src/index.js` would never fire for
`/pricing` on production — it would work on staging and silently do nothing
on the site people are actually sent to. Taking the file out of the asset
directory is the one change that is certainly true of both.

`/pricing` now returns the site's 404 page (`not_found_handling: "404-page"`).
The nav and footer links are gone from every page, and the path is out of the
sitemap — an unlinked page still handed to search engines is not hidden.

To put it back: `git mv landing/drafts/pricing landing/public/pricing`,
restore the two link lines in the nav and footer of each static page and in
`landing/src/render.js`, and add `/pricing` back to `staticPaths` in
`landing/src/index.js`. The prices inside it are the 2 Sep proposal and are
stale — the product has grown since, and the owner has said the figures are
to be revisited before it goes back up.
