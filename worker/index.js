// Everything for this app answers on one address.
//
// A Cloudflare Worker also answers on its own workers.dev subdomain, and that
// is a different origin: different storage, different session. A link that
// lands there shows a signed-out app, and Connect Alpaca refuses outright,
// because the registered redirect URI belongs to the real domain.
//
// Supabase mails those links. The address it uses is the project's Site URL,
// which the build does not control and cannot see. Rather than depend on a
// setting being right, anything arriving on the wrong host is sent to the same
// path on the right one. Query and fragment survive a 301, so the token an
// auth link carries arrives intact.
//
// CANONICAL_HOST comes from the wrangler config per deployment; unset, the
// Worker just serves the app, which is what local development wants.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const canonical = env.CANONICAL_HOST;

    if (canonical && url.hostname !== canonical) {
      url.hostname = canonical;
      url.port = "";
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  }
};
