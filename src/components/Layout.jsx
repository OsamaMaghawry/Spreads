import { Link, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CandlestickChart, LayoutDashboard, KeyRound, LogOut } from "lucide-react";

export default function Layout() {
  const { pathname } = useLocation();
  const linkCls = (active) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm transition-colors ${
      active ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
    }`;

  return (
    <div className="min-h-screen bg-[#0A0E16] text-slate-200">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0A0E16]/90 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2.5 mr-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CandlestickChart className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-semibold tracking-tight text-white">Spread Deck</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link to="/" className={linkCls(pathname === "/")}>
              <LayoutDashboard className="w-4 h-4" /> <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link to="/accounts" className={linkCls(pathname === "/accounts")}>
              <KeyRound className="w-4 h-4" /> <span className="hidden sm:inline">Accounts</span>
            </Link>
          </nav>
          <button
            onClick={() => base44.auth.logout()}
            className="ml-auto flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors"
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