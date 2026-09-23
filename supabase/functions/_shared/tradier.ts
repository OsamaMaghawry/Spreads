// Tradier: the client, and the translation between this product's order
// vocabulary and theirs.
//
// WHY TRADIER IS NEXT. `docs/product/broker-apis.md` has the reasoning. The
// short of it: they are the only broker besides the one we already speak to
// where PAPER AND LIVE ARE THE SAME API. Everything in this codebase is
// verified on paper before it touches real money, and a broker that cannot be
// tested that way cannot be built here with a straight face.
//
// THREE THINGS ABOUT THEIR API THAT WILL BITE, and all three are handled by
// pure functions below so they are testable without a credential:
//
//   1. THE PRICE SIGN IS INVERTED FROM OURS. We carry a net credit as a
//      NEGATIVE limit price, which is the multi-leg convention the rest of
//      this product is built on. Tradier takes an always-positive `price`
//      and a separate `type` of credit, debit or even. Getting this backwards
//      does not error -- it places the opposite order at a plausible price.
//
//   2. ORDERS ARE FORM-ENCODED, not JSON, and multi-leg legs are indexed
//      parameters (`option_symbol[0]`, `side[0]`, `quantity[0]`).
//
//   3. RESPONSES COLLAPSE A SINGLE-ELEMENT ARRAY INTO AN OBJECT. One position
//      arrives as an object; two arrive as an array. Code that assumes an
//      array silently sees nothing on an account holding exactly one thing,
//      which is the account most likely to be someone's first.
//
// And one thing about intent: their `side` carries open-or-close
// (`sell_to_open`, `buy_to_close`), where ours carries only buy-or-sell and
// the caller knows which way it is going. So `intent` is required rather than
// guessed -- a wrong guess closes a position the user meant to open.

const SANDBOX = "https://sandbox.tradier.com/v1";
const LIVE = "https://api.tradier.com/v1";

export function tradierBase(isPaper: boolean): string {
  return isPaper ? SANDBOX : LIVE;
}

/**
 * Their single-element collapse, undone.
 *
 * `{ positions: { position: {...} } }` on one holding and
 * `{ positions: { position: [ {...}, {...} ] } }` on two. Always a list here.
 * `null`, the string "null" -- which they really do send for an empty
 * collection -- and a missing key all come back as an empty list.
 */
export function oneOrMany<T = unknown>(value: unknown): T[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [];
  if (Array.isArray(value)) return value as T[];
  return [value as T];
}

/**
 * Reach into their envelope and normalise the collection inside it.
 *
 * `unwrap(body, "positions", "position")` handles every shape they send for a
 * collection: the wrapper missing, the wrapper present but "null", one item,
 * or many.
 */
export function unwrap<T = unknown>(body: unknown, outer: string, inner: string): T[] {
  if (!body || typeof body !== "object") return [];
  const wrapper = (body as Record<string, unknown>)[outer];
  if (!wrapper || typeof wrapper !== "object") return [];
  return oneOrMany<T>((wrapper as Record<string, unknown>)[inner]);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type Intent = "open" | "close";
export type Side = "buy" | "sell";

export interface OrderLeg {
  /** OCC option symbol. */
  symbol: string;
  side: Side;
  /** Contracts per unit of the structure. A 1:1 vertical is 1 and 1. */
  ratio: number;
}

export interface TradierOrder {
  /** The underlying, which their API wants alongside the contracts. */
  ticker: string;
  legs: OrderLeg[];
  /** Units of the structure: 2 condors is 2, whatever the legs' ratios are. */
  qty: number;
  /**
   * OUR sign convention: negative is a net credit, positive a net debit.
   * Translated below, never passed through.
   */
  limitPrice: number | null;
  intent: Intent;
  tif?: "day" | "gtc" | "pre" | "post";
  /** True runs their validation and returns cost and margin without placing. */
  preview?: boolean;
}

/** Their side vocabulary, which carries the intent ours leaves to the caller. */
export function tradierSide(side: Side, intent: Intent): string {
  return `${side}_to_${intent}`;
}

const money = (n: number) => {
  // Their price field is a string and they reject more than two decimals on
  // most underlyings. Rounding here rather than at the call site keeps one
  // rule in one place.
  //
  // THE EPSILON IS NOT DECORATION. `Math.round(1.005 * 100)` is 100, not 101,
  // because 1.005 is really 1.00499999999999989 in binary floating point --
  // so a price lands a cent below what the trader typed, silently, on a money
  // field. Nudging past the representation error rounds half up as written.
  // Prices normally arrive already at the cent from a quote; this is for the
  // ones that do not.
  const rounded = Math.round(Math.abs(n) * 100 + 1e-9) / 100;
  return rounded.toFixed(2);
};

/**
 * Our order, as their form parameters.
 *
 * Returns a plain record so the caller can encode it and a test can read it.
 * Never returns a signed price: the sign becomes `type`.
 */
export function tradierOrderForm(order: TradierOrder): Record<string, string> {
  const legs = order.legs || [];
  if (!legs.length) throw new Error("A Tradier order needs at least one leg.");
  if (!order.ticker) throw new Error("A Tradier order needs its underlying symbol.");
  if (!Number.isFinite(order.qty) || order.qty <= 0) {
    throw new Error("A Tradier order needs a positive quantity.");
  }

  const duration = order.tif || "day";
  const form: Record<string, string> = {
    symbol: order.ticker,
    duration
  };
  if (order.preview) form.preview = "true";

  // A market order has no price and therefore no credit-or-debit to state.
  const priced = order.limitPrice !== null && order.limitPrice !== undefined && Number.isFinite(order.limitPrice);

  if (legs.length === 1) {
    // ONE LEG IS NOT MULTILEG on their side: a single option order is
    // `class=option` with a plain positive limit price, and `type=credit`
    // is not a thing there. Same distinction the Alpaca path already draws
    // between a plain order and an mleg.
    const leg = legs[0];
    form.class = "option";
    form.option_symbol = leg.symbol;
    form.side = tradierSide(leg.side, order.intent);
    form.quantity = String(Math.round(order.qty * (leg.ratio || 1)));
    form.type = priced ? "limit" : "market";
    if (priced) form.price = money(order.limitPrice as number);
    return form;
  }

  form.class = "multileg";
  // THE SIGN. Ours is negative for a credit; theirs is a positive number plus
  // a word. Zero is "even" rather than a credit of nothing, which they reject.
  form.type = !priced
    ? "market"
    : (order.limitPrice as number) < 0
      ? "credit"
      : (order.limitPrice as number) > 0
        ? "debit"
        : "even";
  if (priced && (order.limitPrice as number) !== 0) form.price = money(order.limitPrice as number);

  legs.forEach((leg, i) => {
    form[`option_symbol[${i}]`] = leg.symbol;
    form[`side[${i}]`] = tradierSide(leg.side, order.intent);
    form[`quantity[${i}]`] = String(Math.round(order.qty * (leg.ratio || 1)));
  });

  return form;
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface TradierResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  ms: number;
}

export interface TradierCall {
  /** Path after /v1, e.g. "/user/profile". */
  path: string;
  token: string;
  isPaper: boolean;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Form parameters for a POST. Their write endpoints are form-encoded. */
  form?: Record<string, string>;
  timeoutMs?: number;
}

export async function tradierFetch<T = unknown>(call: TradierCall): Promise<TradierResult<T>> {
  const started = Date.now();
  if (!call.token) {
    return { ok: false, status: 0, data: null, error: "No Tradier access token is configured.", ms: 0 };
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(call.query || {})) {
    if (v === null || v === undefined || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  const url = `${tradierBase(call.isPaper)}${call.path}${qs ? `?${qs}` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      method: call.method || "GET",
      headers: {
        Authorization: `Bearer ${call.token}`,
        // Without this they answer XML, which is their default and a
        // surprising amount of integration pain.
        Accept: "application/json",
        ...(call.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
      },
      body: call.form ? new URLSearchParams(call.form).toString() : undefined,
      signal: controller.signal
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const body = parsed as Record<string, any> | null;
      const detail =
        body?.errors?.error ||
        body?.fault?.faultstring ||
        body?.error ||
        (text ? text.slice(0, 300) : "");
      return {
        ok: false,
        status: res.status,
        data: (parsed as T) ?? null,
        error: String(Array.isArray(detail) ? detail.join("; ") : detail || `HTTP ${res.status}`),
        ms: Date.now() - started
      };
    }

    // THEY ANSWER 200 WITH AN ERROR BODY on a rejected order, which is the
    // one case where trusting the status code places nothing and reports
    // success. Checked here so every caller gets the same treatment.
    const body = parsed as Record<string, any> | null;
    if (body?.errors?.error) {
      const detail = body.errors.error;
      return {
        ok: false,
        status: res.status,
        data: (parsed as T) ?? null,
        error: String(Array.isArray(detail) ? detail.join("; ") : detail),
        ms: Date.now() - started
      };
    }

    return { ok: true, status: res.status, data: (parsed as T) ?? null, error: null, ms: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: e?.name === "AbortError" ? "timed out" : String(e?.message || e),
      ms: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}
