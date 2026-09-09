import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Radar, StopCircle } from "lucide-react";
import StrategyPicker from "@/components/open/StrategyPicker";
import ScreenerConfig, { SCREENER_DEFAULTS } from "@/components/screener/ScreenerConfig";
import ResultsTable from "@/components/screener/ResultsTable";
import TradeDialog from "@/components/screener/TradeDialog";
import useMarketScan from "@/components/screener/useMarketScan";
import ScanPresets from "@/components/common/ScanPresets";
import { SCOPE, saveLastUsed } from "@/lib/scanPresets";
import { SP500, TOP50 } from "@/lib/sp500";
import { invokeFunction } from "@/lib/functions";
import { SAFE_ACCOUNT_COLUMNS } from "@/lib/accountColumns";
import { isSingle, STRATEGY_LABEL } from "@/lib/setupUnit";

export default function Screener() {
  const [accounts, setAccounts] = useState([]);
  const [strategy, setStrategy] = useState("put_spread");
  const [cfg, setCfg] = useState(SCREENER_DEFAULTS);
  const [tradeSetup, setTradeSetup] = useState(null);
  // The whole-market pass: what the sieve kept, and where the rest went. Held
  // here rather than inside the scan hook because it happens BEFORE a scan and
  // is worth showing on its own — "1,847 priced, 31 passed" is the answer to
  // "why did my scan return so little", and without it the filters are opaque.
  const [universe, setUniverse] = useState(null);
  const [findingUniverse, setFindingUniverse] = useState(false);
  const { running, progress, candidates, skippedCount, error, start, stop } = useMarketScan();

  useEffect(() => {
    supabase
      .from("trading_accounts")
      .select(SAFE_ACCOUNT_COLUMNS)
      .then(({ data }) => setAccounts(data || []));
  }, []);

  const isCondor = strategy === "iron_condor";
  const wheel = strategy === "wheel";
  const single = wheel || isSingle(strategy);
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const tickers =
    cfg.universe === "custom"
      ? cfg.customTickers.split(",").map((t) => t.trim()).filter(Boolean)
      : cfg.universe === "sp500"
        ? SP500
        : TOP50;

  // Applying a preset merges over the defaults rather than replacing state
  // outright, so a preset saved before a new filter existed still lands in a
  // complete, valid config instead of leaving that field undefined.
  const applyPreset = (savedStrategy, savedConfig) => {
    setStrategy(savedStrategy);
    setCfg({ ...SCREENER_DEFAULTS, ...savedConfig });
  };

  const filtersFor = (strat) => ({
    strategy: strat,
    dteMin: Number(cfg.dteMin),
    dteMax: Number(cfg.dteMax),
    // No step values: how finely the scan samples inside these ranges is the
    // engine's call (see DELTA_SWEEP_STEP / WIDTH_SWEEP_STEP in optionScan.ts),
    // not a trading parameter worth putting in front of the trader.
    deltaMin: Number(cfg.deltaMin),
    deltaMax: Number(cfg.deltaMax),
    widthMin: Number(cfg.widthMin),
    widthMax: Number(cfg.widthMax),
    minCredit: Number(cfg.minCredit),
    maxCredit: 1000,
    maxRisk: cfg.maxRisk === "" ? null : Number(cfg.maxRisk),
    putRatio: isCondor ? Number(cfg.putRatio) : 1,
    callRatio: isCondor ? Number(cfg.callRatio) : 1
  });

  // A covered call is scanned on the account's own shares: one call, the
  // server picks the tickers, so the batch is a placeholder. The wheel is the
  // put scan on the universe followed by that call scan.
  const jobs = () => {
    if (strategy === "covered_call") return [{ tickers: ["HELD"], filters: filtersFor("covered_call") }];
    if (wheel) return [
      { tickers, filters: filtersFor("cash_secured_put") },
      { tickers: ["HELD"], filters: filtersFor("covered_call") }
    ];
    return [{ tickers, filters: filtersFor(strategy) }];
  };

  const run = async () => {
    // Recording what was scanned must never be able to stop the scan itself.
    saveLastUsed(SCOPE.SCREENER, strategy, cfg).catch(() => {});

    // Whole-market: price everything first, then scan chains only for what
    // survives. The sieve is a separate call so its result can be shown and
    // reasoned about, and so a scan that returns little can say why.
    if (cfg.universe === "market") {
      setFindingUniverse(true);
      setUniverse(null);
      try {
        const { data } = await invokeFunction("scanUniverse", {
          accountId: accounts[0].id,
          filters: {
            maxSpot: cfg.maxSpot === "" ? null : Number(cfg.maxSpot),
            minSpot: cfg.minSpot === "" ? null : Number(cfg.minSpot),
            minVolume: cfg.minVolume === "" ? null : Number(cfg.minVolume),
            maxSpreadPct: cfg.maxSpreadPct === "" ? null : Number(cfg.maxSpreadPct) / 100,
            maxCapitalPct: cfg.maxCapitalPct === "" ? null : Number(cfg.maxCapitalPct) / 100
          }
        });
        setFindingUniverse(false);
        if (data?.error) return;
        setUniverse(data);
        if (!data?.tickers?.length) return;
        start(accounts[0].id, [{ tickers: data.tickers, filters: filtersFor(strategy) }]);
      } catch {
        setFindingUniverse(false);
      }
      return;
    }
    start(accounts[0].id, jobs());
  };

  const minRoR = Number(cfg.minRoR) || 0;
  const shown = candidates.filter((c) => c.returnOnRisk * 100 >= minRoR);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Radar className="w-5 h-5 text-emerald-600" /> Market Screener
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Sweep the market for the best credit-to-risk setups, then trade them on any account.
        </p>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <ScanPresets scope={SCOPE.SCREENER} strategy={strategy} config={cfg} onApply={applyPreset} />
          <StrategyPicker value={strategy} onChange={setStrategy} withWheel />
          <ScreenerConfig cfg={cfg} set={set} isCondor={isCondor} single={single} strategy={strategy} />

          {findingUniverse && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Pricing every listed name to find the ones worth scanning…
            </div>
          )}

          {/* Where the universe went.
              A whole-market scan that returns four setups is indistinguishable
              from a broken one unless the sieve accounts for the rest. This is
              that accounting, and it is also how the filters become adjustable
              by eye rather than by guesswork. */}
          {universe && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 space-y-1.5">
              <div className="font-medium text-slate-800">
                {universe.considered.toLocaleString()} names priced · {universe.kept.toLocaleString()} passed the filters
              </div>
              {Object.keys(universe.dropped || {}).length > 0 && (
                <ul className="space-y-0.5 text-slate-500">
                  {Object.entries(universe.dropped)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, n]) => (
                      <li key={reason} className="tabular-nums">
                        {n.toLocaleString()} — {reason}
                      </li>
                    ))}
                </ul>
              )}
              {universe.note && <p className="text-amber-600 leading-relaxed">{universe.note}</p>}
              {universe.kept === 0 && (
                <p className="text-amber-600 leading-relaxed">
                  Nothing passed. Raise the price cap, lower the volume floor, or widen the quote limit.
                </p>
              )}
            </div>
          )}

          {running ? (
            <button
              onClick={stop}
              className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <StopCircle className="w-4 h-4" /> Stop scan
            </button>
          ) : (
            <button
              onClick={run}
              disabled={
                accounts.length === 0 ||
                findingUniverse ||
                (strategy !== "covered_call" && cfg.universe !== "market" && tickers.length === 0)
              }
              className="w-full py-2.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Radar className="w-4 h-4" />{" "}
              {strategy === "covered_call"
                ? "Scan shares held"
                : cfg.universe === "market"
                  ? "Scan the entire market"
                  : wheel
                    ? `Scan ${tickers.length} tickers and shares held`
                    : `Scan ${tickers.length} tickers`}
            </button>
          )}

          {accounts.length === 0 && (
            <p className="text-xs text-amber-600">Add a trading account first — market data uses its API keys.</p>
          )}
          {error && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">{error}</div>}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {(running || progress.total > 0) && (
            <div className="px-4 py-3 border-b border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-2">
                  {running && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />}
                  {running ? "Scanning" : "Scan complete"} — {progress.done}/{progress.total} tickers
                  {skippedCount > 0 && ` · ${skippedCount} skipped`}
                </span>
                <span>{shown.length} setups{minRoR > 0 ? ` ≥ ${minRoR}% RoR` : ""}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {shown.length > 0 && wheel ? (
            <div>
              {["cash_secured_put", "covered_call"].map((strat) => {
                const rows = shown.filter((c) => c.strategy === strat);
                return (
                  <section key={strat}>
                    <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200">
                      {strat === "cash_secured_put" ? "Puts to sell" : "Calls on shares you hold"} · {rows.length}
                    </div>
                    {rows.length > 0 ? (
                      <ResultsTable candidates={rows} onTrade={setTradeSetup} />
                    ) : (
                      <div className="px-4 py-6 text-xs text-slate-400">{running ? "Scanning…" : `No ${STRATEGY_LABEL[strat].toLowerCase()} matched.`}</div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : shown.length > 0 ? (
            <ResultsTable candidates={shown} onTrade={setTradeSetup} />
          ) : (
            <div className="px-4 py-16 text-center text-sm text-slate-400">
              {running
                ? "Results stream in as tickers are scanned…"
                : progress.total > 0
                  ? "No setups matched your filters."
                  : "Configure your filters and start a scan."}
            </div>
          )}
        </div>
      </div>

      {tradeSetup && (
        <TradeDialog setup={tradeSetup} accounts={accounts} onClose={() => setTradeSetup(null)} />
      )}
    </div>
  );
}