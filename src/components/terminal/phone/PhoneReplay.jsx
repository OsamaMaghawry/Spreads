import { useState } from "react";
import { Play, Pause, StepBack, StepForward } from "lucide-react";
import { pxFor, sizeText, isFutures } from "@/lib/terminal";
import { FUTURES } from "../../../../supabase/functions/_shared/futuresSpecs.js";
import { Btn, Chip, QtyField } from "./phoneParts";

// The replay on a phone: back a candle, play or pause, forward a candle, the
// speed, and practice Buy and Sell at the price now, all thumb-sized. Each
// practice trade asks first, as every order does on the phone. The desktop
// bar, with prices for waiting orders, stops, targets and the date jump, opens
// under "All controls"; nothing in the replay is held back.

const SPEEDS = [0.5, 1, 2, 5, 10];

export default function PhoneReplay({ session, replay, symbol, acct, price, askConfirm, fullBar }) {
  const contract = isFutures(symbol) ? FUTURES[symbol.slice(1)] : null;
  const [qty, setQty] = useState(contract ? 1 : 100);
  const [all, setAll] = useState(false);
  const pos = acct?.qty || 0;
  const unit = contract ? "contracts" : "shares";
  const trade = (side) => askConfirm({
    title: `Practice ${side === "buy" ? "buy" : "sell"} ${symbol}`,
    lines: [`${side === "buy" ? "Buy" : "Sell"} ${sizeText(qty)} ${unit} at ${pxFor(symbol, price)}, the replay's price now`,
      contract ? `${contract.name}: $${contract.pointValue.toLocaleString("en-US")} a point` : null, "Practice only: nothing goes to a broker."],
    to: [], label: side === "buy" ? "Buy" : "Sell", tone: side,
    run: () => replay.trade(symbol, side, qty, "", null)
  });
  const flatten = () => askConfirm({
    title: `Flatten ${symbol}`, lines: [`Close the practice ${pos > 0 ? "long" : "short"} of ${sizeText(Math.abs(pos))} at ${pxFor(symbol, price)}`],
    to: [], label: "Flatten", tone: "sell", run: () => replay.flatten(symbol, 100)
  });
  return (
    <div className="shrink-0 space-y-2 border-t border-amber-300 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Btn onClick={replay.stepBack} aria-label="Back one candle" className="w-12"><StepBack className="h-5 w-5" /></Btn>
        <Btn tone="primary" onClick={replay.toggle} aria-label={session.playing ? "Pause" : "Play"} className="w-16">{session.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</Btn>
        <Btn onClick={replay.step} aria-label="Forward one candle" className="w-12"><StepForward className="h-5 w-5" /></Btn>
        <Btn onClick={() => replay.setSpeed(SPEEDS[(SPEEDS.indexOf(session.speed) + 1) % SPEEDS.length] ?? 1)} className="w-14">{session.speed}×</Btn>
        <div className="min-w-0 flex-1 text-right text-xs leading-tight text-amber-950">
          <div className="truncate font-semibold">{session.clockText}</div>
          <div className="tabular-nums">{pos ? `${pos > 0 ? "Long" : "Short"} ${sizeText(Math.abs(pos))} @ ${pxFor(symbol, acct.avg)}` : "Flat"}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><QtyField label={contract ? "Ct" : "Sh"} value={qty} onChange={setQty} steps={contract ? [-1, 1] : [-10, 10]} /></div>
        <Chip onClick={() => setAll((v) => !v)} on={all}>All controls</Chip>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Btn tone="sell" onClick={() => trade("sell")}>Sell</Btn>
        <Btn tone="danger" onClick={flatten} disabled={!pos}>Flatten</Btn>
        <Btn tone="buy" onClick={() => trade("buy")}>Buy</Btn>
      </div>
      {all && <div className="-mx-3 max-h-[40vh] overflow-auto">{fullBar}</div>}
    </div>
  );
}
