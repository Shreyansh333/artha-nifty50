"""Build the static data API consumed by the web app (web/public/data)."""
from __future__ import annotations

import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd

from . import kpis as K
from . import market as M
from .config import DISCLAIMER, INDEX_TICKER, INFO_CACHE, PRICE_CACHE, RISK_FREE_RATE, SOURCE_NAME, WEB_DATA
from .fetch import load_state, read_statement
from .insights import company_insights
from .log import get_logger
from .statements import BALANCE, CASHFLOW, INCOME, LABELS, NON_MONETARY, canonicalise, raw_table
from .universe import load_universe

log = get_logger("n50.build")


# ------------------------------------------------------------------ utils
def clean(o):
    """Recursively replace NaN/inf with None so JSON is valid."""
    if isinstance(o, float):
        return None if math.isnan(o) or math.isinf(o) else o
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o


def write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(obj), separators=(",", ":"), ensure_ascii=False, default=str), encoding="utf-8")


def load_prices(ticker: str) -> pd.DataFrame:
    p = PRICE_CACHE / f"{ticker.replace('^', '_')}.csv"
    return pd.read_csv(p, parse_dates=["Date"], index_col="Date") if p.exists() else pd.DataFrame()


def load_info(ticker: str) -> dict:
    p = INFO_CACHE / f"{ticker.replace('^', '_')}.json"
    return json.loads(p.read_text()) if p.exists() else {}


def clean_adjusted(s: pd.Series) -> pd.Series:
    """Adjusted closes ≤ 0 are Yahoo artefacts; use only the contiguous valid tail."""
    s = s.astype(float).dropna()
    bad = s[s <= 0]
    if len(bad):
        s = s.loc[s.index > bad.index.max()]
    return s


def median(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


# ------------------------------------------------------------------ FX translation
NOT_CURRENCY_FIELDS = {"diluted_shares", "shares_outstanding"}


def _is_count_row(item: str) -> bool:
    s = item.lower()
    return "shares" in s or "share issued" in s or "tax rate" in s


def fx_rate(fx: pd.Series, end: pd.Timestamp, kind: str, quarterly: bool) -> Optional[float]:
    """INR per unit: period-end rate for balance sheet; average over the period for flows."""
    if kind == "balance":
        return M.asof(fx, end)
    window = fx.loc[end - pd.Timedelta(days=91 if quarterly else 365): end]
    return float(window.mean()) if len(window) else M.asof(fx, end)


def translate_statement(df: pd.DataFrame, fx: pd.Series, kind: str, quarterly: bool) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    out = df.copy().astype(float)
    for col in out.columns:
        r = fx_rate(fx, pd.Timestamp(col), kind, quarterly)
        mask = [not _is_count_row(str(i)) for i in out.index]
        out.loc[mask, col] = out.loc[mask, col] * r if r else float("nan")
    return out


def detect_statement_currency(sym: str, info: dict, stmts: dict, fx_series: dict) -> tuple[str, Optional[str]]:
    """Yahoo's `financialCurrency` label is not always right (HCLTECH is labelled USD but reported in INR).

    Cross-check: Yahoo-implied trailing net income (marketCap ÷ trailingPE, in INR) versus the raw
    statement net income. Ratio ≈ 1 → INR; ratio ≈ FX rate → the labelled foreign currency.
    Returns (currency, note) — for INR the note documents any overridden label.
    """
    declared = info.get("financialCurrency") or "INR"
    if declared == "INR":
        return "INR", None
    fx = fx_series.get(declared)
    mcap, tpe = info.get("marketCap"), info.get("trailingPE")
    inc = stmts.get("income_annual")
    raw_ni = None
    if inc is not None and not inc.empty:
        for r in ("Net Income Common Stockholders", "Net Income"):
            if r in inc.index:
                s = inc.loc[r].dropna()
                if len(s):
                    raw_ni = float(s.sort_index().iloc[-1])
                    break
    if not (mcap and tpe and tpe > 0 and raw_ni and raw_ni > 0 and fx is not None and len(fx)):
        log.warning("%s: cannot verify statement currency; trusting Yahoo label %s", sym, declared)
        return declared, "label not verifiable"
    ratio = (mcap / tpe) / raw_ni
    rate = float(fx.iloc[-1])
    if 0.5 < ratio < 2:
        log.info("%s: Yahoo labels statements %s but magnitudes are INR (ratio %.2f) → treated as INR", sym, declared, ratio)
        return "INR", None
    if 0.5 < ratio / rate < 2:
        return declared, f"verified: implied/raw net income ratio {ratio:.1f} ≈ {declared}INR {rate:.1f}"
    log.warning("%s: ambiguous statement currency (ratio %.2f, fx %.2f); trusting label %s", sym, ratio, rate, declared)
    return declared, "label trusted; magnitude check inconclusive"


# ------------------------------------------------------------------ statements
def merge_periods(stmts: dict, quarterly: bool) -> list[dict]:
    """Merge income/balance/cashflow canonical periods by period-end date (oldest→newest)."""
    suffix = "quarterly" if quarterly else "annual"
    by_end: dict[pd.Timestamp, dict] = {}
    for kind, mapping in (("income", INCOME), ("balance", BALANCE), ("cashflow", CASHFLOW)):
        for p in canonicalise(stmts.get(f"{kind}_{suffix}"), mapping, quarterly):
            rec = by_end.setdefault(p.end, {"label": p.label, "end": str(p.end.date()), "values": {}, "sources": {}})
            rec["values"].update(p.values)
            rec["sources"].update({f: s for f, s in p.sources.items()})
    periods = [by_end[k] for k in sorted(by_end)]
    for p in periods:  # ensure every canonical field exists (None = unavailable)
        for mp in (INCOME, BALANCE, CASHFLOW):
            for f in mp:
                p["values"].setdefault(f, None)
    return periods


def consecutive_quarters(qs: list[dict]) -> Optional[list[dict]]:
    """Return the latest 4 quarters if they are consecutive (80-100 day spacing), else None."""
    if len(qs) < 4:
        return None
    last4 = qs[-4:]
    ends = [pd.Timestamp(q["end"]) for q in last4]
    if all(80 <= (ends[i + 1] - ends[i]).days <= 100 for i in range(3)):
        return last4
    return None


def ttm(qs: list[dict], field: str) -> Optional[float]:
    vals = [q["values"].get(field) for q in qs]
    return None if any(v is None for v in vals) else float(sum(vals))


# ------------------------------------------------------------------ per company
def build_company(row, stmts: dict, prices: pd.DataFrame, info: dict, bench_adj: pd.Series, state: dict,
                  fx_series: dict) -> dict:
    sym = row.symbol
    fin_ccy, currency_note = detect_statement_currency(sym, info, stmts, fx_series)
    if fin_ccy != "INR":
        fx = fx_series.get(fin_ccy)
        if fx is None or fx.empty:
            raise RuntimeError(f"{sym}: statements in {fin_ccy} but no {fin_ccy}INR rate available")
        stmts = {k: translate_statement(v, fx, k.split("_")[0], k.endswith("quarterly")) for k, v in stmts.items()}
        currency_note = (f"Yahoo reports this company's financial statements in {fin_ccy} ({currency_note}). They are translated to INR "
                         f"using Yahoo {fin_ccy}INR rates: average rate over each period for income-statement and cash-flow "
                         f"items, period-end rate for balance-sheet items. Share counts are not translated.")
    annual = merge_periods(stmts, quarterly=False)
    quarterly = merge_periods(stmts, quarterly=True)
    has_ca = any(p["values"].get("current_assets") is not None for p in annual)
    is_fin = bool(row.sector == "Financial Services" and not has_ca)

    # market cap at each fiscal-year end (raw, un-split-adjusted close × reported shares)
    raw_close = M.raw_close_series(prices) if not prices.empty else pd.Series(dtype=float)
    for p in annual:
        end = pd.Timestamp(p["end"])
        px = M.asof(raw_close, end) if not raw_close.empty and end >= raw_close.index[0] else None
        sh = p["values"].get("shares_outstanding")
        p["values"]["price_fy"] = px
        p["values"]["market_cap_fy"] = px * sh if px is not None and sh else None

    kp = K.compute_series(annual, is_fin)

    # ---- snapshot valuation (TTM where 4 consecutive quarters exist; else latest FY, labelled)
    snap = M.snapshot(prices) if not prices.empty else {}
    price = snap.get("price")
    shares = info.get("sharesOutstanding")
    mcap = info.get("marketCap")
    mcap_src = "Yahoo quote (marketCap)"
    if not mcap and price and shares:
        mcap, mcap_src = price * shares, "Last close × shares outstanding"
    q4 = consecutive_quarters(quarterly)
    latest = annual[-1]["values"] if annual else {}
    latest_label = annual[-1]["label"] if annual else None
    if q4:
        flows = {f: ttm(q4, f) for f in ("revenue", "net_income", "ebitda")}
        basis = f"TTM to {q4[-1]['label']} ({q4[-1]['end']})"
    else:
        flows = {f: None for f in ("revenue", "net_income", "ebitda")}
        basis = None
    # per-field fallback to latest fiscal year when TTM component missing
    flow_basis = {}
    for f in flows:
        if flows[f] is not None:
            flow_basis[f] = basis
            continue
        for p in reversed(annual):  # latest fiscal year that actually reports this field
            if p["values"].get(f) is not None:
                flows[f], flow_basis[f] = p["values"][f], f"{p['label']} annual (TTM unavailable)"
                break
    bs = (quarterly[-1]["values"] if quarterly and quarterly[-1]["values"].get("equity") is not None else latest) or {}
    bs_label = quarterly[-1]["label"] if quarterly and quarterly[-1]["values"].get("equity") is not None else latest_label
    debt, cash, equity = bs.get("total_debt"), bs.get("cash_and_sti"), bs.get("equity")
    if debt is None and latest.get("total_debt") is not None:
        debt = latest.get("total_debt")
    if cash is None and latest.get("cash_and_sti") is not None:
        cash = latest.get("cash_and_sti")
    ev = mcap + debt - cash if mcap and debt is not None and cash is not None else None

    def safe(a, b, pos=True):
        if a is None or b is None or (pos and b <= 0) or b == 0:
            return None
        return a / b

    ni = flows["net_income"]
    valuation = {
        "market_cap": mcap, "market_cap_source": mcap_src, "enterprise_value": None if is_fin else ev,
        "pe": safe(mcap, ni) if ni and ni > 0 else None, "pe_basis": flow_basis.get("net_income"),
        "pb": safe(mcap, equity), "pb_basis": f"Equity at {bs_label}" if equity else None,
        "ps": safe(mcap, flows["revenue"]), "ps_basis": flow_basis.get("revenue"),
        "ev_ebitda": None if is_fin else safe(ev, flows["ebitda"]), "ev_ebitda_basis": None if is_fin else flow_basis.get("ebitda"),
        "dividend_yield": safe(snap.get("dps_ttm"), price) if snap.get("dps_ttm") is not None else None,
        "dividend_yield_basis": "Dividends per share paid in last 365 days ÷ last close",
        "revenue_ttm": flows["revenue"], "net_income_ttm": ni, "ebitda_ttm": flows["ebitda"],
        "ttm_available": bool(q4), "yahoo_trailing_pe": info.get("trailingPE"), "yahoo_price_to_book": info.get("priceToBook"),
        "beta_yahoo": info.get("beta"),
    }
    if ni is not None and ni <= 0:
        valuation["pe_note"] = "Not meaningful — trailing earnings are negative"

    # ---- market analytics
    market = {}
    data_notes = []
    if currency_note:
        data_notes.append(currency_note)
    if not prices.empty:
        adj = clean_adjusted(prices["Adj Close"])
        n_bad = int((prices["Adj Close"].astype(float) <= 0).sum())
        if n_bad:
            data_notes.append(f"Yahoo's adjusted close is non-positive on {n_bad} early trading days (an adjustment "
                              f"artefact). Return and risk metrics use history from {adj.index[0].date()} onward.")
        market = {
            "returns": M.period_returns(adj),
            "cagr": {f"{y}Y": M.cagr(adj, y) for y in (3, 5, 10)},
            "risk": M.risk_metrics(adj, bench_adj),
            "calendar": M.calendar_returns(adj),
            "monthly": M.monthly_returns(adj),
        }
        dd = M.drawdown_series(adj)
        wk = dd.resample("W").last().loc[adj.index[-1] - pd.DateOffset(years=10):]
        market["drawdown_weekly"] = {"d": [d.strftime("%Y-%m-%d") for d in wk.index], "v": [round(float(v), 4) for v in wk]}

    # ---- quarterly derived metrics
    q_metrics = []
    for i, q in enumerate(quarterly):
        v = q["values"]
        yoy = None
        for j in range(i - 1, -1, -1):
            gap = (pd.Timestamp(q["end"]) - pd.Timestamp(quarterly[j]["end"])).days
            if 350 <= gap <= 380:
                r0 = quarterly[j]["values"].get("revenue")
                yoy = v["revenue"] / r0 - 1 if v.get("revenue") is not None and r0 and r0 > 0 else None
                break
        q_metrics.append({
            "label": q["label"], "end": q["end"],
            "net_margin": safe(v.get("net_income"), v.get("revenue")),
            "ebitda_margin": None if is_fin else safe(v.get("ebitda"), v.get("revenue")),
            "revenue_yoy": yoy,
        })

    # ---- coverage audit
    fields = list(INCOME) + list(BALANCE) + list(CASHFLOW)
    n_a = len(annual)
    field_cov = {f: sum(p["values"].get(f) is not None for p in annual) for f in fields}
    applicable = [k for k in K.REGISTRY if k.financials or not is_fin]
    kpi_cov = {}
    for k in applicable:
        kpi_cov[k.id] = len(kp[k.id]["values"])
    total_slots = sum(max(n_a - (1 if k.group == "Growth" else 0), 0) for k in applicable)
    filled = sum(kpi_cov.values())
    coverage = {
        "annual_periods": [p["label"] for p in annual],
        "quarterly_periods": [q["label"] for q in quarterly],
        "fields": field_cov,
        "kpis": kpi_cov,
        "kpi_completeness": round(filled / total_slots, 4) if total_slots else None,
        "price_rows": int(len(prices)),
        "price_start": snap.get("history_start"), "price_end": snap.get("last_date"),
        "ttm_available": bool(q4),
        "retrieved": {k: v.get("retrieved_at") for k, v in state.get(row.yahoo, {}).items()},
    }

    # ---- statements payload (canonical + full raw)
    def stmt_payload(periods, mapping):
        return {
            "periods": [p["label"] for p in periods], "ends": [p["end"] for p in periods],
            "rows": [{"key": f, "label": LABELS.get(f, f), "monetary": f not in NON_MONETARY,
                      "values": [p["values"].get(f) for p in periods],
                      "source": next((p["sources"].get(f) for p in reversed(periods) if p["sources"].get(f)), None)}
                     for f in mapping if any(p["values"].get(f) is not None for p in periods)],
        }

    statements = {}
    for basis, periods in (("annual", annual), ("quarterly", quarterly)):
        statements[basis] = {
            "income": stmt_payload(periods, INCOME),
            "balance": stmt_payload(periods, BALANCE),
            "cashflow": stmt_payload(periods, CASHFLOW),
        }
    raw = {f"{k}_{b}": raw_table(stmts.get(f"{k}_{b}")) for k in ("income", "balance", "cashflow") for b in ("annual", "quarterly")}

    profile = {k: info.get(k) for k in ("longName", "industry", "sector", "website", "fullTimeEmployees", "city", "country",
                                        "longBusinessSummary", "currency", "financialCurrency")}
    return {
        "symbol": sym, "yahoo": row.yahoo, "name": row["name"], "sector": row.sector, "isin": row["isin"],
        "industry": info.get("industry"), "yahoo_sector": info.get("sector"), "is_financial": is_fin,
        "profile": profile, "snapshot": snap, "valuation": valuation, "market": market,
        "annual": [{"label": p["label"], "end": p["end"], "values": p["values"]} for p in annual],
        "kpis": kp, "quarterly_metrics": q_metrics, "statements": statements, "raw_statements": raw,
        "coverage": coverage, "financial_currency": fin_ccy, "data_notes": data_notes,
    }


# ------------------------------------------------------------------ validation
def validate(c: dict) -> list[dict]:
    issues = []
    sym = c["symbol"]

    def add(check, status, detail):
        issues.append({"symbol": sym, "check": check, "status": status, "detail": detail})

    for p in c["annual"]:
        v = p["values"]
        ta, tl, te = v.get("total_assets"), v.get("total_liabilities"), v.get("total_equity")
        if None not in (ta, tl, te) and ta:
            gap = abs(ta - tl - te) / ta
            add(f"Balance identity {p['label']}", "pass" if gap < 0.01 else "warn",
                f"Assets − (Liabilities + Equity incl. minority) = {gap * 100:.2f}% of assets")
        o, i, f, ch = v.get("operating_cf"), v.get("investing_cf"), v.get("financing_cf"), v.get("change_in_cash")
        if None not in (o, i, f, ch):
            base = max(abs(o), abs(i), abs(f), 1)
            gap = abs(o + i + f - ch) / base
            add(f"Cash-flow identity {p['label']}", "pass" if gap < 0.05 else "warn",
                f"CFO + CFI + CFF − ΔCash = {gap * 100:.2f}% of largest flow (FX/other adjustments explain small gaps)")
        nm = v.get("net_income"), v.get("revenue")
        if None not in nm and nm[1] and abs(nm[0] / nm[1]) > 1.5:
            add(f"Net margin sanity {p['label']}", "warn", f"|Net income / revenue| = {abs(nm[0] / nm[1]):.2f}")
    val = c["valuation"]
    if val.get("pe") and val.get("yahoo_trailing_pe"):
        r = val["pe"] / val["yahoo_trailing_pe"] - 1
        add("P/E vs Yahoo trailing P/E", "pass" if abs(r) < 0.25 else "warn",
            f"Computed {val['pe']:.1f}× ({val['pe_basis']}) vs Yahoo {val['yahoo_trailing_pe']:.1f}× ({r * 100:+.0f}%)")
    # FY-end market cap reconstruction vs current market cap (checks split un-adjustment & share count)
    if c["annual"] and val.get("market_cap") and c["snapshot"].get("price"):
        L = c["annual"][-1]["values"]
        if L.get("shares_outstanding") and L.get("price_fy"):
            implied = L["shares_outstanding"] * c["snapshot"]["price"]
            ratio = implied / val["market_cap"]
            add("Share count consistency", "pass" if 0.85 < ratio < 1.15 else "warn",
                f"Latest balance-sheet shares × last price = {ratio:.2f}× quoted market cap")
    s = c["snapshot"]
    if s.get("price") is not None and s["price"] <= 0:
        add("Price sanity", "fail", "Non-positive last price")
    return issues


# ------------------------------------------------------------------ main
def build_all() -> None:
    uni, umeta = load_universe(refresh=False)
    state = load_state()
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")

    idx = load_prices(INDEX_TICKER)
    idx_adj = idx["Adj Close"].astype(float).dropna() if not idx.empty else None
    index_payload = {}
    if idx_adj is not None:
        index_payload = {
            "ticker": INDEX_TICKER, "name": "NIFTY 50", "snapshot": M.snapshot(idx), "returns": M.period_returns(idx_adj),
            "cagr": {f"{y}Y": M.cagr(idx_adj, y) for y in (3, 5, 10)}, "risk": M.risk_metrics(idx_adj, None),
            "calendar": M.calendar_returns(idx_adj), "monthly": M.monthly_returns(idx_adj),
            "basis": "Price index (Yahoo ^NSEI) — excludes dividends",
        }
        write(WEB_DATA / "prices" / "NIFTY50.json", M.compact_prices(idx))

    from .config import FX_TICKERS
    fx_series = {}
    for tk, ccy in FX_TICKERS.items():
        fxp = load_prices(tk)
        if not fxp.empty:
            fx_series[ccy] = fxp["Close"].astype(float).dropna()

    companies = []
    for _, row in uni.iterrows():
        stmts = {k: read_statement(row.yahoo, k) for k in
                 ("income_annual", "income_quarterly", "balance_annual", "balance_quarterly", "cashflow_annual", "cashflow_quarterly")}
        prices = load_prices(row.yahoo)
        info = load_info(row.yahoo)
        try:
            c = build_company(row, stmts, prices, info, idx_adj, state, fx_series)
        except Exception as exc:  # noqa: BLE001
            log.exception("Build failed for %s: %s", row.symbol, exc)
            continue
        companies.append(c)
        if not prices.empty:
            write(WEB_DATA / "prices" / f"{row.symbol}.json", M.compact_prices(prices))

    # ---- sector medians (latest fiscal year KPIs + returns)
    def latest_kpi(c, kid):
        vals = c["kpis"].get(kid, {}).get("values", {})
        return (vals[max(vals)], max(vals)) if vals else (None, None)

    sectors: dict[str, dict] = {}
    for sec in sorted({c["sector"] for c in companies}):
        members = [c for c in companies if c["sector"] == sec]
        med = {"n": len(members)}
        for kid in [k.id for k in K.REGISTRY]:
            med[kid] = median([latest_kpi(c, kid)[0] for c in members])
        med["pe_now"] = median([c["valuation"].get("pe") for c in members])
        med["pb_now"] = median([c["valuation"].get("pb") for c in members])
        for w in ("1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y"):
            med[f"ret_{w}"] = median([(c["market"].get("returns") or {}).get(w) for c in members])
        tot = sum(c["valuation"].get("market_cap") or 0 for c in members)
        wret = {}
        for w in ("1D", "1W", "1M", "3M", "YTD", "1Y"):
            num = sum((c["valuation"].get("market_cap") or 0) * r for c in members
                      if (r := (c["market"].get("returns") or {}).get(w)) is not None and c["valuation"].get("market_cap"))
            den = sum(c["valuation"].get("market_cap") or 0 for c in members
                      if (c["market"].get("returns") or {}).get(w) is not None and c["valuation"].get("market_cap"))
            wret[w] = num / den if den else None
        sectors[sec] = {"sector": sec, "count": len(members), "symbols": [c["symbol"] for c in members], "market_cap": tot,
                        "weighted_returns": wret, "medians": med}

    idx_returns = index_payload.get("returns", {})
    all_insights, validation = [], []
    for c in companies:
        c["insights"] = company_insights(c, sectors[c["sector"]]["medians"], idx_returns)
        all_insights.extend(c["insights"])
        validation.extend(validate(c))

    # ---- universe summary (one row per company)
    summary = []
    for c in companies:
        latest = {}
        for k in K.REGISTRY:
            v, fy = latest_kpi(c, k.id)
            latest[k.id] = v
            latest[f"{k.id}__fy"] = fy
        fund, fund_fy = {}, {}
        for f in ("revenue", "ebitda", "net_income", "total_assets", "equity", "total_debt", "cash_and_sti",
                  "operating_cf", "capex"):
            fund[f] = fund_fy[f] = None
            for p in reversed(c["annual"]):
                if p["values"].get(f) is not None:
                    fund[f], fund_fy[f] = p["values"][f], p["label"]
                    break
        rev_cagr, rev_span = None, None
        with_rev = [p for p in c["annual"] if p["values"].get("revenue")]
        if len(with_rev) >= 2:
            a0, a1 = with_rev[0], with_rev[-1]
            yrs = (pd.Timestamp(a1["end"]) - pd.Timestamp(a0["end"])).days / 365.25
            r0, r1 = a0["values"]["revenue"], a1["values"]["revenue"]
            if yrs >= 1.9 and r0 > 0 and r1 > 0:
                rev_cagr, rev_span = (r1 / r0) ** (1 / yrs) - 1, f"{a0['label']}–{a1['label']}"
        summary.append({
            "symbol": c["symbol"], "name": c["name"], "sector": c["sector"], "industry": c["industry"],
            "is_financial": c["is_financial"], "snapshot": c["snapshot"], "valuation": c["valuation"],
            "returns": c["market"].get("returns", {}), "cagr": c["market"].get("cagr", {}), "risk": c["market"].get("risk", {}),
            "calendar": c["market"].get("calendar", {}),
            "latest_fy": c["annual"][-1]["label"] if c["annual"] else None,
            "fundamentals": fund, "fundamentals_fy": fund_fy,
            "revenue_cagr": rev_cagr, "revenue_cagr_span": rev_span,
            "kpis": latest, "coverage": c["coverage"]["kpi_completeness"],
            "kpi_hist": {k.id: c["kpis"][k.id]["values"] for k in K.REGISTRY if c["kpis"][k.id]["values"]},
            "fund_hist": {f: {p["label"]: p["values"][f] for p in c["annual"] if p["values"].get(f) is not None}
                          for f in ("revenue", "ebitda", "ebit", "net_income", "total_assets", "equity", "total_debt",
                                    "cash_and_sti", "operating_cf", "capex", "market_cap_fy")},
            "insight_count": len(c["insights"]),
        })

    # ---- universe-level observations
    uni_obs = universe_observations(summary, sectors, index_payload)

    last_dates = [c["snapshot"].get("last_date") for c in companies if c["snapshot"].get("last_date")]
    meta = {
        "product": "Artha — NIFTY 50 Intelligence Terminal",
        "generated_at": generated, "source": SOURCE_NAME, "disclaimer": DISCLAIMER,
        "universe": umeta, "companies": len(companies), "price_as_of": max(last_dates) if last_dates else None,
        "price_as_of_min": min(last_dates) if last_dates else None,
        "fetch": state.get("_last_run", {}), "risk_free_rate": RISK_FREE_RATE,
        "units": "Monetary values are stored in INR (absolute rupees); the UI scales to ₹ Crore by default (1 Cr = 10^7).",
        "conventions": {
            "fiscal_year": "Indian fiscal year (April–March); FY2026 = year ended 31-Mar-2026.",
            "returns": "Total return from Yahoo 'Adj Close' (split- and dividend-adjusted). The NIFTY 50 index series is a price index.",
            "ratios": "Statement KPIs use annual figures and period-end balances. Current valuation multiples use TTM flows where four consecutive quarters are available, otherwise the latest fiscal year (basis shown on every figure).",
            "statement_basis": "As published by Yahoo Finance for the NSE listing (generally consolidated). Standalone vs consolidated basis cannot be verified via yfinance.",
            "missing": "Unavailable values are null and shown as '—' with a reason; they are never replaced by zero.",
        },
    }

    write(WEB_DATA / "meta.json", meta)
    write(WEB_DATA / "universe.json", summary)
    write(WEB_DATA / "index.json", index_payload)
    write(WEB_DATA / "sectors.json", list(sectors.values()))
    write(WEB_DATA / "kpi_dictionary.json", K.dictionary())
    write(WEB_DATA / "insights.json", {"companies": all_insights, "universe": uni_obs})
    write(WEB_DATA / "validation.json", validation)
    write(WEB_DATA / "coverage.json", [{"symbol": c["symbol"], "name": c["name"], "sector": c["sector"],
                                         "is_financial": c["is_financial"], **c["coverage"]} for c in companies])
    for c in companies:
        write(WEB_DATA / "companies" / f"{c['symbol']}.json", c)
    n_warn = sum(1 for v in validation if v["status"] != "pass")
    log.info("Built %d companies, %d insights, %d validation checks (%d warnings)", len(companies), len(all_insights),
             len(validation), n_warn)


def universe_observations(summary: list[dict], sectors: dict, index_payload: dict) -> list[dict]:
    out = []
    above = [s for s in summary if s["snapshot"].get("price") and s["snapshot"].get("ma200")]
    n_above = sum(1 for s in above if s["snapshot"]["price"] > s["snapshot"]["ma200"])
    if above:
        out.append({"title": "Market breadth", "tone": "positive" if n_above / len(above) > 0.6 else ("negative" if n_above / len(above) < 0.4 else "neutral"),
                    "fact": f"{n_above} of {len(above)} constituents trade above their 200-day moving average.",
                    "evidence": [{"label": "Above 200-DMA", "value": n_above, "unit": "n"}, {"label": "Constituents", "value": len(above), "unit": "n"}]})
    secs = [(k, v["weighted_returns"].get("1Y")) for k, v in sectors.items() if v["weighted_returns"].get("1Y") is not None]
    if secs:
        best, worst = max(secs, key=lambda x: x[1]), min(secs, key=lambda x: x[1])
        out.append({"title": "Sector leadership (1Y)", "tone": "neutral",
                    "fact": f"{best[0]} led with a {best[1] * 100:+.1f}% cap-weighted 1-year return; {worst[0]} lagged at {worst[1] * 100:+.1f}%.",
                    "evidence": [{"label": best[0], "value": best[1], "unit": "pct"}, {"label": worst[0], "value": worst[1], "unit": "pct"}]})
    ir = (index_payload.get("returns") or {}).get("1Y")
    r1 = [s["returns"].get("1Y") for s in summary if s["returns"].get("1Y") is not None]
    if ir is not None and r1:
        beat = sum(1 for r in r1 if r > ir)
        out.append({"title": "Constituents vs index", "tone": "neutral",
                    "fact": f"{beat} of {len(r1)} constituents beat the NIFTY 50's {ir * 100:+.1f}% 1-year price return (on a total-return basis).",
                    "evidence": [{"label": "NIFTY 50 1Y", "value": ir, "unit": "pct"}, {"label": "Beat index", "value": beat, "unit": "n"}]})
    pes = [s["valuation"].get("pe") for s in summary if s["valuation"].get("pe")]
    if pes:
        out.append({"title": "Valuation", "tone": "neutral",
                    "fact": f"Median constituent P/E is {statistics.median(pes):.1f}× (range {min(pes):.1f}×–{max(pes):.1f}×, {len(pes)} companies with positive earnings).",
                    "evidence": [{"label": "Median P/E", "value": statistics.median(pes), "unit": "x"}]})
    roes = [(s["symbol"], s["kpis"].get("roe")) for s in summary if s["kpis"].get("roe") is not None]
    if roes:
        top = sorted(roes, key=lambda x: -x[1])[:3]
        out.append({"title": "Highest return on equity", "tone": "positive",
                    "fact": "Top ROE (latest fiscal year): " + ", ".join(f"{s} {v * 100:.1f}%" for s, v in top) + ".",
                    "evidence": [{"label": s, "value": v, "unit": "pct"} for s, v in top]})
    return out
