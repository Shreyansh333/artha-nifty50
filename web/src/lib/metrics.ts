import type { KpiDef, Num, UniverseRow } from "./types";
import { isNum } from "./format";

/** Value of a KPI for a fiscal year ("latest" → most recent FY reported for that KPI). */
export function kpiAt(r: UniverseRow, id: string, fy: string): { v: Num; fy: string | null } {
  const h = r.kpi_hist?.[id];
  if (!h) return { v: null, fy: null };
  if (fy === "latest") {
    const keys = Object.keys(h).sort();
    const k = keys[keys.length - 1];
    return k ? { v: h[k], fy: k } : { v: null, fy: null };
  }
  return isNum(h[fy]) ? { v: h[fy], fy } : { v: null, fy: null };
}

export function fundAt(r: UniverseRow, field: string, fy: string): { v: Num; fy: string | null } {
  const h = r.fund_hist?.[field];
  if (!h) return { v: null, fy: null };
  if (fy === "latest") {
    const keys = Object.keys(h).sort();
    const k = keys[keys.length - 1];
    return k ? { v: h[k], fy: k } : { v: null, fy: null };
  }
  return isNum(h[fy]) ? { v: h[fy], fy } : { v: null, fy: null };
}

export interface Metric {
  id: string;
  label: string;
  short?: string;
  group: string;
  unit: "pct" | "x" | "days" | "inr" | "inr_ps" | "n";
  better: "higher" | "lower" | null;
  /** fiscal-year dependent? (otherwise a current/market snapshot) */
  fyDependent: boolean;
  basis: string;
  get: (r: UniverseRow, fy: string) => Num;
}

const RET_WINDOWS = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y"] as const;

export function buildMetrics(dict: KpiDef[]): Metric[] {
  const kpi: Metric[] = dict.map((k) => ({
    id: k.id, label: k.name, group: k.group, unit: k.unit, better: k.better, fyDependent: true, basis: k.basis,
    get: (r, fy) => kpiAt(r, k.id, fy).v,
  }));
  const fund: Metric[] = [
    ["revenue", "Revenue"], ["ebitda", "EBITDA"], ["net_income", "Net Income"], ["total_assets", "Total Assets"],
    ["equity", "Shareholders' Equity"], ["total_debt", "Total Debt"], ["operating_cf", "Operating Cash Flow"],
  ].map(([id, label]) => ({
    id: `f_${id}`, label, group: "Fundamentals", unit: "inr" as const, better: null, fyDependent: true,
    basis: "Annual, as reported", get: (r: UniverseRow, fy: string) => fundAt(r, id, fy).v,
  }));
  const val: Metric[] = [
    { id: "market_cap", label: "Market Cap", group: "Valuation (current)", unit: "inr", better: null, fyDependent: false, basis: "Latest quote", get: (r) => r.valuation.market_cap },
    { id: "pe_now", label: "P/E (current)", short: "P/E", group: "Valuation (current)", unit: "x", better: null, fyDependent: false, basis: "Market cap ÷ TTM net income (or latest FY)", get: (r) => r.valuation.pe },
    { id: "pb_now", label: "P/B (current)", short: "P/B", group: "Valuation (current)", unit: "x", better: null, fyDependent: false, basis: "Market cap ÷ latest equity", get: (r) => r.valuation.pb },
    { id: "ps_now", label: "P/S (current)", short: "P/S", group: "Valuation (current)", unit: "x", better: null, fyDependent: false, basis: "Market cap ÷ TTM revenue", get: (r) => r.valuation.ps },
    { id: "ev_ebitda_now", label: "EV/EBITDA (current)", short: "EV/EBITDA", group: "Valuation (current)", unit: "x", better: null, fyDependent: false, basis: "EV ÷ TTM EBITDA", get: (r) => r.valuation.ev_ebitda },
    { id: "div_yield_now", label: "Dividend Yield (TTM)", short: "Div. yield", group: "Valuation (current)", unit: "pct", better: "higher", fyDependent: false, basis: "DPS last 365d ÷ price", get: (r) => r.valuation.dividend_yield },
    { id: "rev_cagr", label: "Revenue CAGR (available FYs)", group: "Growth", unit: "pct", better: "higher", fyDependent: false, basis: "First → latest reported fiscal year", get: (r) => r.revenue_cagr },
  ];
  const mkt: Metric[] = [
    ...RET_WINDOWS.map((w) => ({
      id: `ret_${w}`, label: `Return ${w}`, group: "Market Performance", unit: "pct" as const, better: "higher" as const, fyDependent: false,
      basis: "Total return (adjusted close)", get: (r: UniverseRow) => r.returns[w] ?? null,
    })),
    ...["3Y", "5Y", "10Y"].map((w) => ({
      id: `cagr_${w}`, label: `CAGR ${w}`, group: "Market Performance", unit: "pct" as const, better: "higher" as const, fyDependent: false,
      basis: "Annualised total return", get: (r: UniverseRow) => r.cagr[w] ?? null,
    })),
    { id: "vol_1Y", label: "Volatility 1Y", group: "Risk", unit: "pct", better: "lower", fyDependent: false, basis: "Annualised σ of daily log returns", get: (r) => r.risk.vol_1Y },
    { id: "vol_3Y", label: "Volatility 3Y", group: "Risk", unit: "pct", better: "lower", fyDependent: false, basis: "Annualised σ of daily log returns", get: (r) => r.risk.vol_3Y },
    { id: "sharpe_3Y", label: "Sharpe 3Y", group: "Risk", unit: "x", better: "higher", fyDependent: false, basis: "(CAGR − Rf) ÷ σ", get: (r) => r.risk.sharpe_3Y },
    { id: "sortino_3Y", label: "Sortino 3Y", group: "Risk", unit: "x", better: "higher", fyDependent: false, basis: "(CAGR − Rf) ÷ downside σ", get: (r) => r.risk.sortino_3Y },
    { id: "beta_3Y", label: "Beta vs NIFTY 50 (3Y)", short: "Beta", group: "Risk", unit: "x", better: null, fyDependent: false, basis: "Cov(r, r_index) ÷ Var(r_index), daily", get: (r) => r.risk.beta_3Y },
    { id: "max_dd", label: "Max Drawdown (all history)", group: "Risk", unit: "pct", better: "higher", fyDependent: false, basis: "Peak-to-trough, adjusted", get: (r) => r.risk.max_drawdown },
    { id: "max_dd_5Y", label: "Max Drawdown 5Y", group: "Risk", unit: "pct", better: "higher", fyDependent: false, basis: "Peak-to-trough within 5Y", get: (r) => r.risk.max_drawdown_5Y },
    { id: "cur_dd", label: "Drawdown from ATH", group: "Risk", unit: "pct", better: "higher", fyDependent: false, basis: "Price vs all-time high", get: (r) => r.risk.current_drawdown },
  ];
  return [...val, ...kpi, ...fund, ...mkt];
}

export function metricOptions(ms: Metric[]) {
  return ms.map((m) => ({ value: m.id, label: m.label, group: m.group }));
}

export function median(xs: Num[]): Num {
  const v = xs.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function percentileRank(xs: Num[], x: Num): Num {
  const v = xs.filter(isNum);
  if (!isNum(x) || v.length < 2) return null;
  const below = v.filter((y) => y < x).length, equal = v.filter((y) => y === x).length;
  return (below + 0.5 * equal) / v.length;
}

export function filterBySector<T extends { sector: string }>(rows: T[], sectors: string[]): T[] {
  return sectors.length ? rows.filter((r) => sectors.includes(r.sector)) : rows;
}
