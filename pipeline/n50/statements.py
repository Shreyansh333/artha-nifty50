"""Map Yahoo statement line items to a canonical schema.

Each canonical field lists Yahoo row names in priority order. The first row that has a
numeric value for the period is used, and the chosen source row is recorded so every
number can be traced back. Missing values stay None — they are never replaced with 0.
All monetary values are in INR (absolute rupees, as Yahoo reports them for NSE listings).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import pandas as pd

INCOME = {
    "revenue": ["Total Revenue", "Operating Revenue"],
    "cost_of_revenue": ["Cost Of Revenue", "Reconciled Cost Of Revenue"],
    "gross_profit": ["Gross Profit"],
    "operating_expense": ["Operating Expense"],
    "operating_income": ["Operating Income"],
    "ebitda": ["EBITDA", "Normalized EBITDA"],
    "ebit": ["EBIT"],
    "depreciation": ["Reconciled Depreciation", "Depreciation And Amortization In Income Statement"],
    "interest_expense": ["Interest Expense", "Interest Expense Non Operating"],
    "interest_income": ["Interest Income"],
    "net_interest_income": ["Net Interest Income"],
    "pretax_income": ["Pretax Income"],
    "tax": ["Tax Provision"],
    "net_income": ["Net Income Common Stockholders", "Net Income", "Net Income From Continuing Operation Net Minority Interest"],
    "eps_basic": ["Basic EPS"],
    "eps_diluted": ["Diluted EPS"],
    "diluted_shares": ["Diluted Average Shares", "Basic Average Shares"],
}

BALANCE = {
    "total_assets": ["Total Assets"],
    "current_assets": ["Current Assets"],
    "cash": ["Cash And Cash Equivalents", "Cash Financial"],
    "cash_and_sti": ["Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents"],
    "receivables": ["Accounts Receivable", "Receivables"],
    "inventory": ["Inventory"],
    "net_ppe": ["Net PPE"],
    "goodwill_intangibles": ["Goodwill And Other Intangible Assets"],
    "investments": ["Investments And Advances", "Investmentin Financial Assets"],
    "total_liabilities": ["Total Liabilities Net Minority Interest"],
    "current_liabilities": ["Current Liabilities"],
    "payables": ["Accounts Payable", "Payables"],
    "total_debt": ["Total Debt"],
    "long_term_debt": ["Long Term Debt", "Long Term Debt And Capital Lease Obligation"],
    "current_debt": ["Current Debt", "Current Debt And Capital Lease Obligation"],
    "net_debt": ["Net Debt"],
    "equity": ["Stockholders Equity", "Common Stock Equity"],
    "minority_interest": ["Minority Interest"],
    "total_equity": ["Total Equity Gross Minority Interest"],
    "retained_earnings": ["Retained Earnings"],
    "shares_outstanding": ["Ordinary Shares Number", "Share Issued"],
    "working_capital": ["Working Capital"],
    "invested_capital": ["Invested Capital"],
}

CASHFLOW = {
    "operating_cf": ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"],
    "investing_cf": ["Investing Cash Flow", "Cash Flow From Continuing Investing Activities"],
    "financing_cf": ["Financing Cash Flow", "Cash Flow From Continuing Financing Activities"],
    "capex": ["Capital Expenditure", "Capital Expenditure Reported", "Purchase Of PPE"],
    "free_cash_flow": ["Free Cash Flow"],
    "dividends_paid": ["Cash Dividends Paid", "Common Stock Dividend Paid"],
    "depreciation_cf": ["Depreciation And Amortization", "Depreciation Amortization Depletion"],
    "change_in_working_capital": ["Change In Working Capital"],
    "debt_issued": ["Issuance Of Debt", "Long Term Debt Issuance"],
    "debt_repaid": ["Repayment Of Debt", "Long Term Debt Payments"],
    "change_in_cash": ["Changes In Cash"],
    "end_cash": ["End Cash Position"],
}

LABELS = {
    "revenue": "Revenue", "cost_of_revenue": "Cost of Revenue", "gross_profit": "Gross Profit",
    "operating_expense": "Operating Expenses", "operating_income": "Operating Income", "ebitda": "EBITDA",
    "ebit": "EBIT", "depreciation": "Depreciation & Amortisation", "interest_expense": "Interest Expense",
    "interest_income": "Interest Income", "net_interest_income": "Net Interest Income",
    "pretax_income": "Profit Before Tax", "tax": "Tax", "net_income": "Net Income (to shareholders)",
    "eps_basic": "EPS (Basic)", "eps_diluted": "EPS (Diluted)", "diluted_shares": "Diluted Avg. Shares",
    "total_assets": "Total Assets", "current_assets": "Current Assets", "cash": "Cash & Equivalents",
    "cash_and_sti": "Cash + Short-term Investments", "receivables": "Receivables", "inventory": "Inventory",
    "net_ppe": "Net PP&E", "goodwill_intangibles": "Goodwill & Intangibles", "investments": "Investments",
    "total_liabilities": "Total Liabilities", "current_liabilities": "Current Liabilities",
    "payables": "Payables", "total_debt": "Total Debt", "long_term_debt": "Long-term Debt",
    "current_debt": "Short-term Debt", "net_debt": "Net Debt", "equity": "Shareholders' Equity",
    "minority_interest": "Minority Interest", "total_equity": "Total Equity (incl. minority)",
    "retained_earnings": "Retained Earnings", "shares_outstanding": "Shares Outstanding",
    "working_capital": "Working Capital", "invested_capital": "Invested Capital",
    "operating_cf": "Operating Cash Flow", "investing_cf": "Investing Cash Flow",
    "financing_cf": "Financing Cash Flow", "capex": "Capital Expenditure", "free_cash_flow": "Free Cash Flow",
    "dividends_paid": "Dividends Paid", "depreciation_cf": "D&A (cash flow)",
    "change_in_working_capital": "Change in Working Capital", "debt_issued": "Debt Issued",
    "debt_repaid": "Debt Repaid", "change_in_cash": "Net Change in Cash", "end_cash": "Closing Cash",
}

# Per-share / count fields are not monetary (not scaled to crore in the UI)
NON_MONETARY = {"eps_basic", "eps_diluted", "diluted_shares", "shares_outstanding"}

STATEMENT_FIELDS = {"income": INCOME, "balance": BALANCE, "cashflow": CASHFLOW}


def fy_label(ts: pd.Timestamp) -> str:
    """Fiscal-year label by period-end year: period ending Mar-2026 → FY2026 (Indian convention).

    Non-March year ends are tagged (e.g. 'FY2022·Dec') so they are never confused with an
    April–March fiscal year (Nestlé India reported calendar years until its 2025 change).
    """
    return f"FY{ts.year}" if ts.month == 3 else f"FY{ts.year}·{ts.strftime('%b')}"


def fy_year(label: str) -> int:
    return int(label[2:6])


def q_label(ts: pd.Timestamp) -> str:
    """Indian fiscal quarter label: Jun→Q1, Sep→Q2, Dec→Q3, Mar→Q4. Sep-2026 → Q2 FY27."""
    q = {6: 1, 7: 1, 9: 2, 10: 2, 12: 3, 1: 3, 3: 4, 4: 4}.get(ts.month)
    fy = ts.year + 1 if ts.month >= 4 else ts.year
    return f"Q{q} FY{str(fy)[2:]}" if q else ts.strftime("%b-%Y")


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


@dataclass
class Period:
    end: pd.Timestamp
    label: str
    values: dict          # canonical field -> float | None
    sources: dict         # canonical field -> yahoo row used


def canonicalise(df: pd.DataFrame, mapping: dict, quarterly: bool) -> list[Period]:
    """Return periods (oldest → newest) with canonical values. Periods with no data at all are dropped."""
    if df is None or df.empty:
        return []
    periods = []
    for col in sorted(df.columns):
        vals, srcs = {}, {}
        for field, rows in mapping.items():
            vals[field] = None
            for r in rows:
                if r in df.index:
                    v = _num(df.at[r, col])
                    if v is not None:
                        vals[field], srcs[field] = v, r
                        break
        if any(v is not None for v in vals.values()):
            ts = pd.Timestamp(col)
            periods.append(Period(ts, q_label(ts) if quarterly else fy_label(ts), vals, srcs))
    return periods


def raw_table(df: pd.DataFrame) -> dict:
    """Full Yahoo statement (all line items) for display: {periods:[iso], rows:[{item, values}]}."""
    if df is None or df.empty:
        return {"periods": [], "rows": []}
    cols = sorted(df.columns)
    rows = []
    for item in df.index:
        vals = [_num(df.at[item, c]) for c in cols]
        if any(v is not None for v in vals):
            rows.append({"item": str(item), "values": vals})
    return {"periods": [pd.Timestamp(c).strftime("%Y-%m-%d") for c in cols], "rows": rows}
