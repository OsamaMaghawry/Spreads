import { useMemo, useState } from "react";
import { FUTURES } from "../../../supabase/functions/_shared/futuresSpecs.js";
import { cleanRules, heldContracts, goalMet } from "@/lib/propRules";
import { fmtMoney } from "@/lib/format";

// Futures practice in the replay (21 Nov 2026, the owner: "I need to do some
// training on Futures ... simulate the futures as is even with the contract
// sizes and points values. As, I want to take prop firms chanllenges"; on the
// rules: "I need this fillable, I will do myself later"; the design approved
// as the "DeltaMint Futures Challenge" prototype).
//
// Three views: the challenge as the replay plays it (lib/futuresPlay,
// lib/propRules), the firm's rules as the owner types them (nothing filled in
// for him; a rule left blank is off), and the contracts with their real CME
// sizes. Kept with the account (terminal_prefs "futures", Terminal.jsx).

/** @type {[string, string, string, boolean, string][]} */
const FIELDS = [
  ["accountSize", "Account size", "$", true, "The balance the challenge starts at."],
  ["profitTarget", "Profit target", "$", true, "Closed profit needed to pass, flat."],
  ["maxLoss", "Maximum loss", "$", true, "Static: below the start. Trailing: below the high."],
  ["lockAt", "Floor stops rising at", "$", false, "Blank: the starting balance."],
  ["dailyLoss", "Daily loss limit", "$", false, "Blank: no daily limit."],
  ["maxContracts", "Maximum contracts", "", false, "Blank: no limit."],
  ["flatBy", "Flat by (New York)", "", false, "Like 16:59. Blank: may hold past the close."],
  ["minDays", "Minimum trading days", "", false, "Days with at least one fill."],
  ["consistencyPct", "Consistency: best day at most", "%", false, "Blank: no consistency rule."],
  ["feeFull", "Commission per side, full-size and E-mini", "$", false, "Your firm's rate per contract. Blank: none."],
  ["feeMicro", "Commission per side, micro", "$", false, "Your firm's rate per contract. Blank: none."],
  ["contracts", "Contracts per buy or sell hotkey", "", false, "Blank: 1. A hotkey sized in shares uses its own number."]
];
/** @type {[string, string, [string, string][], boolean?][]} */
const CHOICES = [
  ["drawdown", "How the maximum loss moves", [["static", "Static"], ["eod", "Trails end of day"], ["intraday", "Trails intraday"]], true],
  ["dailyLossMode", "When the daily limit is hit", [["lock", "Lock for the day"], ["fail", "Fail the challenge"]]],
  ["dailyBase", "Daily loss measured from", [["equity", "Equity at 18:00"], ["balance", "Prior closed balance"]]],
  ["dailyCountsOpen", "Open P/L counts against the day", [["yes", "Yes"], ["no", "Closed only"]]],
  ["microsAsFraction", "Micros count toward the limit as", [["no", "Whole contracts"], ["yes", "Their fraction of a full-size"]]],
  ["consistencyBase", "Consistency measured against", [["profit", "Total profit"], ["target", "The profit target"]]]
];
export const FUTURES_DEFAULT = { enabled: true, form: {}, choice: { dailyLossMode: "lock", dailyBase: "equity", dailyCountsOpen: "yes", microsAsFraction: "no", consistencyBase: "profit" }, pinned: [] };

/** The stored settings, whatever was kept: every part present, strings only in the form. */
export function cleanFutures(v) {
  const form = {};
  for (const [k] of FIELDS) { const x = v?.form?.[k]; if (typeof x === "string" && x.length <= 20) form[k] = x; }
  const choice = { ...FUTURES_DEFAULT.choice };
  for (const [k, , opts] of CHOICES) if (opts.some(([id]) => id === v?.choice?.[k])) choice[k] = v.choice[k];
  const pinned = (Array.isArray(v?.pinned) ? v.pinned : []).filter((r) => FUTURES[r]).slice(0, 60);
  return { enabled: v?.enabled !== false, form, choice, pinned };
}

const num = (s) => {
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const clockMinutes = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The rules from the settings (lib/propRules cleanRules), or the reason they cannot run yet. */
export function rulesOf(settings) {
  const f = settings.form;
  const c = settings.choice;
  const bad = FIELDS.filter(([k]) => k !== "flatBy" && Number.isNaN(num(f[k]))).map(([, label]) => label);
  if (bad.length) return { reason: `Not a number: ${bad.join(", ")}.` };
  if (f.flatBy && clockMinutes(f.flatBy) === null) return { reason: "Flat by: a New York time like 16:59." };
  const out = cleanRules({
    accountSize: num(f.accountSize), profitTarget: num(f.profitTarget), maxLoss: num(f.maxLoss), drawdown: c.drawdown,
    lockAt: num(f.lockAt), dailyLoss: num(f.dailyLoss), dailyLossMode: c.dailyLossMode, dailyBase: c.dailyBase,
    dailyCountsOpen: c.dailyCountsOpen !== "no", maxContracts: num(f.maxContracts), microsAsFraction: c.microsAsFraction === "yes",
    flatBy: f.flatBy ? clockMinutes(f.flatBy) : null, minDays: num(f.minDays), consistencyPct: num(f.consistencyPct), consistencyBase: c.consistencyBase
  });
  return out.reason ? { reason: out.reason } : { rules: out.rules };
}

/** What the replay needs from the settings: contracts per hotkey and the commissions. */
// A blank or unreadable commission is none; Settings says when one is not a number.
const fee = (s) => { const n = num(s); return Number.isFinite(n) && n >= 0 ? n : 0; };
export const futuresTerms = (settings) => ({
  contracts: num(settings.form.contracts) || 1,
  feeFull: fee(settings.form.feeFull),
  feeMicro: fee(settings.form.feeMicro)
});

const GROUPS = [...new Set(Object.values(FUTURES).map((c) => c.group))];
const SIZE_NAME = { standard: "Full", "e-mini": "E-mini", micro: "Micro" };
const tickValue = (v) => (v >= 1 ? `$${Number(v.toFixed(4))}` : `$${v}`);
const pill = (on) => `rounded border px-2 py-0.5 text-[11px] ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;

function Meter({ label, value, frac, tone, note }) {
  const p = Math.max(0, Math.min(1, frac || 0)) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs"><span className="font-medium">{label}</span><span className="tabular-nums">{value}</span></div>
      <div className="h-1.5 overflow-hidden rounded bg-slate-100"><div className={`h-1.5 rounded ${tone}`} style={{ width: `${p.toFixed(1)}%` }} /></div>
      {note && <div className="text-[11px] text-slate-500">{note}</div>}
    </div>
  );
}

function ChallengeView({ settings, onSettings, now, replaying, rules }) {
  if (!now) {
    return (
      <div className="space-y-2 p-3 text-xs text-slate-600">
        <label className="flex items-center gap-2 text-slate-800">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => onSettings({ ...settings, enabled: e.target.checked })} />
          Run the challenge in futures replays
        </label>
        {rules.reason
          ? <p className="rounded bg-amber-50 p-2 text-amber-900">Fill in your firm&apos;s rules under Settings: {rules.reason}</p>
          : <p>{settings.enabled ? "Set." : "Off."} {replaying ? "This replay started without a challenge: start a new replay on a futures contract to run one." : "Chart a futures contract (/ES, /MNQ, /CL…) and press Replay: the challenge starts with it, under the rules as they are then."}</p>}
        <p className="text-[11px] text-slate-500">Practice only: futures are simulated on CME prices, nothing is sent to a broker.</p>
      </div>
    );
  }
  const { rules: r, state: s, figures: f } = now;
  // Every figure from the book as it stands (f), so a forced close shows at once.
  const profit = f.balance - r.accountSize;
  const goal = goalMet({ ...s, balance: f.balance }, r);
  const terms = futuresTerms(settings);
  const today = s.days[s.day]?.pl ?? 0;
  // As the rule measures it (lib/propRules challengeStep): with open P/L from
  // the chosen base; closed only, always from the prior closed balance.
  const dayUsed = r.dailyLoss > 0 ? Math.max(0, (r.dailyCountsOpen ? s.dayOpen - f.equity : s.dayOpenBalance - f.balance)) : 0;
  const dayBase = !r.dailyCountsOpen ? "the prior closed balance (closed trades only)" : r.dailyBase === "balance" ? "the prior closed balance" : "equity at 18:00";
  const traded = Object.values(s.days).filter((d) => d.traded).length;
  const held = heldContracts(f.positions, r);
  const tone = { active: "bg-indigo-100 text-indigo-800", locked: "bg-amber-100 text-amber-900", failed: "bg-rose-100 text-rose-800", passed: "bg-emerald-100 text-emerald-800" }[s.status];
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Challenge</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{{ active: "Active", locked: "Locked for the day", failed: "Failed", passed: "Passed" }[s.status]}{now.ended ? " · replay ended" : ""}</span>
      </div>
      {s.why && s.status !== "active" && <p className="text-xs text-slate-700">{s.why}</p>}
      {s.status === "active" && profit >= r.profitTarget && !goal.met && <p className="text-xs text-slate-700">{goal.why}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Balance (closed)</div><div className="text-sm font-semibold tabular-nums">{fmtMoney(f.balance)}</div></div>
        <div className="rounded bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Equity (with open)</div><div className="text-sm font-semibold tabular-nums">{fmtMoney(f.equity)}</div></div>
      </div>
      <Meter label="Profit target" value={`${fmtMoney(profit)} of ${fmtMoney(r.profitTarget)}`} frac={profit / r.profitTarget} tone="bg-emerald-700"
        note={profit >= r.profitTarget ? (goal.met ? "Reached." : "Reached: passes once flat with the days and consistency met.") : `${fmtMoney(r.profitTarget - profit)} to go, closed and flat.`} />
      <Meter label="Room to the maximum-loss floor, at the last price" value={fmtMoney(f.equity - s.floor)} frac={(f.equity - s.floor) / r.maxLoss} tone="bg-indigo-600"
        note={`Floor ${fmtMoney(s.floor)}, ${r.drawdown === "static" ? "fixed" : r.drawdown === "eod" ? "trails the equity at each day's close" : "trails the best equity reached, each minute's best price"}${r.drawdown === "static" ? "" : `, stops at ${fmtMoney(r.lockAt)}`}.`} />
      {r.dailyLoss > 0
        ? <Meter label="Daily loss used, at the last price" value={`${fmtMoney(dayUsed)} of ${fmtMoney(r.dailyLoss)}`} frac={dayUsed / r.dailyLoss} tone="bg-rose-700"
          note={`Today closed ${today >= 0 ? "+" : ""}${fmtMoney(today)}; measured from ${dayBase}. Hitting it ${r.dailyLossMode === "fail" ? "fails the challenge" : "locks the day"}.`} />
        : <div className="text-[11px] text-slate-500">No daily loss limit set.</div>}
      <Meter label="Contracts held" value={r.maxContracts > 0 ? `${Number(held.toFixed(2))} of ${r.maxContracts}` : `${Number(held.toFixed(2))}, no limit`} frac={r.maxContracts > 0 ? held / r.maxContracts : 0} tone="bg-indigo-600"
        note={r.microsAsFraction ? "Minis and micros count as their fraction of the full-size contract." : "Every contract counts as one."} />
      <dl className="space-y-1 border-t border-slate-100 pt-2 text-xs">
        <div className="flex justify-between"><dt className="text-slate-500">Trading days</dt><dd className="tabular-nums">{r.minDays ? `${traded} of ${r.minDays}` : traded}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Flat by</dt><dd>{r.flatBy !== null ? `${String(Math.floor(r.flatBy / 60)).padStart(2, "0")}:${String(r.flatBy % 60).padStart(2, "0")} New York` : "off"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Commission per side</dt><dd>{terms.feeFull || terms.feeMicro ? `${fmtMoney(terms.feeFull)} full-size, ${fmtMoney(terms.feeMicro)} micro` : "none set: figures are before commission"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Consistency</dt><dd>{r.consistencyPct ? `best day at most ${r.consistencyPct}% of the ${r.consistencyBase === "target" ? "target" : "profit"}` : "off"}</dd></div>
      </dl>
      <p className="text-[11px] text-slate-500">Checked every minute at that minute&apos;s worst price for what you hold; a breach closes the position where the limit was crossed (at the open when the minute opened through it). Rules as they were when this replay started; a contract&apos;s commission is fixed at its first fill. Fills cannot be changed during a challenge. Practice only.</p>
    </div>
  );
}

function SettingsView({ settings, onSettings, rules }) {
  const setField = (k, v) => onSettings({ ...settings, form: { ...settings.form, [k]: v } });
  const setChoice = (k, v) => onSettings({ ...settings, choice: { ...settings.choice, [k]: v } });
  return (
    <div className="space-y-3 p-3">
      <p className="text-xs text-slate-600">Your firm&apos;s rules, as your firm states them. Nothing is filled in for you; a rule left blank is off. Saved with your account; a replay keeps the rules it started with.</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
        {FIELDS.map(([k, label, unit, req, hint]) => (
          <label key={k} className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium">{label} <span className={`text-[10px] ${req ? "text-rose-700" : "text-slate-400"}`}>{req ? "required" : "optional"}</span></span>
            <span className="flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 focus-within:border-slate-500">
              {unit === "$" && <span className="text-slate-400">$</span>}
              <input className="h-7 min-w-0 flex-1 bg-transparent font-mono text-xs focus:outline-none" inputMode={k === "flatBy" ? "text" : "decimal"} value={settings.form[k] || ""}
                placeholder={k === "flatBy" ? "16:59" : ""} onChange={(e) => setField(k, e.target.value.slice(0, 20))} aria-label={label} />
              {unit === "%" && <span className="text-slate-400">%</span>}
            </span>
            <span className="text-[10px] text-slate-500">{hint}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
        {CHOICES.map(([k, label, opts, req]) => (
          <fieldset key={k} className="rounded border border-slate-200 p-2">
            <legend className="px-1 text-xs font-medium">{label} {req && <span className="text-[10px] text-rose-700">required</span>}</legend>
            {k === "dailyBase" && settings.choice.dailyCountsOpen === "no" && <p className="mb-1 text-[10px] text-slate-500">Closed trades only: measured from the prior closed balance, whatever is chosen here.</p>}
            <div className="flex flex-wrap gap-1">
              {opts.map(([id, name]) => (
                <button key={id} type="button" aria-pressed={settings.choice[k] === id} onClick={() => setChoice(k, id)} className={pill(settings.choice[k] === id)}>{name}</button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p className={`text-xs ${rules.reason ? "text-amber-800" : "text-emerald-800"}`}>{rules.reason ? `Not ready yet: ${rules.reason}` : "Ready: the next futures replay runs under these rules."}</p>
    </div>
  );
}

function ContractsView({ settings, onSettings, onPick }) {
  const [group, setGroup] = useState("Equity index");
  const [size, setSize] = useState("all");
  const list = useMemo(() => Object.values(FUTURES).filter((c) => c.group === group && (size === "all" || c.size === size)), [group, size]);
  const pinned = new Set(settings.pinned);
  const pin = (root) => onSettings({ ...settings, pinned: pinned.has(root) ? settings.pinned.filter((r) => r !== root) : [...settings.pinned, root] });
  return (
    <div className="space-y-2 p-3">
      {settings.pinned.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-slate-500">Pinned:</span>
          {settings.pinned.map((r) => <button key={r} type="button" onClick={() => onPick(`/${r}`)} className="rounded border border-slate-300 px-1.5 py-0.5 font-mono hover:bg-slate-50" title={`Chart /${r}`}>/{r}</button>)}
        </div>
      )}
      <div className="flex flex-wrap gap-1">{GROUPS.map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={pill(group === g)}>{g}</button>)}</div>
      <div className="flex flex-wrap gap-1">{[["all", "All sizes"], ["standard", "Full-size"], ["e-mini", "E-mini"], ["micro", "Micro"]].map(([id, name]) => <button key={id} type="button" aria-pressed={size === id} onClick={() => setSize(id)} className={pill(size === id)}>{name}</button>)}</div>
      {!list.length && (
        <p className="rounded bg-slate-50 p-2 text-xs text-slate-700">
          {group === "Equity index" && size === "standard"
            ? "No full-size stock index futures: CME delisted the full-size S&P 500 ($250 a point) in 2021, and the E-mini is now the largest stock index contract. Prop firms trade the E-mini and the Micro."
            : `No ${size === "e-mini" ? "E-mini" : size === "micro" ? "micro" : "full-size"} contract in ${group} here. Choose All sizes to see what there is.`}
        </p>
      )}
      {list.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr className="text-right"><th className="px-2 py-1 text-left font-medium">Contract</th><th className="px-2 py-1 font-medium">$ / point</th><th className="px-2 py-1 font-medium">Tick</th><th className="px-2 py-1 font-medium">$ / tick</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.root} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={pinned.has(c.root)} onChange={() => pin(c.root)} aria-label={`Pin /${c.root}`} />
                      <button type="button" onClick={() => onPick(`/${c.root}`)} className="text-left hover:underline" title={`Chart /${c.root}`}>
                        <span className="font-mono font-semibold">/{c.root}</span> <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">{SIZE_NAME[c.size]}</span>
                        <span className="block text-[11px] text-slate-500">{c.name}</span>
                      </button>
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right font-mono">${c.pointValue.toLocaleString("en-US")}</td>
                  <td className="px-2 py-1 text-right font-mono">{c.tick}</td>
                  <td className="px-2 py-1 text-right font-mono">{tickValue(c.tickValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500">CME contract terms. Prices from Databento, the front contract by volume; a position held into a contract roll closes at the old contract&apos;s last price.</p>
    </div>
  );
}

/** The Futures tab: `now` is the replay's challenge (useReplay challengeNow) or null. */
export default function FuturesChallenge({ settings, onSettings, now, replaying, onPick }) {
  const [view, setView] = useState("challenge");
  const rules = useMemo(() => rulesOf(settings), [settings]);
  return (
    <div className="h-full overflow-auto">
      <div className="flex gap-1 border-b border-slate-100 px-3 py-1.5">
        {[["challenge", "Challenge"], ["settings", "Settings"], ["contracts", "Contracts"]].map(([id, name]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={pill(view === id)}>{name}</button>
        ))}
      </div>
      {view === "challenge" && <ChallengeView settings={settings} onSettings={onSettings} now={now} replaying={replaying} rules={rules} />}
      {view === "settings" && <SettingsView settings={settings} onSettings={onSettings} rules={rules} />}
      {view === "contracts" && <ContractsView settings={settings} onSettings={onSettings} onPick={onPick} />}
    </div>
  );
}
