export const fmtMoney = (v) =>
  v === null || v === undefined || isNaN(v)
    ? "—"
    : v.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const fmtPct = (v) =>
  v === null || v === undefined || isNaN(v) ? "—" : `${(v * 100).toFixed(2)}%`;