// What the market emails say, written by Claude from sources it is handed or
// finds. The deterministic half -- holdings, prices, layout -- is marketMail.ts.
//
// Four calls, each small enough to read in one sitting:
//   researchOvernight  web search: Asia, Europe, futures, rates, today's calendar
//   writeMarket        the brief's market section, as JSON, from that research
//                      plus the Alpaca tape and headlines
//   writeHoldingNotes  one or two sentences per held stock, from its own news
//   triageNews         intraday: which new headlines are major for a holder
//
// Every link that reaches an email is checked against the material the model
// was given (keepKnownUrls), so a link cannot be invented. Numbers cannot be
// checked that way, which is why the prompts forbid any figure not in the
// material and the email footer says it was written with AI from sources.

import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import type { MarketSection, Move, SymbolNote } from "./marketMail.ts";
import { keepKnownUrls, noLongDashes, pct, usd } from "./marketMail.ts";

export const MODEL = "claude-opus-5-5";

// A request the model declines is re-run on the model Anthropic recommends
// for that kind of decline, inside the same call, rather than returning empty.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

function client() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in this project's function secrets");
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 });
}

export interface NewsItem {
  id: number;
  headline: string;
  summary?: string;
  source?: string;
  url?: string;
  symbols?: string[];
  created_at: string;
}

// The house rules every call carries. Written as reasons, not just orders,
// because the model applies a rule it understands to cases the rule did not
// name.
const HOUSE = `You write for DeltaMint, software that options traders use to track and manage their own positions. Readers are active traders reading on a phone a few minutes before the US open.

Rules that are not negotiable:
- Facts only, each one taken from the material you were given or found. Never write a number, a time, a name or a quote that is not in that material. If you cannot confirm something, leave it out: a shorter email is fine, a wrong one is not.
- No advice. DeltaMint is not an investment adviser. Never tell the reader to buy, sell, hold, open, close, roll, hedge or watch out for a position, never say what a price will do, and never call anything a good or bad trade, an opportunity or a risk to act on. Say what happened, what is scheduled and what the source reported.
- Plain, short sentences in US English. No hype words (soar, plunge, skyrocket, crash, explode), no exclamation marks, no emojis, no rhetorical questions.
- Never use an em dash or an en dash. Use a colon, a comma or a full stop instead.
- Percent changes with a sign and one decimal (+0.4%, -1.2%). Times in ET.`;

function guard(msg: any, what: string) {
  if (msg?.stop_reason === "refusal") {
    throw new Error(`${what}: the model declined (${msg?.stop_details?.category ?? "no category"})`);
  }
  if (msg?.stop_reason === "max_tokens") throw new Error(`${what}: the answer was cut off at max_tokens`);
}

const textOf = (msg: any) =>
  (msg?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();

function jsonOf(msg: any, what: string) {
  const t = textOf(msg);
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`${what}: the answer was not valid JSON`);
  }
}

// ---------- 1. research ----------

export async function researchOvernight(when: { date: string; time: string }): Promise<{ notes: string; urls: string[] }> {
  const prompt = `It is ${when.time} on ${when.date}, before the US stock market opens at 9:30 ET.

Search the web and collect, from sources published in the last 24 hours:
1. Asia: how the Nikkei 225, Hang Seng, Shanghai Composite, Kospi and ASX 200 closed today, with percent changes, and the main reason given for any big move.
2. Europe: where the STOXX 600, DAX and FTSE 100 are trading now.
3. US index futures (S&P 500, Nasdaq 100, Dow) now, the 10-year Treasury yield, the dollar, oil, gold and bitcoin.
4. Today's US economic releases and Fed speakers with their ET times, and any release already out this morning with its actual number against the forecast.
5. The two to five overnight stories most cited as moving US stocks this morning: company news, policy, geopolitics.
6. Notable US earnings today, before the open and after the close.

Write plain notes, grouped under those six numbers. After every fact put the URL of the source you read it in, in parentheses. Skip anything you could not confirm from a dated source; say "not found" under a heading rather than guess.`;

  const c = client();
  const messages: any[] = [{ role: "user", content: prompt }];
  const urls = new Set<string>();
  let notes = "";
  for (let turn = 0; turn < 4; turn++) {
    const msg: any = await c.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      system: HOUSE,
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
      messages
    } as any);
    guard(msg, "research");
    for (const b of msg.content || []) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r?.url) urls.add(String(r.url));
      }
      if (b.type === "text") for (const cit of b.citations || []) if (cit?.url) urls.add(String(cit.url));
    }
    notes += (notes ? "\n" : "") + textOf(msg);
    // A long search turn can pause; hand it back and let it finish.
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    break;
  }
  // URLs the notes quote are sources too: they came from the searches above.
  for (const m of notes.matchAll(/https?:\/\/[^\s)\]]+/g)) urls.add(m[0].replace(/[.,;]+$/, ""));
  if (!notes) throw new Error("research: no notes came back");
  return { notes, urls: [...urls] };
}

// ---------- 2. the market section ----------

const MARKET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "headline", "summary", "overnight", "movers", "calendar"],
  properties: {
    subject: { type: "string" },
    headline: { type: "string" },
    summary: { type: "string" },
    overnight: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["region", "text", "source_url"],
        properties: { region: { type: "string" }, text: { type: "string" }, source_url: { type: "string" } }
      }
    },
    movers: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["text", "source_url"],
        properties: { text: { type: "string" }, source_url: { type: "string" } }
      }
    },
    calendar: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["time_et", "event"],
        properties: { time_et: { type: "string" }, event: { type: "string" } }
      }
    }
  }
};

export async function writeMarket(input: {
  date: string; time: string; tape: Move[]; research: string; researchUrls: string[]; news: NewsItem[];
}): Promise<MarketSection> {
  const tape = input.tape.map((t) => `${t.label} (${t.symbol}): ${usd(t.price)}, ${pct(t.change)} against yesterday's close`).join("\n");
  const news = input.news.slice(0, 40).map((n) =>
    `- [${n.created_at}] ${n.headline}${n.symbols?.length ? ` (${n.symbols.slice(0, 5).join(", ")})` : ""}${n.url ? ` ${n.url}` : ""}`).join("\n");

  const prompt = `Write the market section of today's pre-market brief, ${input.date}, as of ${input.time}.

THE MATERIAL. Use nothing else.

Pre-market ETF prices from our data feed (these are exact; prefer them over any futures figure for the US):
${tape}

Research notes from this morning's web search, with their sources:
${input.research}

Market headlines from the Alpaca news feed since yesterday's close:
${news || "(none)"}

WHAT TO RETURN, as JSON:
- subject: the email subject, at most 60 characters, the single most important thing this morning. No dash of any kind.
- headline: one sentence, at most 90 characters.
- summary: two to four sentences, at most 70 words, on the shape of the morning: where futures are, and the one or two things driving them.
- overnight: two to four rows. region is one of "Asia", "Europe", "US futures", "Rates and commodities". text is one or two sentences with the numbers. source_url is the URL that supports it, copied exactly from the material, or "" if the numbers came from our pre-market prices.
- movers: three to six items, the stories moving US stocks this morning, each at most 35 words, most important first, each with the source_url it came from (copied exactly) or "".
- calendar: today's scheduled US releases, Fed speakers and notable earnings, in time order. time_et like "8:30", "10:00", "Before open" or "After close". At most eight rows. Leave out anything without a confirmed time or date of today.`;

  const msg: any = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    system: HOUSE,
    output_config: { effort: "high", format: { type: "json_schema", schema: MARKET_SCHEMA } },
    messages: [{ role: "user", content: prompt }]
  } as any);
  guard(msg, "market section");
  const out = jsonOf(msg, "market section");

  const known = new Set([...input.researchUrls, ...input.news.map((n) => n.url || "").filter(Boolean)]);
  const keep = (u: string) => keepKnownUrls([u], known)[0] || null;
  return {
    subject: noLongDashes(out.subject).slice(0, 90),
    headline: noLongDashes(out.headline),
    summary: noLongDashes(out.summary),
    overnight: (out.overnight || []).slice(0, 4).map((o: any) => ({ region: o.region, text: noLongDashes(o.text), source_url: keep(o.source_url) })),
    movers: (out.movers || []).slice(0, 6).map((o: any) => ({ text: noLongDashes(o.text), source_url: keep(o.source_url) })),
    calendar: (out.calendar || []).slice(0, 8).map((c: any) => ({ time_et: noLongDashes(c.time_et), event: noLongDashes(c.event) }))
  };
}

// ---------- 3. notes on what the reader holds ----------

const NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["notes"],
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["symbol", "text", "urls"],
        properties: { symbol: { type: "string" }, text: { type: "string" }, urls: { type: "array", items: { type: "string" } } }
      }
    }
  }
};

export async function writeHoldingNotes(items: {
  symbol: string; move: Move | null; earnings: string | null; news: NewsItem[];
}[]): Promise<SymbolNote[]> {
  const withNews = items.filter((i) => i.news.length);
  if (!withNews.length) return [];
  const blocks = withNews.map((i) => [
    `## ${i.symbol}`,
    i.move?.change != null ? `Pre-market: ${pct(i.move.change)} against yesterday's close.` : null,
    i.earnings ? `Next earnings date: ${i.earnings}.` : null,
    ...i.news.slice(0, 8).map((n) => `- id ${n.id} [${n.created_at}] ${n.headline}${n.summary ? `: ${n.summary}` : ""}${n.url ? ` ${n.url}` : ""}`)
  ].filter(Boolean).join("\n")).join("\n\n");

  const prompt = `For each stock below, write the note a holder reads in this morning's brief, from that stock's own headlines only.

${blocks}

Return JSON: notes, one per stock above, with
- symbol: as given.
- text: one or two sentences, at most 45 words, on the news that is about this company itself: results, guidance, deals, regulators, products, management, analyst actions. Name the source in passing when it is an analyst or a filing. If every headline only mentions the stock in passing (market wraps, lists of movers, options-activity tallies), return "" so the email says there is no company news.
- urls: the one or two URLs, copied exactly from the headlines above, that the note is based on.`;

  const msg: any = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    system: HOUSE,
    output_config: { effort: "medium", format: { type: "json_schema", schema: NOTES_SCHEMA } },
    messages: [{ role: "user", content: prompt }]
  } as any);
  guard(msg, "holding notes");
  const out = jsonOf(msg, "holding notes");
  const known = new Map(withNews.map((i) => [i.symbol, new Set(i.news.map((n) => n.url || "").filter(Boolean))]));
  return (out.notes || [])
    .filter((n: any) => known.has(String(n.symbol).toUpperCase()))
    .map((n: any) => {
      const symbol = String(n.symbol).toUpperCase();
      const text = noLongDashes(String(n.text || "").trim());
      return { symbol, text: text || null, urls: keepKnownUrls(n.urls || [], known.get(symbol)!).slice(0, 2) };
    });
}

// ---------- 4. intraday triage ----------

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["id", "symbol", "major", "title", "what"],
        properties: {
          id: { type: "integer" }, symbol: { type: "string" }, major: { type: "boolean" },
          title: { type: "string" }, what: { type: "string" }
        }
      }
    }
  }
};

export interface Triaged { id: number; symbol: string; major: boolean; title: string; what: string }

export async function triageNews(items: NewsItem[], held: string[]): Promise<Triaged[]> {
  if (!items.length) return [];
  const list = items.slice(0, 30).map((n) =>
    `- id ${n.id} [${n.created_at}] (${(n.symbols || []).join(", ")}) ${n.headline}${n.summary ? `: ${n.summary}` : ""}`).join("\n");
  const prompt = `These headlines arrived during the US session. The reader holds positions in: ${held.join(", ")}.

${list}

For each headline decide whether it is MAJOR for a holder of the stock it is about: news that by itself can move that stock sharply today. Major means one of: earnings results or a guidance change released now; a merger, acquisition or takeover bid; an FDA or other regulator's decision; a government or court action against the company; a trading halt; bankruptcy or restructuring; a large share offering; the CEO or CFO leaving; a recall, outage or safety incident at scale; an addition to or removal from a major index; a rating downgrade or upgrade by a credit agency.
NOT major: routine analyst price-target changes and reiterations, options-activity and "stocks moving" lists, market wraps, opinion pieces, previews of events that have not happened, and anything only mentioning the stock in passing. When unsure, it is not major.

Return JSON: items, one per headline, with
- id: as given.
- symbol: the held stock it is about, from the list above.
- major: true or false.
- title: our own subject line for an alert, at most 60 characters, plain and factual, no dash of any kind. "" when not major.
- what: one or two sentences, at most 45 words, on what happened, from the headline and summary only. "" when not major.`;

  const msg: any = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    system: HOUSE,
    output_config: { effort: "low", format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
    messages: [{ role: "user", content: prompt }]
  } as any);
  guard(msg, "triage");
  const out = jsonOf(msg, "triage");
  const heldSet = new Set(held);
  return (out.items || []).map((t: any) => ({
    id: Number(t.id),
    symbol: String(t.symbol || "").toUpperCase(),
    major: t.major === true && heldSet.has(String(t.symbol || "").toUpperCase()),
    title: noLongDashes(String(t.title || "")),
    what: noLongDashes(String(t.what || ""))
  }));
}
