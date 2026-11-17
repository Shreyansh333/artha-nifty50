"""Deterministic financial-intelligence engine.

Every observation is produced by an explicit rule over computed numbers — no language model
is involved. Each observation carries:
  * fact            — a statement that is directly verifiable from the evidence numbers
  * interpretation  — an optional, clearly-labelled analytical reading (NOT investment advice)
  * evidence        — the exact inputs used, with units and periods
  * rule            — the rule id and its threshold, so the logic is auditable
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from .kpis import consecutive_years


def years_between(a: str, b: str) -> float:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days / 365.25


def pct(x: Optional[float], dp: int = 1) -> str:
    return "n/a" if x is None else f"{x * 100:+.{dp}f}%"


def pp(x: float) -> str:
    return f"{x * 100:+.1f} pp"


def cr(x: Optional[float]) -> str:
    return "n/a" if x is None else f"₹{x / 1e7:,.0f} Cr"


def _obs(sym, rule, category, tone, title, fact, evidence, period, interpretation=None, threshold=None, weight=1.0):
    return {
        "symbol": sym, "rule": rule, "category": category, "tone": tone, "title": title, "fact": fact,
        "interpretation": interpretation, "evidence": evidence, "period": period, "threshold": threshold,
        "weight": weight,
    }


def _ev(label, value, unit):
    return {"label": label, "value": value, "unit": unit}


def company_insights(c: dict, sector_medians: dict, index_returns: dict) -> list[dict]:
    """c = company payload built in build.py (annual values, kpis, market, snapshot)."""
    sym, out = c["symbol"], []
    annual = c["annual"]                     # list of {label, values} oldest→newest
    k = c["kpis"]
    fin = c["is_financial"]
    if len(annual) >= 2:
        L, P = annual[-1], annual[-2]
        lv, pv, ly, py = L["values"], P["values"], L["label"], P["label"]
        consecutive = consecutive_years(P, L)
    else:
        consecutive = False

    def kv(kid, label):
        return k.get(kid, {}).get("values", {}).get(label)

    if consecutive:
        rg, ng = kv("revenue_growth", ly), kv("net_income_growth", ly)
        if rg is not None and ng is not None:
            if rg > 0 and ng < 0:
                out.append(_obs(sym, "rev_up_profit_down", "Growth", "negative",
                                "Revenue grew while net profit declined",
                                f"In {ly}, revenue rose {pct(rg)} but net profit fell {pct(ng)} versus {py}.",
                                [_ev(f"Revenue {py}", pv.get("revenue"), "inr"), _ev(f"Revenue {ly}", lv.get("revenue"), "inr"),
                                 _ev(f"Net profit {py}", pv.get("net_income"), "inr"), _ev(f"Net profit {ly}", lv.get("net_income"), "inr")],
                                ly, "Costs, interest, tax or one-off items absorbed the top-line gains; margin pressure warrants scrutiny.",
                                "revenue growth > 0 and net profit growth < 0", 1.4))
            elif rg < 0 and ng > 0:
                out.append(_obs(sym, "rev_down_profit_up", "Growth", "neutral",
                                "Profit rose despite lower revenue",
                                f"In {ly}, revenue fell {pct(rg)} while net profit rose {pct(ng)}.",
                                [_ev(f"Revenue growth {ly}", rg, "pct"), _ev(f"Net profit growth {ly}", ng, "pct")],
                                ly, "Earnings growth came from cost efficiency or non-operating items rather than demand — check sustainability.",
                                "revenue growth < 0 and net profit growth > 0", 1.1))
            elif rg > 0.15 and ng > 0.15:
                out.append(_obs(sym, "strong_growth", "Growth", "positive", "Double-digit growth on both lines",
                                f"In {ly}, revenue grew {pct(rg)} and net profit grew {pct(ng)}.",
                                [_ev(f"Revenue growth {ly}", rg, "pct"), _ev(f"Net profit growth {ly}", ng, "pct")],
                                ly, None, "revenue and net profit growth both > 15%", 1.0))
        eg = kv("eps_growth", ly)
        if eg is not None and ng is not None and abs(eg - ng) > 0.05:
            out.append(_obs(sym, "eps_vs_profit", "Growth", "negative" if eg < ng else "positive",
                            "EPS growth diverged from profit growth",
                            f"{ly} diluted EPS growth was {pct(eg)} versus net profit growth of {pct(ng)}.",
                            [_ev("EPS growth", eg, "pct"), _ev("Net profit growth", ng, "pct")], ly,
                            "A gap usually reflects a change in share count (issuance dilutes; buybacks concentrate).",
                            "|EPS growth − profit growth| > 5 pp", 0.7))

        # margin shift
        mk = "net_margin" if fin else "ebit_margin"
        m1, m0 = kv(mk, ly), kv(mk, py)
        if m1 is not None and m0 is not None and abs(m1 - m0) >= 0.02:
            name = "Net margin" if fin else "Operating (EBIT) margin"
            up = m1 > m0
            out.append(_obs(sym, "margin_shift", "Profitability", "positive" if up else "negative",
                            f"{name} {'expanded' if up else 'contracted'} {abs(m1 - m0) * 100:.1f} pp",
                            f"{name} moved from {m0 * 100:.1f}% in {py} to {m1 * 100:.1f}% in {ly} ({pp(m1 - m0)}).",
                            [_ev(f"{name} {py}", m0, "pct"), _ev(f"{name} {ly}", m1, "pct")], ly,
                            "Operating leverage or pricing power improved." if up else "Cost inflation or pricing pressure is eroding profitability.",
                            "|Δ margin| ≥ 2 pp", 1.2))

        # leverage
        d1, d0, e1, e0 = lv.get("total_debt"), pv.get("total_debt"), lv.get("equity"), pv.get("equity")
        if None not in (d1, d0, e1, e0) and d0 > 0 and e0 > 0:
            dg, eg2 = d1 / d0 - 1, e1 / e0 - 1
            if dg > 0.10 and dg > eg2 + 0.10:
                out.append(_obs(sym, "debt_outpaces_equity", "Leverage", "negative",
                                "Debt grew faster than equity",
                                f"Total debt rose {pct(dg)} in {ly} while shareholders' equity rose {pct(eg2)}.",
                                [_ev(f"Debt {py}", d0, "inr"), _ev(f"Debt {ly}", d1, "inr"),
                                 _ev(f"Equity {py}", e0, "inr"), _ev(f"Equity {ly}", e1, "inr")], ly,
                                "Balance-sheet leverage is rising; returns are increasingly debt-funded.",
                                "debt growth > 10% and > equity growth + 10 pp", 1.2))
            elif dg < -0.10 and eg2 > 0:
                out.append(_obs(sym, "deleveraging", "Leverage", "positive", "Deleveraging",
                                f"Total debt fell {pct(dg)} in {ly} while equity grew {pct(eg2)}.",
                                [_ev(f"Debt {py}", d0, "inr"), _ev(f"Debt {ly}", d1, "inr"), _ev("Equity growth", eg2, "pct")], ly,
                                "Financial risk is reducing.", "debt growth < −10% and equity growth > 0", 1.0))

    if annual:
        L = annual[-1]
        ly, lv = L["label"], L["values"]
        cc = kv("cash_conversion", ly)
        if not fin and cc is not None:
            if cc < 0.7:
                out.append(_obs(sym, "cash_divergence", "Cash Flow", "negative",
                                "Operating cash flow lagged reported profit",
                                f"{ly} operating cash flow was {cc:.2f}× net profit ({cr(lv.get('operating_cf'))} vs {cr(lv.get('net_income'))}).",
                                [_ev("Operating cash flow", lv.get("operating_cf"), "inr"), _ev("Net profit", lv.get("net_income"), "inr"),
                                 _ev("CFO / Net profit", cc, "x")], ly,
                                "Profits are not fully converting to cash — check working-capital build-up and receivables.",
                                "CFO / net profit < 0.7×", 1.3))
            elif cc > 1.5:
                out.append(_obs(sym, "cash_strong", "Cash Flow", "positive", "Cash generation exceeded reported profit",
                                f"{ly} operating cash flow was {cc:.2f}× net profit.",
                                [_ev("Operating cash flow", lv.get("operating_cf"), "inr"), _ev("Net profit", lv.get("net_income"), "inr")], ly,
                                "High earnings quality; non-cash charges (depreciation) are large relative to profit.",
                                "CFO / net profit > 1.5×", 0.8))
        ni, ocf = lv.get("net_income"), lv.get("operating_cf")
        if not fin and ni is not None and ocf is not None and ni > 0 and ocf < 0:
            out.append(_obs(sym, "profit_negative_cfo", "Cash Flow", "negative", "Profitable but cash-negative operations",
                            f"{ly} net profit was {cr(ni)} while operating cash flow was {cr(ocf)}.",
                            [_ev("Net profit", ni, "inr"), _ev("Operating cash flow", ocf, "inr")], ly, None, "NI > 0 and CFO < 0", 1.5))
        f = kv("fcf", ly)
        if not fin and f is not None and f < 0:
            ci = kv("capex_intensity", ly)
            out.append(_obs(sym, "negative_fcf", "Cash Flow", "neutral", "Negative free cash flow",
                            f"{ly} free cash flow was {cr(f)}" + (f", with capex at {ci * 100:.1f}% of revenue." if ci else "."),
                            [_ev("Free cash flow", f, "inr"), _ev("Capex / revenue", ci, "pct")], ly,
                            "Investment is running ahead of internal cash generation, funded by debt, equity or cash reserves.",
                            "FCF < 0", 0.9))
        ic = kv("interest_coverage", ly)
        if ic is not None and ic < 3:
            out.append(_obs(sym, "low_coverage", "Leverage", "negative", "Thin interest coverage",
                            f"{ly} EBIT covered interest expense {ic:.1f}×.",
                            [_ev("EBIT", lv.get("ebit"), "inr"), _ev("Interest expense", lv.get("interest_expense"), "inr"),
                             _ev("Coverage", ic, "x")], ly, "Limited buffer if earnings weaken or rates rise.", "EBIT / interest < 3×", 1.1))
        dp_ = kv("dividend_payout", ly)
        if dp_ is not None and dp_ > 0.8:
            out.append(_obs(sym, "high_payout", "Cash Flow", "neutral", "High dividend payout",
                            f"Dividends paid in {ly} were {dp_ * 100:.0f}% of net profit.",
                            [_ev("Dividends paid", lv.get("dividends_paid"), "inr"), _ev("Net profit", lv.get("net_income"), "inr")], ly,
                            "Shareholder-friendly, but leaves little profit for reinvestment.", "payout > 80%", 0.6))

        # multi-year revenue CAGR
        if len(annual) >= 3:
            F = annual[0]
            yrs = round(years_between(F["end"], L["end"]), 2)
            r0, r1 = F["values"].get("revenue"), lv.get("revenue")
            if yrs >= 2 and r0 and r1 and r0 > 0 and r1 > 0:
                g = (r1 / r0) ** (1 / yrs) - 1
                out.append(_obs(sym, "revenue_cagr", "Growth", "positive" if g > 0.12 else ("negative" if g < 0 else "neutral"),
                                f"Revenue CAGR {g * 100:.1f}% ({F['label']}–{ly})",
                                f"Revenue compounded at {g * 100:.1f}% a year from {cr(r0)} in {F['label']} to {cr(r1)} in {ly}.",
                                [_ev(f"Revenue {F['label']}", r0, "inr"), _ev(f"Revenue {ly}", r1, "inr"), _ev("Years", yrs, "n")], ly,
                                None, "reported for every company with ≥ 2 years span", 0.5))

        # ROE vs sector
        roe, med = kv("roe", ly), sector_medians.get("roe")
        if roe is not None and med is not None and sector_medians.get("n", 0) >= 3 and abs(roe - med) >= 0.05:
            above = roe > med
            out.append(_obs(sym, "roe_vs_sector", "Profitability", "positive" if above else "negative",
                            f"ROE {'above' if above else 'below'} sector median",
                            f"{ly} ROE of {roe * 100:.1f}% is {abs(roe - med) * 100:.1f} pp {'above' if above else 'below'} the "
                            f"{c['sector']} median of {med * 100:.1f}%.",
                            [_ev("Company ROE", roe, "pct"), _ev("Sector median ROE", med, "pct")], ly, None, "|ROE − sector median| ≥ 5 pp", 0.9))

        # valuation re-rating across fiscal years
        pes = k.get("pe", {}).get("values", {})
        if len(pes) >= 2:
            labs = sorted(pes)
            a, b = pes[labs[0]], pes[labs[-1]]
            ch = b / a - 1
            if abs(ch) > 0.3:
                out.append(_obs(sym, "pe_rerating", "Valuation", "neutral",
                                f"P/E {'re-rated' if ch > 0 else 'de-rated'} {abs(ch) * 100:.0f}%",
                                f"Fiscal-year-end P/E moved from {a:.1f}× ({labs[0]}) to {b:.1f}× ({labs[-1]}).",
                                [_ev(f"P/E {labs[0]}", a, "x"), _ev(f"P/E {labs[-1]}", b, "x")], labs[-1],
                                "The market is paying " + ("more" if ch > 0 else "less") + " per rupee of earnings than before.",
                                "|Δ P/E| > 30%", 0.9))

    # current valuation vs sector
    sv = c.get("valuation", {})
    pe_now, pe_med = sv.get("pe"), sector_medians.get("pe_now")
    if pe_now and pe_med and sector_medians.get("n", 0) >= 3 and abs(pe_now / pe_med - 1) > 0.3:
        prem = pe_now / pe_med - 1
        out.append(_obs(sym, "pe_vs_sector", "Valuation", "neutral",
                        f"Trades at a {abs(prem) * 100:.0f}% P/E {'premium' if prem > 0 else 'discount'} to sector",
                        f"Current P/E of {pe_now:.1f}× ({sv.get('pe_basis')}) versus a {c['sector']} median of {pe_med:.1f}×.",
                        [_ev("Company P/E", pe_now, "x"), _ev("Sector median P/E", pe_med, "x")], "Current", None, "|premium| > 30%", 0.8))

    # market performance
    m = c.get("market", {})
    r1 = (m.get("returns") or {}).get("1Y")
    sm = sector_medians.get("ret_1Y")
    if r1 is not None:
        if sm is not None and sector_medians.get("n", 0) >= 3 and abs(r1 - sm) > 0.10:
            out.append(_obs(sym, "vs_sector_1y", "Market", "positive" if r1 > sm else "negative",
                            f"{'Outperformed' if r1 > sm else 'Underperformed'} its sector over 1 year",
                            f"1-year total return of {pct(r1)} versus a {c['sector']} median of {pct(sm)}.",
                            [_ev("Company 1Y return", r1, "pct"), _ev("Sector median 1Y return", sm, "pct")], "Trailing 1Y", None,
                            "|difference| > 10 pp", 1.0))
        ir = index_returns.get("1Y")
        if ir is not None and abs(r1 - ir) > 0.15:
            out.append(_obs(sym, "vs_index_1y", "Market", "positive" if r1 > ir else "negative",
                            f"{'Beat' if r1 > ir else 'Lagged'} the NIFTY 50 by {abs(r1 - ir) * 100:.0f} pp",
                            f"1-year total return of {pct(r1)} versus {pct(ir)} for the NIFTY 50 index (price).",
                            [_ev("Company 1Y return", r1, "pct"), _ev("NIFTY 50 1Y", ir, "pct")], "Trailing 1Y", None, "|difference| > 15 pp", 0.8))
    s = c.get("snapshot", {})
    if s.get("price") and s.get("high_52w") and s["price"] >= 0.97 * s["high_52w"]:
        out.append(_obs(sym, "near_52w_high", "Market", "positive", "Trading near its 52-week high",
                        f"Last close ₹{s['price']:,.2f} is within 3% of the 52-week high of ₹{s['high_52w']:,.2f}.",
                        [_ev("Price", s["price"], "inr_ps"), _ev("52W high", s["high_52w"], "inr_ps")], s["last_date"], None, "price ≥ 97% of 52W high", 0.7))
    if s.get("price") and s.get("low_52w") and s["price"] <= 1.05 * s["low_52w"]:
        out.append(_obs(sym, "near_52w_low", "Market", "negative", "Trading near its 52-week low",
                        f"Last close ₹{s['price']:,.2f} is within 5% of the 52-week low of ₹{s['low_52w']:,.2f}.",
                        [_ev("Price", s["price"], "inr_ps"), _ev("52W low", s["low_52w"], "inr_ps")], s["last_date"], None, "price ≤ 105% of 52W low", 0.8))
    if s.get("price") and s.get("ma200"):
        gap = s["price"] / s["ma200"] - 1
        if abs(gap) > 0.08:
            out.append(_obs(sym, "vs_200dma", "Market", "positive" if gap > 0 else "negative",
                            f"{abs(gap) * 100:.0f}% {'above' if gap > 0 else 'below'} the 200-day average",
                            f"Price ₹{s['price']:,.2f} vs 200-day moving average ₹{s['ma200']:,.2f}.",
                            [_ev("Price", s["price"], "inr_ps"), _ev("200-DMA", s["ma200"], "inr_ps")], s["last_date"],
                            "Long-term trend is " + ("up." if gap > 0 else "down."), "|gap| > 8%", 0.5))
    cd = (m.get("risk") or {}).get("current_drawdown")
    if cd is not None and cd < -0.30:
        out.append(_obs(sym, "deep_drawdown", "Risk", "negative", f"{abs(cd) * 100:.0f}% below all-time high",
                        f"Adjusted price is {abs(cd) * 100:.1f}% below its all-time high.",
                        [_ev("Current drawdown", cd, "pct")], s.get("last_date"), None, "drawdown < −30%", 0.9))
    return out
