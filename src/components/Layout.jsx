import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { LayoutDashboard, KeyRound, LogOut, Radar, ShieldCheck } from "lucide-react";
import Wordmark from "@/components/brand/Wordmark";
import DisclaimerFooter from "@/components/DisclaimerFooter";
import useIsAdmin from "@/lib/useIsAdmin";

export default function Layout() {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  // Hides the link for everyone else. Not a security boundary — /admin
  // redirects and the edge function refuses a non-admin token either way.
  const { isAdmin } = useIsAdmin();
  const links = [
    { to: "/", label: "dashboard", Icon: LayoutDashboard },
    { to: "/screener", label: "screener", Icon: Radar },
    { to: "/accounts", label: "accounts", Icon: KeyRound },
    ...(isAdmin ? [{ to: "/admin", label: "admin", Icon: ShieldCheck }] : [])
  ];
  const linkCls = (active) =>
    `flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] transition-colors ${
      active
        ? "bg-dm-accent/[0.08] text-dm-accent font-medium"
        : "text-dm-sub hover:text-dm-accent hover:bg-dm-accent/[0.04]"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-dm-bg font-body text-dm-text">
      <header className="sticky top-0 z-40 border-b border-dm-line bg-dm-panel">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-5 sm:px-10">
          <Link to="/" className="mr-4">
            <Wordmark size={24} textClass="text-[15px]" />
          </Link>
          <nav className="flex items-center gap-1">
            {links.map(({ to, label, Icon }) => (
              <Link key={to} to={to} className={linkCls(pathname === to)}>
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <button
            onClick={logout}
            className="ml-auto flex items-center gap-2 text-[13px] text-dm-sub transition-colors hover:text-dm-accent"
          >
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">log_out</span>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-7 sm:px-10">
        <Outlet />
      </main>
      <DisclaimerFooter />
    </div>
  );
}
