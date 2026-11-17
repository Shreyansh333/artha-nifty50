"""Reusable financial KPI engine.

Every KPI is declared once in REGISTRY with its formula, inputs, reporting basis, unit,
direction and financial significance. `compute_series` evaluates a KPI for every fiscal
period and returns either a value or an explicit reason code — a KPI is NEVER silently
set to 0 when an input is missing or a denominator is invalid.

Reporting basis
---------------
* All statement-based KPIs use ANNUAL figures and PERIOD-END balance-sheet values
  (the same convention as the reference workbook). Average-balance variants are not used
  because Yahoo exposes only ~4-5 balance sheets and averaging would drop the oldest year.
* Valuation multiples per fiscal year use the market capitalisation at fiscal-year end
  (un-split-adjusted close on/before the period end × shares outstanding on that balance sheet),
  so per-share restatements cannot distort them.
* Current ("snapshot") valuation uses trailing-twelve-month flows — see build.snapshot_valuation.

Reason codes
------------
missing:<field>         an input is unavailable from the source
na_financial            KPI not meaningful for banks / NBFCs / insurers
nonpositive_denominator denominator ≤ 0 (e.g. negative equity) → ratio not meaningful
negative_base           growth from a zero/negative base is not meaningful
negative_earnings       multiple undefined for loss-making periods
no_prior_period         growth needs the previous fiscal year
cogs_not_reported       gross profit equals revenue because cost of revenue is not reported
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

Num = Optional[float]
Result = tuple[Num, Optional[str]]


@dataclass
class KPI:
    id: str
    name: str
    group: str
    formula: str
    inputs: list[str]
    unit: str                 # pct | x | days | inr | inr_ps
    better: Optional[str]     # higher | lower | None
    significance: str
    fn: Callable[[dict, Optional[dict], bool], Result]
    basis: str = "Annual (fiscal year); balance-sheet items at period end"
    financials: bool = True   # applicable to financial-sector companies?
    excel: Optional[str] = None  # Excel formula template (see excel_workbook)
    extra: dict = field(default_factory=dict)


# ------------------------------------------------------------------ helpers
def _get(d: Optional[dict], k: str):
    return None if d is None else d.get(k)


def div(cur: dict, a: str, b: str, *, abs_num: bool = False, pos_den: bool = True) -> Result:
    x, y = cur.get(a), cur.get(b)
    if x is None:
        return None, f"missing:{a}"
    if y is None:
        return None, f"missing:{b}"
    if pos_den and y <= 0:
        return None, "nonpositive_denominator"
    if y == 0:
        return None, "nonpositive_denominator"
    return (abs(x) if abs_num else x) / y, None


def growth(cur: dict, prev: Optional[dict], k: str) -> Result:
    if prev is None:
        return None, "no_prior_period"
    x, p = cur.get(k), prev.get(k)
    if x is None:
        return None, f"missing:{k}"
    if p is None:
        return None, f"missing:{k} (prior year)"
    if p <= 0:
        return None, "negative_base"
    return x / p - 1, None


def na_fin(fn):
    def wrapped(cur, prev, is_fin):
        if is_fin:
            return None, "na_financial"
        return fn(cur, prev, is_fin)
    return wrapped


def gross_margin(cur, prev, is_fin) -> Result:
    gp, rev, cogs = cur.get("gross_profit"), cur.get("revenue"), cur.get("cost_of_revenue")
    if rev is not None and gp is not None and (cogs is None or cogs == 0) and abs(gp - rev) < 1:
        return None, "cogs_not_reported"
    return div(cur, "gross_profit", "revenue")


def roce(cur, prev, is_fin) -> Result:
    ebit, ta, cl = cur.get("ebit"), cur.get("total_assets"), cur.get("current_liabilities")
    for k, v in (("ebit", ebit), ("total_assets", ta), ("current_liabilities", cl)):
        if v is None:
            return None, f"missing:{k}"
    ce = ta - cl
    if ce <= 0:
        return None, "nonpositive_denominator"
    return ebit / ce, None


def quick_ratio(cur, prev, is_fin) -> Result:
    ca, inv, cl = cur.get("current_assets"), cur.get("inventory"), cur.get("current_liabilities")
    for k, v in (("current_assets", ca), ("inventory", inv), ("current_liabilities", cl)):
        if v is None:
            return None, f"missing:{k}"
    if cl <= 0:
        return None, "nonpositive_denominator"
    return (ca - inv) / cl, None


def interest_coverage(cur, prev, is_fin) -> Result:
    ebit, ie = cur.get("ebit"), cur.get("interest_expense")
    if ebit is None:
        return None, "missing:ebit"
    if ie is None:
        return None, "missing:interest_expense"
    if ie <= 0:
        return None, "nonpositive_denominator"
    return ebit / ie, None


def net_debt_ebitda(cur, prev, is_fin) -> Result:
    d, c, e = cur.get("total_debt"), cur.get("cash_and_sti"), cur.get("ebitda")
    for k, v in (("total_debt", d), ("cash_and_sti", c), ("ebitda", e)):
        if v is None:
            return None, f"missing:{k}"
    if e <= 0:
        return None, "nonpositive_denominator"
    return (d - c) / e, None


def inventory_turnover(cur, prev, is_fin) -> Result:
    return div(cur, "cost_of_revenue", "inventory")


def debtor_days(cur, prev, is_fin) -> Result:
    v, r = div(cur, "receivables", "revenue")
    return (None, r) if v is None else (v * 365, None)


def fcf(cur, prev, is_fin) -> Result:
    o, c = cur.get("operating_cf"), cur.get("capex")
    if o is None:
        return None, "missing:operating_cf"
    if c is None:
        return None, "missing:capex"
    return o - abs(c), None


def fcf_margin(cur, prev, is_fin) -> Result:
    f, r = fcf(cur, prev, is_fin)
    if f is None:
        return None, r
    rev = cur.get("revenue")
    if rev is None:
        return None, "missing:revenue"
    if rev <= 0:
        return None, "nonpositive_denominator"
    return f / rev, None


def cash_conversion(cur, prev, is_fin) -> Result:
    o, ni = cur.get("operating_cf"), cur.get("net_income")
    if o is None:
        return None, "missing:operating_cf"
    if ni is None:
        return None, "missing:net_income"
    if ni <= 0:
        return None, "negative_earnings"
    return o / ni, None


def payout(cur, prev, is_fin) -> Result:
    dv, ni = cur.get("dividends_paid"), cur.get("net_income")
    if dv is None:
        return None, "missing:dividends_paid"
    if ni is None:
        return None, "missing:net_income"
    if ni <= 0:
        return None, "negative_earnings"
    return abs(dv) / ni, None


def pe(cur, prev, is_fin) -> Result:
    m, ni = cur.get("market_cap_fy"), cur.get("net_income")
    if m is None:
        return None, "missing:market_cap_fy"
    if ni is None:
        return None, "missing:net_income"
    if ni <= 0:
        return None, "negative_earnings"
    return m / ni, None


def ev_ebitda(cur, prev, is_fin) -> Result:
    m, d, c, e = (cur.get(k) for k in ("market_cap_fy", "total_debt", "cash_and_sti", "ebitda"))
    for k, v in (("market_cap_fy", m), ("total_debt", d), ("cash_and_sti", c), ("ebitda", e)):
        if v is None:
            return None, f"missing:{k}"
    if e <= 0:
        return None, "nonpositive_denominator"
    return (m + d - c) / e, None


def bvps(cur, prev, is_fin) -> Result:
    return div(cur, "equity", "shares_outstanding", pos_den=True)


def eps(cur, prev, is_fin) -> Result:
    v = cur.get("eps_diluted")
    if v is None:
        v = cur.get("eps_basic")
    return (v, None) if v is not None else (None, "missing:eps_diluted")


def raw(k):
    def f(cur, prev, is_fin):
        v = cur.get(k)
        return (v, None) if v is not None else (None, f"missing:{k}")
    return f


REGISTRY: list[KPI] = [
    # ---------------- Growth
    KPI("revenue_growth", "Revenue Growth", "Growth", "Revenueₜ / Revenueₜ₋₁ − 1", ["revenue"], "pct", "higher",
        "Pace of top-line expansion; the primary driver of long-run earnings growth.",
        lambda c, p, f: growth(c, p, "revenue")),
    KPI("ebitda_growth", "EBITDA Growth", "Growth", "EBITDAₜ / EBITDAₜ₋₁ − 1", ["ebitda"], "pct", "higher",
        "Growth in operating cash earnings before capital structure and depreciation choices.",
        na_fin(lambda c, p, f: growth(c, p, "ebitda")), financials=False),
    KPI("net_income_growth", "Net Profit Growth", "Growth", "Net Incomeₜ / Net Incomeₜ₋₁ − 1", ["net_income"], "pct", "higher",
        "Growth in profit attributable to shareholders; not meaningful from a loss-making base.",
        lambda c, p, f: growth(c, p, "net_income")),
    KPI("eps_growth", "EPS Growth", "Growth", "Diluted EPSₜ / Diluted EPSₜ₋₁ − 1", ["eps_diluted"], "pct", "higher",
        "Per-share earnings growth — captures dilution from new share issuance that net-profit growth hides.",
        lambda c, p, f: growth(c, p, "eps_diluted")),
    # ---------------- Profitability
    KPI("gross_margin", "Gross Margin", "Profitability", "Gross Profit / Revenue", ["gross_profit", "revenue", "cost_of_revenue"],
        "pct", "higher", "Pricing power and direct-cost efficiency. Withheld when cost of revenue is not reported "
        "(a 100% 'gross margin' would be an artefact, not economics).", na_fin(gross_margin), financials=False),
    KPI("ebitda_margin", "EBITDA Margin", "Profitability", "EBITDA / Revenue", ["ebitda", "revenue"], "pct", "higher",
        "Operating profitability before depreciation, interest and tax; comparable across capital structures.",
        na_fin(lambda c, p, f: div(c, "ebitda", "revenue")), financials=False),
    KPI("ebit_margin", "EBIT (Operating) Margin", "Profitability", "EBIT / Revenue", ["ebit", "revenue"], "pct", "higher",
        "Profitability after depreciation — reflects capital intensity of the business model.",
        na_fin(lambda c, p, f: div(c, "ebit", "revenue")), financials=False),
    KPI("net_margin", "Net Profit Margin", "Profitability", "Net Income / Revenue", ["net_income", "revenue"], "pct", "higher",
        "Share of every rupee of revenue retained as shareholder profit after all costs.",
        lambda c, p, f: div(c, "net_income", "revenue")),
    KPI("roe", "Return on Equity", "Profitability", "Net Income / Shareholders' Equity (period end)", ["net_income", "equity"],
        "pct", "higher", "Return generated on shareholders' capital; the core measure of value creation for equity holders.",
        lambda c, p, f: div(c, "net_income", "equity")),
    KPI("roa", "Return on Assets", "Profitability", "Net Income / Total Assets (period end)", ["net_income", "total_assets"],
        "pct", "higher", "Profit generated per rupee of assets; the key profitability lens for banks and lenders.",
        lambda c, p, f: div(c, "net_income", "total_assets")),
    KPI("roce", "Return on Capital Employed", "Profitability", "EBIT / (Total Assets − Current Liabilities)",
        ["ebit", "total_assets", "current_liabilities"], "pct", "higher",
        "Pre-tax operating return on all long-term capital (debt + equity); compare against cost of capital.",
        na_fin(roce), financials=False),
    # ---------------- Liquidity
    KPI("current_ratio", "Current Ratio", "Liquidity", "Current Assets / Current Liabilities",
        ["current_assets", "current_liabilities"], "x", "higher",
        "Short-term solvency: ability to meet obligations due within a year from short-term assets.",
        na_fin(lambda c, p, f: div(c, "current_assets", "current_liabilities")), financials=False),
    KPI("quick_ratio", "Quick Ratio", "Liquidity", "(Current Assets − Inventory) / Current Liabilities",
        ["current_assets", "inventory", "current_liabilities"], "x", "higher",
        "Stricter liquidity test that excludes inventory, which may not convert to cash quickly.",
        na_fin(quick_ratio), financials=False),
    KPI("cash_ratio", "Cash Ratio", "Liquidity", "(Cash + Short-term Investments) / Current Liabilities",
        ["cash_and_sti", "current_liabilities"], "x", "higher",
        "Most conservative liquidity measure — obligations coverable from cash on hand.",
        na_fin(lambda c, p, f: div(c, "cash_and_sti", "current_liabilities")), financials=False),
    # ---------------- Solvency
    KPI("debt_to_equity", "Debt to Equity", "Solvency", "Total Debt / Shareholders' Equity", ["total_debt", "equity"],
        "x", "lower", "Financial leverage. For lenders, Yahoo's 'Total Debt' covers borrowings, not deposits — compare banks only with banks.",
        lambda c, p, f: div(c, "total_debt", "equity")),
    KPI("debt_to_assets", "Debt to Assets", "Solvency", "Total Debt / Total Assets", ["total_debt", "total_assets"],
        "pct", "lower", "Share of the asset base funded by borrowings.",
        lambda c, p, f: div(c, "total_debt", "total_assets")),
    KPI("interest_coverage", "Interest Coverage", "Solvency", "EBIT / Interest Expense", ["ebit", "interest_expense"],
        "x", "higher", "Times operating profit covers interest; below ~1.5× signals debt-service stress.",
        na_fin(interest_coverage), financials=False),
    KPI("net_debt_ebitda", "Net Debt / EBITDA", "Solvency", "(Total Debt − Cash & ST Investments) / EBITDA",
        ["total_debt", "cash_and_sti", "ebitda"], "x", "lower",
        "Years of operating cash earnings needed to repay net debt; negative means net cash.",
        na_fin(net_debt_ebitda), financials=False),
    # ---------------- Efficiency
    KPI("asset_turnover", "Asset Turnover", "Efficiency", "Revenue / Total Assets (period end)", ["revenue", "total_assets"],
        "x", "higher", "Revenue generated per rupee of assets; links margins to ROA (DuPont).",
        lambda c, p, f: div(c, "revenue", "total_assets")),
    KPI("inventory_turnover", "Inventory Turnover", "Efficiency", "Cost of Revenue / Inventory", ["cost_of_revenue", "inventory"],
        "x", "higher", "How many times inventory is sold and replaced in a year; only for inventory-holding businesses.",
        na_fin(inventory_turnover), financials=False),
    KPI("receivables_turnover", "Receivables Turnover", "Efficiency", "Revenue / Receivables", ["revenue", "receivables"],
        "x", "higher", "Speed of cash collection from customers.",
        na_fin(lambda c, p, f: div(c, "revenue", "receivables")), financials=False),
    KPI("debtor_days", "Debtor Days", "Efficiency", "Receivables / Revenue × 365", ["receivables", "revenue"],
        "days", "lower", "Average collection period in days.", na_fin(debtor_days), financials=False),
    # ---------------- Cash flow
    KPI("operating_cf", "Operating Cash Flow", "Cash Flow", "Cash generated from operations (as reported)", ["operating_cf"],
        "inr", "higher", "Cash actually generated by the business — harder to manage than accounting profit.", raw("operating_cf")),
    KPI("fcf", "Free Cash Flow", "Cash Flow", "Operating Cash Flow − |Capital Expenditure|", ["operating_cf", "capex"],
        "inr", "higher", "Cash available to repay debt, pay dividends or reinvest after maintaining the asset base.", fcf),
    KPI("cash_conversion", "Cash Conversion (CFO / Net Income)", "Cash Flow", "Operating Cash Flow / Net Income",
        ["operating_cf", "net_income"], "x", "higher",
        "Earnings quality: persistently below 1× means profits are not turning into cash. Lenders' CFO is distorted by loan growth.",
        cash_conversion),
    KPI("fcf_margin", "FCF Margin", "Cash Flow", "Free Cash Flow / Revenue", ["operating_cf", "capex", "revenue"],
        "pct", "higher", "Share of revenue converted to free cash.", fcf_margin),
    KPI("capex_intensity", "Capex Intensity", "Cash Flow", "|Capital Expenditure| / Revenue", ["capex", "revenue"],
        "pct", None, "Reinvestment rate; high values indicate a capital-intensive or expansion phase.",
        lambda c, p, f: div(c, "capex", "revenue", abs_num=True)),
    KPI("dividend_payout", "Dividend Payout", "Cash Flow", "|Dividends Paid| / Net Income", ["dividends_paid", "net_income"],
        "pct", None, "Share of profit returned to shareholders as cash dividends.", payout),
    # ---------------- Valuation (fiscal-year end)
    KPI("eps", "EPS (Diluted)", "Valuation", "Diluted EPS as reported", ["eps_diluted"], "inr_ps", "higher",
        "Profit per share — as reported for that year (not restated for later splits/bonuses).", eps),
    KPI("bvps", "Book Value per Share", "Valuation", "Shareholders' Equity / Shares Outstanding",
        ["equity", "shares_outstanding"], "inr_ps", "higher", "Accounting net worth per share.", bvps),
    KPI("pe", "Price / Earnings", "Valuation", "Market Cap at FY end / Net Income", ["market_cap_fy", "net_income"],
        "x", None, "Rupees paid per rupee of annual profit. Computed on aggregates, so immune to share-count restatements.", pe,
        basis="Fiscal-year end market cap ÷ that year's net income"),
    KPI("pb", "Price / Book", "Valuation", "Market Cap at FY end / Shareholders' Equity", ["market_cap_fy", "equity"],
        "x", None, "Premium to accounting net worth; the anchor multiple for banks.",
        lambda c, p, f: div(c, "market_cap_fy", "equity"), basis="Fiscal-year end market cap ÷ period-end equity"),
    KPI("ps", "Price / Sales", "Valuation", "Market Cap at FY end / Revenue", ["market_cap_fy", "revenue"],
        "x", None, "Valuation relative to revenue; useful when earnings are depressed or negative.",
        lambda c, p, f: div(c, "market_cap_fy", "revenue"), basis="Fiscal-year end market cap ÷ that year's revenue"),
    KPI("ev_ebitda", "EV / EBITDA", "Valuation", "(Market Cap + Total Debt − Cash & ST Inv.) / EBITDA",
        ["market_cap_fy", "total_debt", "cash_and_sti", "ebitda"], "x", None,
        "Capital-structure-neutral valuation of operating earnings.", na_fin(ev_ebitda), financials=False,
        basis="Fiscal-year end enterprise value ÷ that year's EBITDA"),
    KPI("dividend_yield", "Dividend Yield", "Valuation", "|Dividends Paid| / Market Cap at FY end",
        ["dividends_paid", "market_cap_fy"], "pct", "higher", "Cash return to shareholders relative to the price paid.",
        lambda c, p, f: div(c, "dividends_paid", "market_cap_fy", abs_num=True),
        basis="Dividends paid in the fiscal year ÷ fiscal-year end market cap"),
]

BY_ID = {k.id: k for k in REGISTRY}
GROUPS = ["Growth", "Profitability", "Liquidity", "Solvency", "Efficiency", "Cash Flow", "Valuation"]


def consecutive_years(a: dict, b: dict) -> bool:
    """True if period b ends 330–400 days after period a (requires 'end' ISO dates)."""
    from datetime import date
    if not a.get("end") or not b.get("end"):
        return False
    gap = (date.fromisoformat(b["end"]) - date.fromisoformat(a["end"])).days
    return 330 <= gap <= 400


def compute_series(periods: list[dict], is_financial: bool) -> dict:
    """periods: list of {"label":..., "values": {...}} oldest→newest.

    Returns {kpi_id: {"values": {label: v}, "na": {label: reason}}}.
    """
    out = {}
    for k in REGISTRY:
        vals, na = {}, {}
        for i, p in enumerate(periods):
            prev = periods[i - 1]["values"] if i > 0 else None
            # growth must compare consecutive 12-month fiscal years only (period ends 330–400 days apart)
            if prev is not None and not consecutive_years(periods[i - 1], p):
                prev = None
            v, reason = k.fn(p["values"], prev, is_financial)
            if v is not None:
                vals[p["label"]] = round(v, 6)
            else:
                na[p["label"]] = reason
        out[k.id] = {"values": vals, "na": na}
    return out


def dictionary() -> list[dict]:
    return [
        {"id": k.id, "name": k.name, "group": k.group, "formula": k.formula, "inputs": k.inputs, "unit": k.unit,
         "better": k.better, "significance": k.significance, "basis": k.basis, "financials": k.financials}
        for k in REGISTRY
    ]
