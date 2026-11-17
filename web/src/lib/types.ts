export type Num = number | null;
export type Dict<T> = Record<string, T>;

export interface Snapshot {
  last_date?: string;
  price?: Num;
  prev_close?: Num;
  change?: Num;
  high_52w?: Num;
  low_52w?: Num;
  ma50?: Num;
  ma200?: Num;
  avg_volume_3m?: Num;
  avg_traded_value_3m?: Num;
  dps_ttm?: Num;
  history_start?: string;
  history_years?: Num;
}

export interface Valuation {
  market_cap: Num;
  market_cap_source: string;
  enterprise_value: Num;
  pe: Num;
  pe_basis: string | null;
  pe_note?: string;
  pb: Num;
  pb_basis: string | null;
  ps: Num;
  ps_basis: string | null;
  ev_ebitda: Num;
  ev_ebitda_basis: string | null;
  dividend_yield: Num;
  dividend_yield_basis: string;
  revenue_ttm: Num;
  net_income_ttm: Num;
  ebitda_ttm: Num;
  ttm_available: boolean;
  yahoo_trailing_pe: Num;
  yahoo_price_to_book: Num;
  beta_yahoo: Num;
}

export interface Risk {
  vol_1Y: Num; vol_3Y: Num; vol_5Y: Num;
  sharpe_3Y: Num; sortino_3Y: Num; sharpe_1Y: Num; sortino_1Y: Num;
  max_drawdown: Num; mdd_peak: string | null; mdd_trough: string | null;
  max_drawdown_5Y: Num; current_drawdown: Num; beta_3Y: Num; corr_3Y: Num;
}

export type Returns = Partial<Record<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "10Y", Num>>;

export interface UniverseRow {
  symbol: string;
  name: string;
  sector: string;
  industry: string | null;
  is_financial: boolean;
  snapshot: Snapshot;
  valuation: Valuation;
  returns: Returns;
  cagr: Dict<Num>;
  risk: Risk;
  calendar: Dict<Num>;
  latest_fy: string | null;
  fundamentals: Dict<Num>;
  fundamentals_fy: Dict<string | null>;
  revenue_cagr: Num;
  revenue_cagr_span: string | null;
  kpis: Dict<Num | string>;
  kpi_hist: Dict<Dict<number>>;   // kpi id → FY → value
  fund_hist: Dict<Dict<number>>;  // field → FY → INR
  coverage: Num;
  insight_count: number;
}

export interface KpiDef {
  id: string;
  name: string;
  group: string;
  formula: string;
  inputs: string[];
  unit: "pct" | "x" | "days" | "inr" | "inr_ps";
  better: "higher" | "lower" | null;
  significance: string;
  basis: string;
  financials: boolean;
}

export interface KpiSeries {
  values: Dict<number>;
  na: Dict<string>;
}

export interface StatementRow {
  key: string;
  label: string;
  monetary: boolean;
  values: Num[];
  source: string | null;
}
export interface Statement {
  periods: string[];
  ends: string[];
  rows: StatementRow[];
}

export interface Evidence { label: string; value: Num; unit: string }
export interface Insight {
  symbol: string;
  rule: string;
  category: string;
  tone: "positive" | "negative" | "neutral";
  title: string;
  fact: string;
  interpretation: string | null;
  evidence: Evidence[];
  period: string;
  threshold: string | null;
  weight: number;
}

export interface Company {
  symbol: string;
  yahoo: string;
  name: string;
  sector: string;
  isin: string;
  industry: string | null;
  yahoo_sector: string | null;
  is_financial: boolean;
  profile: Dict<string | number | null>;
  snapshot: Snapshot;
  valuation: Valuation;
  market: {
    returns?: Returns;
    cagr?: Dict<Num>;
    risk?: Risk;
    calendar?: Dict<Num>;
    monthly?: Dict<Num>;
    drawdown_weekly?: { d: string[]; v: number[] };
  };
  annual: { label: string; end: string; values: Dict<Num> }[];
  kpis: Dict<KpiSeries>;
  quarterly_metrics: { label: string; end: string; net_margin: Num; ebitda_margin: Num; revenue_yoy: Num }[];
  statements: Record<"annual" | "quarterly", Record<"income" | "balance" | "cashflow", Statement>>;
  raw_statements: Dict<{ periods: string[]; rows: { item: string; values: Num[] }[] }>;
  coverage: Coverage;
  financial_currency: string;
  data_notes: string[];
  insights: Insight[];
}

export interface Coverage {
  symbol?: string;
  name?: string;
  sector?: string;
  is_financial?: boolean;
  annual_periods: string[];
  quarterly_periods: string[];
  fields: Dict<number>;
  kpis: Dict<number>;
  kpi_completeness: Num;
  price_rows: number;
  price_start: string | null;
  price_end: string | null;
  ttm_available: boolean;
  retrieved: Dict<string>;
}

export interface Prices {
  d: string[];
  o: Num[];
  h: Num[];
  l: Num[];
  c: Num[];
  a: Num[];
  v: Num[];
}

export interface IndexData {
  ticker: string;
  name: string;
  snapshot: Snapshot;
  returns: Returns;
  cagr: Dict<Num>;
  risk: Risk;
  calendar: Dict<Num>;
  monthly: Dict<Num>;
  basis: string;
}

export interface Sector {
  sector: string;
  count: number;
  symbols: string[];
  market_cap: number;
  weighted_returns: Dict<Num>;
  medians: Dict<Num>;
}

export interface Meta {
  product: string;
  generated_at: string;
  source: string;
  disclaimer: string;
  universe: { source?: string; retrieved_at?: string; count?: number; stale?: boolean };
  companies: number;
  price_as_of: string;
  price_as_of_min: string;
  fetch: { finished_at?: string; seconds?: number; failures?: Dict<string> };
  risk_free_rate: number;
  units: string;
  conventions: Dict<string>;
}

export interface ValidationCheck {
  symbol: string;
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface UniverseInsight {
  title: string;
  tone: "positive" | "negative" | "neutral";
  fact: string;
  evidence: Evidence[];
}
