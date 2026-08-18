import { Link, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CandlestickChart, LayoutDashboard, KeyRound, LogOut, Radar } from "lucide-react";

export default function Layout() {
  const { pathname } = useLocation();
  const linkCls = (active) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm transition-colors ${
      active ? "bg-slate-900/[0.06] text-slate-900 font-medium" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.04]"
    }`;

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-700">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2.5 mr-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <CandlestickChart className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="font-semibold tracking-tight text-slate-900">Spread Deck</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link to="/" className={linkCls(pathname === "/")}>
              <LayoutDashboard className="w-4 h-4" /> <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link to="/screener" className={linkCls(pathname === "/screener")}>
              <Radar className="w-4 h-4" /> <span className="hidden sm:inline">Screener</span>
            </Link>
            <Link to="/accounts" className={linkCls(pathname === "/accounts")}>
              <KeyRound className="w-4 h-4" /> <span className="hidden sm:inline">Accounts</span>
            </Link>
          </nav>
          <button
            onClick={() => base44.auth.logout()}
            className="ml-auto flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}