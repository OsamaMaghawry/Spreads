// What SnapTrade answered, turned into something a person can judge.
//
// THE POINT OF THIS FILE. The question is not "does their API respond". It is
// "is one connection layer in front of many brokers worth more to this product
// than talking to each broker directly". That question has a small number of
// concrete parts, and every one of them is answerable from their own API:
//
//   reach        how many brokers, and how many of those can actually TRADE
//                rather than only report holdings
//   options      do they return an option position as an option -- strike,
//                expiry, right -- or as an opaque symbol
//   multi-leg    can a spread be placed as one order, which is the whole of
//                what this product does
//   history      how far back orders go, against a reconstruction that walks
//                an account's entire life
//   data         chains, daily bars, streaming quotes -- the scanner and the
//                equity line need all three
//
// So the shaping here is deliberately conservative: it maps the fields we can
// recognise, and it REPORTS THE FIELD NAMES IT DID NOT RECOGNISE rather than
// dropping them. An evaluation that silently discards half of a vendor's
// answer is worse than no evaluation, because it looks complete.

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------
//
// Probe output is stored in the database and rendered in a browser. Their
// responses carry a userSecret on registration and OAuth material on
// connections, and neither belongs in either place. Matched on the KEY rather
// than the value: a key called `userSecret` is a secret whatever it holds, and
// guessing from the value is how one slips through.

const SECRET_KEY = /(secret|token|password|credential|signature|consumer|apikey|api_key|private)/i;

const MAX_STRING = 400;
const MAX_ARRAY = 25;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "… (nested too deep to record)";
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
    return value.length > MAX_ARRAY ? [...head, `… ${value.length - MAX_ARRAY} more`] : head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// The brokerage matrix
// ---------------------------------------------------------------------------

/**
 * Field names we know how to read, and what each one means to us. Anything
 * else a brokerage row carries is surfaced under `unmapped` so the next run
 * can map it rather than lose it.
 */
const BROKER_FIELDS: Record<string, string> = {
  id: "id",
  slug: "slug",
  name: "name",
  display_name: "displayName",
  enabled: "enabled",
  maintenance_mode: "maintenance",
  allows_trading: "trading",
  allows_trading_through_snaptrade_api: "tradingViaApi",
  allows_fractional_units: "fractional",
  has_reporting: "reporting",
  is_real_time_connection: "realTime",
  url: "url",
  open_url: "openUrl",
  brokerage_type: "type",
  exchanges: "exchanges",
  description: "description"
};

const bool = (v: unknown): boolean | null =>
  v === true ? true : v === false ? false : null;

export interface BrokerRow {
  name: string;
  slug: string | null;
  enabled: boolean | null;
  maintenance: boolean | null;
  trading: boolean | null;
  tradingViaApi: boolean | null;
  realTime: boolean | null;
  fractional: boolean | null;
  type: string | null;
  unmapped: string[];
}

export function brokerRow(raw: Record<string, unknown>): BrokerRow {
  const type = raw.brokerage_type;
  return {
    name: String(raw.display_name || raw.name || raw.slug || "unnamed"),
    slug: raw.slug ? String(raw.slug) : null,
    enabled: bool(raw.enabled),
    maintenance: bool(raw.maintenance_mode),
    trading: bool(raw.allows_trading),
    tradingViaApi: bool(raw.allows_trading_through_snaptrade_api),
    realTime: bool(raw.is_real_time_connection),
    fractional: bool(raw.allows_fractional_units),
    type:
      type && typeof type === "object"
        ? String((type as Record<string, unknown>).name ?? "")
        : type
          ? String(type)
          : null,
    unmapped: Object.keys(raw).filter((k) => !(k in BROKER_FIELDS))
  };
}

export interface BrokerMatrix {
  total: number;
  enabled: number;
  /** Brokers that can place an order, by either of the two flags they expose. */
  tradable: number;
  inMaintenance: number;
  /** Every distinct field name seen across the rows, so nothing is lost. */
  fieldsSeen: string[];
  /** Field names no row mapped, which is the list to teach this file next. */
  fieldsUnmapped: string[];
  rows: BrokerRow[];
}

export function brokerMatrix(raw: unknown): BrokerMatrix {
  const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const rows = list.map(brokerRow);
  const seen = new Set<string>();
  for (const r of list) for (const k of Object.keys(r)) seen.add(k);
  const tradableRow = (r: BrokerRow) => r.trading === true || r.tradingViaApi === true;
  return {
    total: rows.length,
    enabled: rows.filter((r) => r.enabled !== false).length,
    tradable: rows.filter(tradableRow).length,
    inMaintenance: rows.filter((r) => r.maintenance === true).length,
    fieldsSeen: [...seen].sort(),
    fieldsUnmapped: [...seen].filter((k) => !(k in BROKER_FIELDS)).sort(),
    // Tradable first, then alphabetical: the list is read to answer "who can I
    // trade through", and a broker that only reports holdings is not an answer
    // to that question.
    rows: rows.sort((a, b) => {
      const t = Number(tradableRow(b)) - Number(tradableRow(a));
      return t !== 0 ? t : a.name.localeCompare(b.name);
    })
  };
}

// ---------------------------------------------------------------------------
// Is this account safe to send an order to?
// ---------------------------------------------------------------------------
//
// An evaluation must never be the reason a real order reaches a real account.
// The only accounts this integration may trade are the ones whose own broker
// says they are simulated, and the test is on the institution's name because
// that is what SnapTrade exposes -- "Alpaca Paper" is a distinct institution in
// their portal, not a flag on a live one.
//
// Unknown is NOT paper. A name we cannot read is refused, which costs an
// evaluation nothing and is the only safe direction to be wrong in.

const PAPER = /\b(paper|practice|demo|sandbox|simulat)/i;

export function looksPaper(...names: (string | null | undefined)[]): boolean {
  return names.some((n) => !!n && PAPER.test(String(n)));
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export interface ProbeResult {
  name: string;
  need: string;
  method: string;
  path: string;
  ok: boolean;
  status: number;
  ms: number;
  error: string | null;
  sample: unknown;
  /** Rows returned, when the answer was a list. */
  count: number | null;
}

export interface Verdict {
  question: string;
  answer: string;
  /** "yes" | "no" | "partial" | "unknown" -- unknown means nothing proved it. */
  state: "yes" | "no" | "partial" | "unknown";
}

const found = (probes: ProbeResult[], name: string) => probes.find((p) => p.name === name) || null;

/**
 * The five questions, answered from what the probes actually returned rather
 * than from what the vendor's marketing says. A question nothing tested
 * answers "unknown" and says what would settle it -- an evaluation that
 * guesses is the thing this is replacing.
 */
export function verdicts(probes: ProbeResult[], matrix: BrokerMatrix | null): Verdict[] {
  const out: Verdict[] = [];

  out.push(
    matrix && matrix.total > 0
      ? {
          question: "How many brokers, and how many can place an order?",
          answer:
            `${matrix.total} brokerages listed, ${matrix.enabled} enabled, ${matrix.tradable} able to trade ` +
            `through their API${matrix.inMaintenance ? `, ${matrix.inMaintenance} in maintenance right now` : ""}.`,
          state: matrix.tradable > 1 ? "yes" : matrix.total > 0 ? "partial" : "unknown"
        }
      : {
          question: "How many brokers, and how many can place an order?",
          answer: "The brokerage list did not come back, so reach is unproven.",
          state: "unknown"
        }
  );

  const options = found(probes, "option positions");
  out.push({
    question: "Are option positions returned as options, with strike, expiry and right?",
    answer: options
      ? options.ok
        ? options.count === 0
          ? "The endpoint answered, but this account holds no option positions, so the shape is still unproven. Connect an account holding one."
          : `The endpoint answered with ${options.count} position(s); the sample below shows the fields.`
        : `The endpoint refused: ${options.error}`
      : "Not reached — no account was connected, so nothing asked.",
    state: options?.ok && (options.count ?? 0) > 0 ? "yes" : options?.ok ? "partial" : "unknown"
  });

  const orders = found(probes, "orders (90 days)");
  out.push({
    question: "How far back does order history go?",
    answer:
      "Their documented ceiling is 90 days. This product's trade reconstruction walks an account's entire life, " +
      "so history older than that would have to come from somewhere else or be kept by us from the day a user connects." +
      (orders?.ok ? ` The endpoint answered with ${orders.count} order(s).` : ""),
    state: "partial"
  });

  const mleg = found(probes, "multi-leg order placement");
  out.push({
    question: "Can a spread be placed as one multi-leg order?",
    answer: mleg
      ? mleg.ok
        ? "The endpoint accepted a preview."
        : `Not proven: ${mleg.error}`
      : "Not reached. It needs a connected paper account at a broker whose matrix row allows options, and placement stays " +
        "refused on anything that is not plainly a paper account.",
    state: mleg?.ok ? "yes" : "unknown"
  });

  out.push({
    question: "Do they replace the market data this product runs on?",
    answer:
      "No, and this one is not close. The scanner needs full option chains, the daily equity line needs historical " +
      "daily bars, and the tickets need streaming quotes. Their quote endpoints are per-account last prices. " +
      "A broker data feed is needed whatever happens here.",
    state: "no"
  });

  return out;
}
