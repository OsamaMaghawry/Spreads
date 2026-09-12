import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard, KeyRound, LogOut, Radar, ShieldCheck, CreditCard, ListOrdered,
  Menu, X
} from "lucide-react";
import Wordmark from "@/components/brand/Wordmark";
import DisclaimerFooter from "@/components/DisclaimerFooter";
import useIsAdmin from "@/lib/useIsAdmin";
import useBillingVisible from "@/lib/useBillingVisible";

// The app's navigation, down the side rather than across the top.
//
// Three things the owner asked for, and what each one settled:
//
//   THE MENU GOES ON THE SIDE. "Make it on the side not on the top,
//   specially for phones; hamburger as now it's just icons on phones and can't
//   tell what I am opening." The top bar gave each link an icon and a label,
//   then hid the label below `sm` — so a phone showed five unlabelled glyphs
//   and you found out where you were going by arriving. A column has room for
//   the word next to the icon at every width, and behind a hamburger on a
//   phone it is the same column, not a different design.
//
//   IT LOOKS LIKE THE REST OF DELTAMINT. "The menu doesn't follow the brand
//   identity and the website fonts. Frontpage is now different from the app."
//   The links read `positions`, `screener`, `log_out` — lowercase with
//   underscores, a terminal register the landing site has nowhere. The site's
//   own nav says Blog, Pricing, Log in. So do these. The panel takes the
//   landing's metrics too: 9px radius, IBM Plex Sans at 0.95rem, `--dm-line`
//   borders, accent for the page you are on.
//
//   THE FIRST PAGE IS THE DASHBOARD. Named by the owner, and the brand book's
//   feature-name table is updated to match rather than left to contradict him.

const NAV_WIDTH = "w-[15rem]";

export default function Layout() {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  // Hides the link for everyone else. Not a security boundary — /admin
  // redirects and the edge function refuses a non-admin token either way.
  const { isAdmin } = useIsAdmin();
  // Off until the broker approves live trading, so there is no entry to a
  // payment page for something that cannot be delivered yet.
  const { billingVisible } = useBillingVisible();
  const [open, setOpen] = useState(false);

  // A drawer that survives navigation would cover the page it just opened.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Escape closes it, because a full-height overlay with no keyboard way out
  // is a trap for anyone not using a pointer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    { to: "/", label: "Dashboard", Icon: LayoutDashboard },
    { to: "/screener", label: "Screener", Icon: Radar },
    { to: "/chain", label: "Option chain", Icon: ListOrdered },
    { to: "/accounts", label: "Accounts", Icon: KeyRound },
    ...(billingVisible ? [{ to: "/billing", label: "Billing", Icon: CreditCard }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin", Icon: ShieldCheck }] : [])
  ];

  // 9px to match the landing site's buttons and menu panel exactly — the app
  // was on Tailwind's 6px, which is the kind of difference nobody names and
  // everybody sees.
  const linkCls = (active) =>
    `flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[0.95rem] transition-colors ${
      active
        ? "bg-dm-accent/[0.08] text-dm-accent font-medium"
        : "text-dm-sub hover:text-dm-accent hover:bg-dm-accent/[0.04]"
    }`;

  const panel = (
    <div className="flex h-full flex-col gap-1 p-3">
      <Link to="/" className="mb-2 hidden px-3 py-2 lg:block" onClick={() => setOpen(false)}>
        <Wordmark size={24} textClass="text-[1.05rem]" />
      </Link>
      <nav className="flex flex-col gap-0.5">
        {links.map(({ to, label, Icon }) => (
          <Link key={to} to={to} className={linkCls(pathname === to)}>
            <Icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {/* Under a rule and at the bottom, the way the landing site sets Log in
          apart from the reading links rather than mixing it in with them. */}
      <button
        onClick={logout}
        className="mt-auto flex items-center gap-3 rounded-[9px] border-t border-dm-line px-3 py-2.5 pt-4 text-[0.95rem] text-dm-sub transition-colors hover:text-dm-accent"
      >
        <LogOut className="h-[1.1rem] w-[1.1rem] shrink-0" /> <span>Log out</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-dm-bg font-body text-dm-text">
      {/* Phones and tablets: a bar that holds the wordmark and the way in. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-dm-line bg-dm-panel px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="app-nav"
          className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-dm-line text-dm-text transition-colors hover:border-dm-accent hover:text-dm-accent"
        >
          <Menu className="h-[1.1rem] w-[1.1rem]" />
        </button>
        <Link to="/">
          <Wordmark size={22} textClass="text-[1.05rem]" />
        </Link>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-dm-text/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-nav"
        className={`fixed inset-y-0 left-0 z-50 ${NAV_WIDTH} border-r border-dm-line bg-dm-panel transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* The drawer's own header, on small screens only: the wordmark is in
            the bar behind it at this width, so this row is just the way out. */}
        <div className="flex h-14 items-center justify-end border-b border-dm-line px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-dm-line text-dm-text transition-colors hover:border-dm-accent hover:text-dm-accent"
          >
            <X className="h-[1.1rem] w-[1.1rem]" />
          </button>
        </div>
        <div className="h-[calc(100%-3.5rem)] lg:h-full">{panel}</div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-[15rem]">
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-7 sm:px-10">
          <Outlet />
        </main>
        <DisclaimerFooter />
      </div>
    </div>
  );
}
