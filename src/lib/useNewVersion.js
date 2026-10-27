import { useEffect, useState } from "react";

// Whether a newer build of the app is out than the one on screen: the
// build's own id (vite.config.js) against /version.json, read every minute
// and whenever the page comes back into view. A page left open keeps the code
// it loaded with until it is reloaded; on 27 Oct a fix deployed at 16:18 was
// not on the owner's screen at 16:21, and his sale went out the old way.
const MINUTE = 60000;
const MINE = import.meta.env.VITE_BUILD_ID || "";

export default function useNewVersion() {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    if (!MINE) return undefined;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const { build } = await r.json();
        if (alive && build && build !== MINE) setNewer(true);
      } catch { /* offline, or a page without a version file: nothing to say */ }
    };
    check();
    const timer = setInterval(check, MINUTE);
    const seen = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", seen);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", seen); };
  }, []);
  return newer;
}
