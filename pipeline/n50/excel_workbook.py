"""Complete NIFTY 50 research workbook (XlsxWriter).

Built from the same JSON the web app serves (web/public/data), so the workbook and the
dashboard can never disagree. Design:

* Income_Statement, Balance_Sheet, Cash_Flow and KPI_Calculations are ROW-ALIGNED: row r on
  every sheet is the same (company, fiscal year). Every KPI is therefore a same-row Excel
  formula, e.g. Net margin = Income_Statement!{net income}r / Income_Statement!{revenue}r.
* Growth formulas reference the previous row and check, in Excel, that it is the same company
  and that the period ends are 330-400 days apart (consecutive fiscal years).
* Every formula is written together with its Python-computed result, so the file shows values
  even in viewers that do not recalculate; Excel recalculates on open.
* Blank = unavailable / not applicable (never zero).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pandas as pd
import xlsxwriter
from xlsxwriter.utility import xl_col_to_name as colname

from .config import DISCLAIMER, SOURCE_NAME, WEB_DATA, WEB_DOWNLOADS, WORKBOOK_PRICE_YEARS
from .log import get_logger
from .statements import BALANCE, CASHFLOW, INCOME, LABELS, NON_MONETARY

log = get_logger("n50.excel")
FILE = "NIFTY50_Complete_Research_Workbook.xlsx"
CR = 1e7


def _load(name):
    return json.loads((WEB_DATA / name).read_text(encoding="utf-8"))


def _num(v):
    return None if v is None else float(v)


def build_workbook(out_path=None, price_years: float | None = None, write_manifest: bool = True) -> None:
    meta, uni, dictionary = _load("meta.json"), _load("universe.json"), _load("kpi_dictionary.json")
    sectors, insights, coverage, validation, index = _load("sectors.json"), _load("insights.json"), _load("coverage.json"), _load("validation.json"), _load("index.json")
    companies = [json.loads((WEB_DATA / "companies" / f"{u['symbol']}.json").read_text(encoding="utf-8")) for u in uni]
    out = out_path or (WEB_DOWNLOADS / FILE)
    price_years = WORKBOOK_PRICE_YEARS if price_years is None else price_years
    wb = xlsxwriter.Workbook(out, {"strings_to_numbers": False, "nan_inf_to_errors": False, "constant_memory": False, "use_future_functions": True})
    wb.set_properties({"title": "NIFTY 50 Complete Research Workbook", "author": "Artha — NIFTY 50 Intelligence Terminal",
                       "comments": f"Built {meta['generated_at']} from {SOURCE_NAME}"})
    wb.set_calc_mode("auto")

    # ---------------- formats
    F = {}
    F["title"] = wb.add_format({"bold": True, "font_size": 15, "font_color": "#15161A"})
    F["sub"] = wb.add_format({"italic": True, "font_size": 9, "font_color": "#85837D"})
    F["head"] = wb.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#1F2128", "bottom": 2, "bottom_color": "#B06C0C",
                               "align": "center", "valign": "vcenter", "text_wrap": True, "font_size": 10})
    F["sect"] = wb.add_format({"bold": True, "font_size": 10, "font_color": "#B06C0C"})
    F["key"] = wb.add_format({"bold": True, "font_size": 10, "valign": "top"})
    F["wrap"] = wb.add_format({"text_wrap": True, "valign": "top", "font_size": 10})
    F["txt"] = wb.add_format({"font_size": 10})
    F["date"] = wb.add_format({"num_format": "dd-mmm-yyyy", "font_size": 10})
    F["in_cr"] = wb.add_format({"num_format": "#,##0;[Red]-#,##0", "font_color": "#1F4E9E", "font_size": 10})
    F["in_num"] = wb.add_format({"num_format": "#,##0.00", "font_color": "#1F4E9E", "font_size": 10})
    F["in_int"] = wb.add_format({"num_format": "#,##0", "font_color": "#1F4E9E", "font_size": 10})
    F["in_inr"] = wb.add_format({"num_format": '"₹"#,##0.00', "font_color": "#1F4E9E", "font_size": 10})
    F["cr"] = wb.add_format({"num_format": "#,##0;[Red]-#,##0", "font_size": 10})
    F["pct"] = wb.add_format({"num_format": "0.0%;[Red]-0.0%", "font_size": 10})
    F["pct2"] = wb.add_format({"num_format": "0.00%;[Red]-0.00%", "font_size": 10})
    F["x"] = wb.add_format({"num_format": '0.00"×";[Red]-0.00"×"', "font_size": 10})
    F["inr"] = wb.add_format({"num_format": '"₹"#,##0.00', "font_size": 10})
    F["days"] = wb.add_format({"num_format": '0" d"', "font_size": 10})
    F["num2"] = wb.add_format({"num_format": "#,##0.00", "font_size": 10})
    F["int"] = wb.add_format({"num_format": "#,##0", "font_size": 10})
    F["green"] = wb.add_format({"font_color": "#007A54"})
    F["red"] = wb.add_format({"font_color": "#C73131"})
    F["sum"] = wb.add_format({"bold": True, "bg_color": "#FFF4E0", "font_size": 10})

    def head(ws, row, headers, widths=None):
        for i, h in enumerate(headers):
            ws.write(row, i, h, F["head"])
            if widths:
                ws.set_column(i, i, widths[i] if i < len(widths) else widths[-1])
        ws.set_row(row, 30)

    def redgreen(ws, rng):
        ws.conditional_format(rng, {"type": "cell", "criteria": "<", "value": 0, "format": F["red"]})
        ws.conditional_format(rng, {"type": "cell", "criteria": ">", "value": 0, "format": F["green"]})

    def fml(ws, r, c, formula, value, fmt):
        """Write formula with cached result (blank string result when value is None)."""
        if value is None:
            ws.write_formula(r, c, formula, fmt, "")
        else:
            ws.write_formula(r, c, formula, fmt, value)

    sheets_written = []

    # =============================================================== README
    rd = wb.add_worksheet("README")
    sheets_written.append("README")
    rd.set_column(0, 0, 28)
    rd.set_column(1, 1, 120)
    rd.write(0, 0, "NIFTY 50 Complete Research Workbook", F["title"])
    rd.write(1, 0, "Artha — NIFTY 50 Intelligence Terminal · generated by the Python data pipeline (XlsxWriter)", F["sub"])
    r = 3
    def kv(k, v):
        nonlocal r
        rd.write(r, 0, k, F["key"])
        rd.write(r, 1, v, F["wrap"])
        r += 1
    kv("Dataset built (UTC)", meta["generated_at"])
    kv("Prices as of", meta["price_as_of"])
    kv("Constituents", f"{meta['universe'].get('count')} — NSE {meta['universe'].get('source')}, retrieved {meta['universe'].get('retrieved_at')}")
    kv("Source", SOURCE_NAME)
    kv("Disclaimer", DISCLAIMER)
    r += 1
    rd.write(r, 0, "CONVENTIONS", F["sect"]); r += 1
    for k, v in meta["conventions"].items():
        kv(k.replace("_", " ").capitalize(), v)
    kv("Units", "₹ Crore (1 Cr = 10,000,000 INR) for money; per-share values in ₹; ratios unitless; % formatted as percentages.")
    kv("Colour convention", "Blue = hard-coded inputs from the source. Black = Excel formulas. Blank = unavailable / not applicable — never zero.")
    kv("Formulas", "KPI_Calculations, Financial_Ratios, Company_Comparison ranks/summary, Sector_Analysis and Historical_Prices returns are live Excel formulas. Each formula also stores its computed value. Workbook recalculates on open.")
    kv("Row alignment", "Income_Statement, Balance_Sheet, Cash_Flow and KPI_Calculations share row numbers: row r is the same company and fiscal year on every sheet.")
    r += 1
    rd.write(r, 0, "SHEET GUIDE", F["sect"]); r += 1
    guide = [
        ("Company_Master", "Universe: symbol, name, NSE sector, Yahoo industry, analytical framework, coverage."),
        ("Raw_Market_Data", "Latest quote, 52-week range, moving averages, market cap, returns, risk metrics per company."),
        ("Historical_Prices", f"Daily OHLC / adjusted close / volume for the last {WORKBOOK_PRICE_YEARS} years (all constituents + NIFTY 50) with a daily-return formula. Full history is in each company's report from the web app."),
        ("Income_Statement / Balance_Sheet / Cash_Flow", "Canonical annual statements, one row per company-fiscal year, ₹ Cr."),
        ("KPI_Calculations", "All KPIs as formulas referencing the statement sheets (same row) plus FY-end market inputs."),
        ("Financial_Ratios", "Latest fiscal-year KPI per company, pulled by formula from KPI_Calculations."),
        ("Company_Comparison", "Current valuation, returns and risk with AVERAGE/MEDIAN/MAX/MIN and RANK formulas."),
        ("Sector_Analysis", "COUNTIFS / SUMIFS / AVERAGEIFS and SUMPRODUCT cap-weighted returns over Company_Comparison."),
        ("Dashboard_Data", "NIFTY 50 index statistics, monthly index closes, sector table and market-level observations."),
        ("Insights", "Every rule-based observation with evidence and threshold (facts vs interpretations)."),
        ("KPI_Dictionary", "Definition, formula, inputs, basis and significance of each KPI."),
        ("Data_Coverage / Validation", "Field availability per company and the automated validation checks."),
    ]
    for k, v in guide:
        kv(k, v)

    # =============================================================== Company_Master
    cm = wb.add_worksheet("Company_Master")
    sheets_written.append("Company_Master")
    hdr = ["Symbol", "Company", "NSE sector", "Yahoo industry", "ISIN", "Lender/insurer framework", "Statement currency (source)",
           "Annual periods", "Quarterly periods", "TTM available", "KPI completeness", "Price history from"]
    head(cm, 0, hdr, [12, 40, 28, 32, 15, 12, 14, 30, 40, 10, 12, 14])
    cov_by = {c["symbol"]: c for c in coverage}
    for i, c in enumerate(companies, 1):
        cv = cov_by[c["symbol"]]
        row = [c["symbol"], c["name"], c["sector"], c.get("industry") or "", c.get("isin") or "", "Yes" if c["is_financial"] else "No",
               c.get("financial_currency", "INR"), ", ".join(cv["annual_periods"]), ", ".join(cv["quarterly_periods"]),
               "Yes" if cv["ttm_available"] else "No"]
        for j, v in enumerate(row):
            cm.write(i, j, v, F["txt"])
        cm.write_number(i, 10, cv["kpi_completeness"] or 0, F["pct"])
        cm.write(i, 11, cv["price_start"] or "", F["txt"])
    cm.autofilter(0, 0, len(companies), len(hdr) - 1)
    cm.freeze_panes(1, 1)

    # =============================================================== Raw_Market_Data
    md = wb.add_worksheet("Raw_Market_Data")
    sheets_written.append("Raw_Market_Data")
    cols = [("Symbol", "txt", lambda u: u["symbol"]), ("Sector", "txt", lambda u: u["sector"]),
            ("Price date", "txt", lambda u: u["snapshot"].get("last_date")), ("Close (₹)", "inr", lambda u: u["snapshot"].get("price")),
            ("Prev close (₹)", "inr", lambda u: u["snapshot"].get("prev_close")), ("52W high", "inr", lambda u: u["snapshot"].get("high_52w")),
            ("52W low", "inr", lambda u: u["snapshot"].get("low_52w")), ("50-DMA", "inr", lambda u: u["snapshot"].get("ma50")),
            ("200-DMA", "inr", lambda u: u["snapshot"].get("ma200")),
            ("Market cap (₹ Cr)", "cr", lambda u: (u["valuation"].get("market_cap") or 0) / CR or None),
            ("Avg traded value 3M (₹ Cr)", "cr", lambda u: (u["snapshot"].get("avg_traded_value_3m") or 0) / CR or None)]
    for w in ("1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y"):
        cols.append((f"Return {w}", "pct", lambda u, w=w: u["returns"].get(w)))
    for w in ("3Y", "5Y", "10Y"):
        cols.append((f"CAGR {w}", "pct", lambda u, w=w: u["cagr"].get(w)))
    for k, lab, fmt in (("vol_1Y", "Volatility 1Y", "pct"), ("vol_3Y", "Volatility 3Y", "pct"), ("sharpe_3Y", "Sharpe 3Y", "num2"),
                        ("sortino_3Y", "Sortino 3Y", "num2"), ("beta_3Y", "Beta 3Y", "num2"), ("max_drawdown", "Max drawdown", "pct"),
                        ("current_drawdown", "Drawdown from ATH", "pct")):
        cols.append((lab, fmt, lambda u, k=k: u["risk"].get(k)))
    head(md, 0, [c[0] for c in cols], [12, 26] + [12] * (len(cols) - 2))
    for i, u in enumerate(uni, 1):
        for j, (_, fmt, fn) in enumerate(cols):
            v = fn(u)
            if v is None:
                md.write_blank(i, j, None)
            elif isinstance(v, str):
                md.write(i, j, v, F["txt"])
            else:
                md.write_number(i, j, v, F[fmt])
    md.autofilter(0, 0, len(uni), len(cols) - 1)
    md.freeze_panes(1, 1)
    redgreen(md, f"L2:{colname(len(cols) - 1)}{len(uni) + 1}")

    # =============================================================== statements (row-aligned)
    rows = [(c, p) for c in companies for p in c["annual"]]
    n = len(rows)
    first, last = 2, n + 1  # excel rows (1-based) of data
    col_of: dict[str, tuple[str, str]] = {}

    def stmt(name, mapping):
        ws = wb.add_worksheet(name)
        sheets_written.append(name)
        fields = list(mapping)
        headers = ["Symbol", "Fiscal year", "Period end"] + [f"{LABELS[f]}{'' if f in NON_MONETARY else ' (₹ Cr)'}" for f in fields]
        head(ws, 0, headers, [12, 11, 12] + [15] * len(fields))
        for k, f in enumerate(fields):
            col_of[f] = (name, colname(3 + k))
        for i, (c, p) in enumerate(rows, 1):
            ws.write(i, 0, c["symbol"], F["txt"])
            ws.write(i, 1, p["label"], F["txt"])
            ws.write_datetime(i, 2, datetime.fromisoformat(p["end"]), F["date"])
            for k, f in enumerate(fields):
                v = p["values"].get(f)
                if v is None:
                    ws.write_blank(i, 3 + k, None)
                elif f in NON_MONETARY:
                    ws.write_number(i, 3 + k, v, F["in_num"] if f.startswith("eps") else F["in_int"])
                else:
                    ws.write_number(i, 3 + k, v / CR, F["in_cr"])
        ws.autofilter(0, 0, n, len(headers) - 1)
        ws.freeze_panes(1, 3)

    stmt("Income_Statement", INCOME)
    stmt("Balance_Sheet", BALANCE)
    stmt("Cash_Flow", CASHFLOW)

    # =============================================================== KPI_Calculations
    kc = wb.add_worksheet("KPI_Calculations")
    sheets_written.append("KPI_Calculations")
    kc.set_tab_color("#2A78D6")
    inputs = ["Price at FY end (₹)", "Shares outstanding", "Market cap at FY end (₹ Cr)"]
    kpis = dictionary
    headers = ["Symbol", "Fiscal year", "Period end"] + inputs + [k["name"] for k in kpis]
    head(kc, 0, headers, [12, 11, 12, 13, 15, 16] + [13] * len(kpis))
    PRICE, SHARES, MCAP = "D", "E", "F"
    kcol = {k["id"]: colname(6 + j) for j, k in enumerate(kpis)}

    def ref(field, rr):
        if field == "market_cap_fy":
            return f"{MCAP}{rr}"
        s, cl = col_of[field]
        return f"{s}!{cl}{rr}"

    def div(a, b):
        return f'IF(AND(ISNUMBER({a}),ISNUMBER({b}),{b}>0),{a}/{b},"")'

    def tpl(kid, rr):
        R = lambda f, o=0: ref(f, rr + o)  # noqa: E731
        same_prev = f'AND($A{rr}=$A{rr - 1},($C{rr}-$C{rr - 1})>=330,($C{rr}-$C{rr - 1})<=400)'
        def g(f):
            c, p = R(f), R(f, -1)
            return f'IF(AND({same_prev},ISNUMBER({p}),ISNUMBER({c})),IF({p}>0,{c}/{p}-1,""),"")'
        T = {
            "revenue_growth": lambda: g("revenue"), "ebitda_growth": lambda: g("ebitda"),
            "net_income_growth": lambda: g("net_income"), "eps_growth": lambda: g("eps_diluted"),
            "gross_margin": lambda: div(R("gross_profit"), R("revenue")), "ebitda_margin": lambda: div(R("ebitda"), R("revenue")),
            "ebit_margin": lambda: div(R("ebit"), R("revenue")), "net_margin": lambda: div(R("net_income"), R("revenue")),
            "roe": lambda: div(R("net_income"), R("equity")), "roa": lambda: div(R("net_income"), R("total_assets")),
            "roce": lambda: f'IF(AND(ISNUMBER({R("ebit")}),ISNUMBER({R("total_assets")}),ISNUMBER({R("current_liabilities")})),IF(({R("total_assets")}-{R("current_liabilities")})>0,{R("ebit")}/({R("total_assets")}-{R("current_liabilities")}),""),"")',
            "current_ratio": lambda: div(R("current_assets"), R("current_liabilities")),
            "quick_ratio": lambda: f'IF(AND(ISNUMBER({R("current_assets")}),ISNUMBER({R("inventory")}),ISNUMBER({R("current_liabilities")})),IF({R("current_liabilities")}>0,({R("current_assets")}-{R("inventory")})/{R("current_liabilities")},""),"")',
            "cash_ratio": lambda: div(R("cash_and_sti"), R("current_liabilities")),
            "debt_to_equity": lambda: div(R("total_debt"), R("equity")), "debt_to_assets": lambda: div(R("total_debt"), R("total_assets")),
            "interest_coverage": lambda: div(R("ebit"), R("interest_expense")),
            "net_debt_ebitda": lambda: f'IF(AND(ISNUMBER({R("total_debt")}),ISNUMBER({R("cash_and_sti")}),ISNUMBER({R("ebitda")})),IF({R("ebitda")}>0,({R("total_debt")}-{R("cash_and_sti")})/{R("ebitda")},""),"")',
            "asset_turnover": lambda: div(R("revenue"), R("total_assets")),
            "inventory_turnover": lambda: div(R("cost_of_revenue"), R("inventory")),
            "receivables_turnover": lambda: div(R("revenue"), R("receivables")),
            "debtor_days": lambda: f'IF(AND(ISNUMBER({R("receivables")}),ISNUMBER({R("revenue")})),IF({R("revenue")}>0,{R("receivables")}/{R("revenue")}*365,""),"")',
            "operating_cf": lambda: f'IF(ISNUMBER({R("operating_cf")}),{R("operating_cf")},"")',
            "fcf": lambda: f'IF(AND(ISNUMBER({R("operating_cf")}),ISNUMBER({R("capex")})),{R("operating_cf")}-ABS({R("capex")}),"")',
            "cash_conversion": lambda: div(R("operating_cf"), R("net_income")),
            "fcf_margin": lambda: f'IF(AND(ISNUMBER({R("operating_cf")}),ISNUMBER({R("capex")}),ISNUMBER({R("revenue")})),IF({R("revenue")}>0,({R("operating_cf")}-ABS({R("capex")}))/{R("revenue")},""),"")',
            "capex_intensity": lambda: f'IF(AND(ISNUMBER({R("capex")}),ISNUMBER({R("revenue")})),IF({R("revenue")}>0,ABS({R("capex")})/{R("revenue")},""),"")',
            "dividend_payout": lambda: f'IF(AND(ISNUMBER({R("dividends_paid")}),ISNUMBER({R("net_income")})),IF({R("net_income")}>0,ABS({R("dividends_paid")})/{R("net_income")},""),"")',
            "eps": lambda: f'IF(ISNUMBER({R("eps_diluted")}),{R("eps_diluted")},"")',
            "bvps": lambda: f'IF(AND(ISNUMBER({R("equity")}),ISNUMBER({R("shares_outstanding")})),IF({R("shares_outstanding")}>0,{R("equity")}*10000000/{R("shares_outstanding")},""),"")',
            "pe": lambda: div(R("market_cap_fy"), R("net_income")), "pb": lambda: div(R("market_cap_fy"), R("equity")),
            "ps": lambda: div(R("market_cap_fy"), R("revenue")),
            "ev_ebitda": lambda: f'IF(AND(ISNUMBER({MCAP}{rr}),ISNUMBER({R("total_debt")}),ISNUMBER({R("cash_and_sti")}),ISNUMBER({R("ebitda")})),IF({R("ebitda")}>0,({MCAP}{rr}+{R("total_debt")}-{R("cash_and_sti")})/{R("ebitda")},""),"")',
            "dividend_yield": lambda: f'IF(AND(ISNUMBER({R("dividends_paid")}),ISNUMBER({MCAP}{rr})),IF({MCAP}{rr}>0,ABS({R("dividends_paid")})/{MCAP}{rr},""),"")',
        }
        return T[kid]()

    fmt_of = {"pct": F["pct"], "x": F["x"], "days": F["days"], "inr": F["cr"], "inr_ps": F["inr"]}
    money_kpi = {"operating_cf", "fcf"}
    kpi_row_of: dict[tuple[str, str], int] = {}
    for i, (c, p) in enumerate(rows, 1):
        rr = i + 1
        kpi_row_of[(c["symbol"], p["label"])] = rr
        kc.write(i, 0, c["symbol"], F["txt"])
        kc.write(i, 1, p["label"], F["txt"])
        kc.write_datetime(i, 2, datetime.fromisoformat(p["end"]), F["date"])
        v = p["values"]
        if v.get("price_fy") is not None:
            kc.write_number(i, 3, v["price_fy"], F["in_inr"])
        sh = col_of["shares_outstanding"]
        fml(kc, i, 4, f'IF(ISNUMBER({sh[0]}!{sh[1]}{rr}),{sh[0]}!{sh[1]}{rr},"")', v.get("shares_outstanding"), F["int"])
        fml(kc, i, 5, f'IF(AND(ISNUMBER(D{rr}),ISNUMBER(E{rr})),D{rr}*E{rr}/10000000,"")',
            None if v.get("market_cap_fy") is None else v["market_cap_fy"] / CR, F["cr"])
        for j, k in enumerate(kpis):
            val = c["kpis"][k["id"]]["values"].get(p["label"])
            if val is not None and k["id"] in money_kpi:
                val = val / CR
            if val is None:
                # engine withheld it (n/a for lenders, artefact, negative base...) — keep the cell blank, explain in a comment
                reason = c["kpis"][k["id"]]["na"].get(p["label"], "")
                kc.write_blank(i, 6 + j, None, fmt_of[k["unit"]])
                if reason and reason.startswith(("na_financial", "cogs_not_reported", "negative", "nonpositive")):
                    kc.write_comment(i, 6 + j, reason.replace("_", " "), {"visible": False})
            else:
                fml(kc, i, 6 + j, tpl(k["id"], rr), val, fmt_of[k["unit"]])
    kc.autofilter(0, 0, n, len(headers) - 1)
    kc.freeze_panes(1, 3)
    for k in kpis:
        if k["unit"] == "pct" and k["better"] == "higher":
            redgreen(kc, f"{kcol[k['id']]}2:{kcol[k['id']]}{last}")

    # =============================================================== Financial_Ratios (latest FY via formulas)
    fr = wb.add_worksheet("Financial_Ratios")
    sheets_written.append("Financial_Ratios")
    head(fr, 0, ["Symbol", "Sector"] + [f"{k['name']}" for k in kpis] + ["FY used (per KPI: latest reported)"], [12, 26] + [13] * len(kpis) + [40])
    for i, u in enumerate(uni, 1):
        fr.write(i, 0, u["symbol"], F["txt"])
        fr.write(i, 1, u["sector"], F["txt"])
        used = []
        for j, k in enumerate(kpis):
            fy = u["kpis"].get(f"{k['id']}__fy")
            val = u["kpis"].get(k["id"])
            if fy is None or val is None:
                fr.write_blank(i, 2 + j, None)
                continue
            rr = kpi_row_of[(u["symbol"], fy)]
            used.append(fy)
            if k["id"] in money_kpi:
                val = val / CR
            fml(fr, i, 2 + j, f"KPI_Calculations!{kcol[k['id']]}{rr}", val, fmt_of[k["unit"]])
        fr.write(i, 2 + len(kpis), ", ".join(sorted(set(used))), F["txt"])
    fr.autofilter(0, 0, len(uni), len(kpis) + 2)
    fr.freeze_panes(1, 1)

    # =============================================================== Company_Comparison
    cc = wb.add_worksheet("Company_Comparison")
    sheets_written.append("Company_Comparison")
    cmp_cols = [("Market cap (₹ Cr)", "cr", lambda u: (u["valuation"]["market_cap"] or 0) / CR or None, None),
                ("P/E (current)", "x", lambda u: u["valuation"]["pe"], "low"), ("P/B (current)", "x", lambda u: u["valuation"]["pb"], "low"),
                ("EV/EBITDA (current)", "x", lambda u: u["valuation"]["ev_ebitda"], "low"),
                ("Dividend yield", "pct2", lambda u: u["valuation"]["dividend_yield"], "high"),
                ("ROE (latest FY)", "pct", lambda u: u["kpis"].get("roe"), "high"), ("Net margin (latest FY)", "pct", lambda u: u["kpis"].get("net_margin"), "high"),
                ("Revenue growth (latest FY)", "pct", lambda u: u["kpis"].get("revenue_growth"), "high"),
                ("Debt/Equity (latest FY)", "x", lambda u: u["kpis"].get("debt_to_equity"), "low"),
                ("Return 1Y", "pct", lambda u: u["returns"].get("1Y"), "high"), ("CAGR 3Y", "pct", lambda u: u["cagr"].get("3Y"), "high"),
                ("CAGR 5Y", "pct", lambda u: u["cagr"].get("5Y"), "high"), ("Volatility 1Y", "pct", lambda u: u["risk"].get("vol_1Y"), "low"),
                ("Sharpe 3Y", "num2", lambda u: u["risk"].get("sharpe_3Y"), "high"), ("Beta 3Y", "num2", lambda u: u["risk"].get("beta_3Y"), None),
                ("Return 1M", "pct", lambda u: u["returns"].get("1M"), "high")]
    head(cc, 0, ["Symbol", "Company", "Sector"] + [c[0] for c in cmp_cols], [12, 34, 26] + [13] * len(cmp_cols))
    nU = len(uni)
    for i, u in enumerate(uni, 1):
        cc.write(i, 0, u["symbol"], F["txt"]); cc.write(i, 1, u["name"], F["txt"]); cc.write(i, 2, u["sector"], F["txt"])
        for j, (_, fmt, fn, _) in enumerate(cmp_cols):
            v = fn(u)
            if v is None:
                cc.write_blank(i, 3 + j, None)
            else:
                cc.write_number(i, 3 + j, v, F[fmt])
    # summary + ranks
    s0 = nU + 2
    for k, (lab, fn_) in enumerate((("Average", "AVERAGE"), ("Median", "MEDIAN"), ("Maximum", "MAX"), ("Minimum", "MIN"), ("Count", "COUNT"))):
        cc.write(s0 + k, 2, lab, F["sum"])
        for j, (_, fmt, fn, _) in enumerate(cmp_cols):
            col = colname(3 + j)
            vals = [fn(u) for u in uni if fn(u) is not None]
            res = None
            if vals:
                res = {"AVERAGE": sum(vals) / len(vals), "MEDIAN": float(pd.Series(vals).median()), "MAX": max(vals), "MIN": min(vals), "COUNT": len(vals)}[fn_]
            fml(cc, s0 + k, 3 + j, f"{fn_}({col}2:{col}{nU + 1})", res, F["int"] if fn_ == "COUNT" else F[fmt])
    r0 = s0 + 7
    cc.write(r0 - 1, 0, "RANKS (1 = best; direction-aware)", F["sect"])
    head(cc, r0, ["Symbol", "Company", "Sector"] + [c[0] for c in cmp_cols])
    for i, u in enumerate(uni):
        rr = r0 + 1 + i
        cc.write(rr, 0, u["symbol"], F["txt"]); cc.write(rr, 1, u["name"], F["txt"]); cc.write(rr, 2, u["sector"], F["txt"])
        for j, (_, fmt, fn, better) in enumerate(cmp_cols):
            if not better:
                continue
            col = colname(3 + j)
            v = fn(u)
            vals = [fn(x) for x in uni if fn(x) is not None]
            res = None if v is None else 1 + sum(1 for x in vals if (x > v if better == "high" else x < v))
            fml(cc, rr, 3 + j, f'IF(ISNUMBER({col}{i + 2}),RANK({col}{i + 2},{col}$2:{col}${nU + 1},{0 if better == "high" else 1}),"")', res, F["int"])
    cc.autofilter(0, 0, nU, 2 + len(cmp_cols))
    cc.freeze_panes(1, 1)

    # =============================================================== Sector_Analysis
    sa = wb.add_worksheet("Sector_Analysis")
    sheets_written.append("Sector_Analysis")
    sa.set_tab_color("#2A78D6")
    sa.write(0, 0, "Sector analysis — every figure is a formula over Company_Comparison", F["title"])
    SEC = f"Company_Comparison!$C$2:$C${nU + 1}"
    C = lambda j: f"Company_Comparison!${colname(3 + j)}$2:${colname(3 + j)}${nU + 1}"  # noqa: E731
    MC = C(0)
    sh = ["Sector", "Companies", "Market cap (₹ Cr)", "Share of NIFTY 50", "Cap-wtd return 1M", "Cap-wtd return 1Y",
          "Avg P/E", "Avg P/B", "Avg ROE", "Avg net margin", "Avg revenue growth", "Avg D/E", "Avg volatility 1Y", "Best 1Y", "Worst 1Y"]
    head(sa, 2, sh, [34] + [14] * (len(sh) - 1))
    idx = {c[0]: j for j, c in enumerate(cmp_cols)}
    tot = sum((u["valuation"]["market_cap"] or 0) for u in uni) / CR
    for k, sec in enumerate(sorted({u["sector"] for u in uni})):
        rr = 4 + k
        mem = [u for u in uni if u["sector"] == sec]
        sa.write(rr - 1, 0, sec, F["txt"])
        fml(sa, rr - 1, 1, f"COUNTIFS({SEC},A{rr})", len(mem), F["int"])
        cap = sum((u["valuation"]["market_cap"] or 0) for u in mem) / CR
        fml(sa, rr - 1, 2, f"SUMIFS({MC},{SEC},A{rr})", cap, F["cr"])
        fml(sa, rr - 1, 3, f"C{rr}/SUM({MC})", cap / tot if tot else None, F["pct"])
        for c_i, (lab, w) in enumerate((("Return 1M", "1M"), ("Return 1Y", "1Y"))):
            R = C(idx[lab])
            rep = [u for u in mem if u["returns"].get(w) is not None and u["valuation"]["market_cap"]]
            den = sum(u["valuation"]["market_cap"] for u in rep)
            res = sum(u["valuation"]["market_cap"] * u["returns"][w] for u in rep) / den if den else None
            fml(sa, rr - 1, 4 + c_i, f'IFERROR(SUMPRODUCT(({SEC}=A{rr})*ISNUMBER({R})*{MC},{R})/SUMPRODUCT(({SEC}=A{rr})*ISNUMBER({R})*{MC}),"")', res, F["pct"])
        for c_i, (lab, fmt) in enumerate((("P/E (current)", "x"), ("P/B (current)", "x"), ("ROE (latest FY)", "pct"), ("Net margin (latest FY)", "pct"),
                                          ("Revenue growth (latest FY)", "pct"), ("Debt/Equity (latest FY)", "x"), ("Volatility 1Y", "pct"))):
            fn = cmp_cols[idx[lab]][2]
            vals = [fn(u) for u in mem if fn(u) is not None]
            fml(sa, rr - 1, 6 + c_i, f'IFERROR(AVERAGEIFS({C(idx[lab])},{SEC},A{rr}),"")', sum(vals) / len(vals) if vals else None, F[fmt])
        r1 = [u["returns"]["1Y"] for u in mem if u["returns"].get("1Y") is not None]
        fml(sa, rr - 1, 13, f'IFERROR(MAXIFS({C(idx["Return 1Y"])},{SEC},A{rr}),"")', max(r1) if r1 else None, F["pct"])
        fml(sa, rr - 1, 14, f'IFERROR(MINIFS({C(idx["Return 1Y"])},{SEC},A{rr}),"")', min(r1) if r1 else None, F["pct"])
    nS = len({u["sector"] for u in uni})
    sa.autofilter(2, 0, 2 + nS, len(sh) - 1)
    sa.freeze_panes(3, 1)
    redgreen(sa, f"E4:F{3 + nS}")

    # =============================================================== Historical_Prices
    hp = wb.add_worksheet("Historical_Prices")
    sheets_written.append("Historical_Prices")
    head(hp, 0, ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Daily return (adj.)"], [12, 12, 11, 11, 11, 11, 11, 14, 14])
    cutoff = (pd.Timestamp(meta["price_as_of"]) - pd.DateOffset(days=int(price_years * 365.25))).strftime("%Y-%m-%d")
    r = 1
    prev_sym, prev_adj = None, None
    for sym in ["NIFTY50"] + [u["symbol"] for u in uni]:
        p = json.loads((WEB_DATA / "prices" / f"{sym}.json").read_text(encoding="utf-8"))
        for i, d in enumerate(p["d"]):
            if d < cutoff:
                continue
            hp.write_string(r, 0, sym)
            hp.write_datetime(r, 1, datetime.fromisoformat(d), F["date"])
            for j, key in enumerate(("o", "h", "l", "c", "a")):
                v = p[key][i]
                if v is None:
                    hp.write_blank(r, 2 + j, None)
                else:
                    hp.write_number(r, 2 + j, v, F["num2"])
            if p["v"][i] is not None:
                hp.write_number(r, 7, p["v"][i], F["int"])
            adj = p["a"][i]
            res = adj / prev_adj - 1 if sym == prev_sym and adj and prev_adj else None
            if r > 1:
                fml(hp, r, 8, f'IF(AND(A{r + 1}=A{r},ISNUMBER(G{r + 1}),ISNUMBER(G{r})),G{r + 1}/G{r}-1,"")', res, F["pct2"])
            prev_sym, prev_adj = sym, adj
            r += 1
    hp.autofilter(0, 0, r - 1, 8)
    hp.freeze_panes(1, 2)
    redgreen(hp, f"I2:I{r}")
    n_price_rows = r - 1

    # =============================================================== Dashboard_Data
    dd = wb.add_worksheet("Dashboard_Data")
    sheets_written.append("Dashboard_Data")
    dd.write(0, 0, "NIFTY 50 index", F["title"])
    head(dd, 2, ["Metric", "Value"], [28, 16])
    stats = [("Last close", index["snapshot"]["price"], "num2"), ("Price date", index["snapshot"]["last_date"], "txt")]
    stats += [(f"Return {k}", v, "pct") for k, v in index["returns"].items()]
    stats += [(f"CAGR {k}", v, "pct") for k, v in index["cagr"].items()]
    stats += [("Volatility 1Y", index["risk"].get("vol_1Y"), "pct"), ("Max drawdown", index["risk"].get("max_drawdown"), "pct")]
    for i, (k, v, fmt) in enumerate(stats):
        dd.write(3 + i, 0, k, F["txt"])
        if v is None:
            dd.write_blank(3 + i, 1, None)
        elif fmt == "txt":
            dd.write(3 + i, 1, v, F["txt"])
        else:
            dd.write_number(3 + i, 1, v, F[fmt])
    # calendar
    c0 = 3 + len(stats) + 2
    head(dd, c0, ["Calendar year", "NIFTY 50 price return"])
    for i, (y, v) in enumerate(sorted(index["calendar"].items())):
        dd.write(c0 + 1 + i, 0, y, F["txt"]); dd.write_number(c0 + 1 + i, 1, v, F["pct"])
    redgreen(dd, f"B{c0 + 2}:B{c0 + 2 + len(index['calendar'])}")
    # sector table (pre-computed medians)
    head(dd, 2, ["", "", "", "Sector", "Constituents", "Mkt cap (₹ Cr)", "Cap-wtd 1D", "Cap-wtd 1M", "Cap-wtd 1Y", "Median P/E", "Median ROE"],
         [28, 16, 4, 30, 12, 15, 12, 12, 12, 12, 12])
    for i, s in enumerate(sorted(sectors, key=lambda x: -x["market_cap"])):
        rr = 3 + i
        dd.write(rr, 3, s["sector"], F["txt"]); dd.write_number(rr, 4, s["count"], F["int"]); dd.write_number(rr, 5, s["market_cap"] / CR, F["cr"])
        for j, w in enumerate(("1D", "1M", "1Y")):
            v = s["weighted_returns"].get(w)
            dd.write_number(rr, 6 + j, v, F["pct"]) if v is not None else dd.write_blank(rr, 6 + j, None)
        for j, (k, fmt) in enumerate((("pe_now", "x"), ("roe", "pct"))):
            v = s["medians"].get(k)
            dd.write_number(rr, 9 + j, v, F[fmt]) if v is not None else dd.write_blank(rr, 9 + j, None)
    u0 = 3 + len(sectors) + 2
    dd.write(u0, 3, "Market-level observations (rule-based facts)", F["sect"])
    for i, o in enumerate(insights["universe"]):
        dd.write(u0 + 1 + i, 3, o["title"], F["key"]); dd.write(u0 + 1 + i, 4, o["fact"], F["txt"])

    # =============================================================== Insights
    ins = wb.add_worksheet("Insights")
    sheets_written.append("Insights")
    hdr = ["Symbol", "Category", "Tone", "Period", "Rule", "Title", "Fact (verifiable)", "Interpretation (not advice)", "Evidence", "Threshold"]
    head(ins, 0, hdr, [12, 14, 10, 12, 20, 40, 90, 60, 70, 30])
    for i, o in enumerate(insights["companies"], 1):
        ev = " | ".join(f"{e['label']}: {e['value']}" for e in o["evidence"])
        for j, v in enumerate([o["symbol"], o["category"], o["tone"], o["period"], o["rule"], o["title"], o["fact"], o.get("interpretation") or "", ev, o.get("threshold") or ""]):
            ins.write(i, j, v, F["txt"])
    ins.autofilter(0, 0, len(insights["companies"]), len(hdr) - 1)
    ins.freeze_panes(1, 1)

    # =============================================================== KPI_Dictionary
    kd = wb.add_worksheet("KPI_Dictionary")
    sheets_written.append("KPI_Dictionary")
    hdr = ["KPI", "Group", "Formula", "Inputs", "Basis", "Unit", "Better", "Applies to lenders/insurers", "Significance"]
    head(kd, 0, hdr, [32, 14, 50, 40, 46, 8, 8, 12, 90])
    for i, k in enumerate(dictionary, 1):
        for j, v in enumerate([k["name"], k["group"], k["formula"], ", ".join(k["inputs"]), k["basis"], k["unit"], k["better"] or "—",
                               "Yes" if k["financials"] else "No", k["significance"]]):
            kd.write(i, j, v, F["wrap"] if j in (2, 4, 8) else F["txt"])
    kd.freeze_panes(1, 1)

    # =============================================================== Data_Coverage
    dc = wb.add_worksheet("Data_Coverage")
    sheets_written.append("Data_Coverage")
    fields = list(INCOME) + list(BALANCE) + list(CASHFLOW)
    hdr = ["Symbol", "Annual periods", "Quarterly periods", "TTM", "KPI completeness", "Price rows", "Price from"] + [LABELS[f] for f in fields]
    head(dc, 0, hdr, [12, 10, 10, 6, 11, 10, 12] + [9] * len(fields))
    for i, c in enumerate(coverage, 1):
        n_a = len(c["annual_periods"])
        row = [c["symbol"], n_a, len(c["quarterly_periods"]), "Yes" if c["ttm_available"] else "No", c["kpi_completeness"], c["price_rows"], c["price_start"]]
        for j, v in enumerate(row):
            if j == 4:
                dc.write_number(i, j, v or 0, F["pct"])
            else:
                dc.write(i, j, v)
        for j, f in enumerate(fields):
            dc.write_number(i, 7 + j, (c["fields"].get(f, 0) / n_a) if n_a else 0, F["pct"])
    dc.conditional_format(1, 7, len(coverage), 6 + len(fields), {"type": "3_color_scale", "min_color": "#F2A7A7", "mid_color": "#FFF4E0", "max_color": "#7FC7A7"})
    dc.freeze_panes(1, 1)
    dc.autofilter(0, 0, len(coverage), len(hdr) - 1)

    va = wb.add_worksheet("Validation")
    sheets_written.append("Validation")
    head(va, 0, ["Symbol", "Check", "Status", "Detail"], [12, 34, 10, 110])
    for i, v in enumerate(validation, 1):
        for j, k in enumerate(("symbol", "check", "status", "detail")):
            va.write(i, j, v[k], F["txt"])
    va.autofilter(0, 0, len(validation), 3)
    va.conditional_format(1, 2, len(validation), 2, {"type": "cell", "criteria": "==", "value": '"warn"', "format": F["red"]})

    wb.close()
    size = out.stat().st_size
    manifest = {"file": FILE, "bytes": size, "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "sheets": sheets_written, "companies": len(uni), "statement_rows": n, "price_rows": n_price_rows,
                "price_years": WORKBOOK_PRICE_YEARS}
    if write_manifest:
        (WEB_DOWNLOADS / "manifest.json").write_text(json.dumps(manifest, indent=1))
    log.info("Workbook written: %s (%.1f MB, %d statement rows, %d price rows)", out.name, size / 1e6, n, n_price_rows)


if __name__ == "__main__":
    build_workbook()
