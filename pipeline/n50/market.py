"""Market-performance analytics from daily price history.

Returns use Yahoo 'Adj Close' (adjusted for splits AND dividends) → total-return basis.
52-week range and moving averages use split-adjusted 'Close'/'High'/'Low' (price basis).
"""
from __future__ import annotations

import math
from typing import Optional

import numpy as np
import pandas as pd

from .config import RISK_FREE_RATE, TRADING_DAYS


def _f(x) -> Optional[float]:
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else round(x, 6)


def asof(series: pd.Series, date: pd.Timestamp) -> Optional[float]:
    s = series.loc[:date]
    return None if s.empty else float(s.iloc[-1])


WINDOWS = {  # label -> DateOffset
    "1W": pd.DateOffset(weeks=1), "1M": pd.DateOffset(months=1), "3M": pd.DateOffset(months=3),
    "6M": pd.DateOffset(months=6), "1Y": pd.DateOffset(years=1), "3Y": pd.DateOffset(years=3),
    "5Y": pd.DateOffset(years=5), "10Y": pd.DateOffset(years=10),
}


def period_returns(adj: pd.Series) -> dict:
    last_date, last = adj.index[-1], float(adj.iloc[-1])
    first_date = adj.index[0]
    out = {}
    for k, off in WINDOWS.items():
        start = last_date - off
        if start < first_date:
            out[k] = None
            continue
        base = asof(adj, start)
        out[k] = _f(last / base - 1) if base else None
    ytd_base = asof(adj, pd.Timestamp(year=last_date.year, month=1, day=1) - pd.Timedelta(days=1))
    out["YTD"] = _f(last / ytd_base - 1) if ytd_base and pd.Timestamp(year=last_date.year, month=1, day=1) > first_date else None
    out["1D"] = _f(last / float(adj.iloc[-2]) - 1) if len(adj) > 1 else None
    return out


def cagr(adj: pd.Series, years: int) -> Optional[float]:
    last_date = adj.index[-1]
    start = last_date - pd.DateOffset(years=years)
    if start < adj.index[0]:
        return None
    base = asof(adj, start)
    return _f((float(adj.iloc[-1]) / base) ** (1 / years) - 1) if base else None


def max_drawdown(adj: pd.Series) -> tuple[Optional[float], Optional[str], Optional[str]]:
    if adj.empty:
        return None, None, None
    peak = adj.cummax()
    dd = adj / peak - 1
    trough = dd.idxmin()
    peak_date = adj.loc[:trough].idxmax()
    return _f(dd.min()), str(peak_date.date()), str(trough.date())


def drawdown_series(adj: pd.Series) -> pd.Series:
    return adj / adj.cummax() - 1


def risk_metrics(adj: pd.Series, bench: Optional[pd.Series]) -> dict:
    r = np.log(adj).diff().dropna()
    out = {}
    for label, yrs in (("1Y", 1), ("3Y", 3), ("5Y", 5)):
        start = adj.index[-1] - pd.DateOffset(years=yrs)
        if start < adj.index[0]:
            out[f"vol_{label}"] = None
            continue
        rr = r.loc[start:]
        out[f"vol_{label}"] = _f(rr.std() * math.sqrt(TRADING_DAYS))
    # Sharpe / Sortino on 3Y (fallback 1Y) — CAGR basis, disclosed risk-free assumption
    for label, yrs in (("3Y", 3), ("1Y", 1)):
        c, v = cagr(adj, yrs), out.get(f"vol_{label}")
        start = adj.index[-1] - pd.DateOffset(years=yrs)
        if c is not None and v:
            out[f"sharpe_{label}"] = _f((c - RISK_FREE_RATE) / v)
            neg = r.loc[start:]
            neg = neg[neg < 0]
            dv = neg.std() * math.sqrt(TRADING_DAYS) if len(neg) > 10 else None
            out[f"sortino_{label}"] = _f((c - RISK_FREE_RATE) / dv) if dv else None
        else:
            out[f"sharpe_{label}"] = out[f"sortino_{label}"] = None
    mdd, pk, tr = max_drawdown(adj)
    out.update(max_drawdown=mdd, mdd_peak=pk, mdd_trough=tr)
    five = adj.loc[adj.index[-1] - pd.DateOffset(years=5):]
    out["max_drawdown_5Y"] = max_drawdown(five)[0] if adj.index[0] <= adj.index[-1] - pd.DateOffset(years=5) else None
    out["current_drawdown"] = _f(adj.iloc[-1] / adj.max() - 1)
    # Beta / correlation vs NIFTY 50 over 3Y (fallback: available overlap ≥ 1Y)
    out["beta_3Y"] = out["corr_3Y"] = None
    if bench is not None and not bench.empty:
        b = np.log(bench).diff().dropna()
        start = adj.index[-1] - pd.DateOffset(years=3)
        j = pd.concat([r.loc[start:], b.loc[start:]], axis=1, join="inner").dropna()
        if len(j) >= 200:
            cov = np.cov(j.iloc[:, 0], j.iloc[:, 1])
            out["beta_3Y"] = _f(cov[0, 1] / cov[1, 1])
            out["corr_3Y"] = _f(np.corrcoef(j.iloc[:, 0], j.iloc[:, 1])[0, 1])
    return out


def calendar_returns(adj: pd.Series, years: int = 11) -> dict:
    ye = adj.groupby(adj.index.year).last()
    out = {}
    first_year = adj.index[0].year
    for y in ye.index[-years:]:
        prev = ye.get(y - 1)
        if prev is None or y - 1 < first_year:
            continue
        out[str(y)] = _f(ye[y] / prev - 1)
    return out


def monthly_returns(adj: pd.Series, years: int = 10) -> dict:
    me = adj.groupby([adj.index.year, adj.index.month]).last()
    me.index = [f"{y}-{m:02d}" for y, m in me.index]
    r = me.pct_change().dropna()
    cutoff = f"{adj.index[-1].year - years}-01"
    return {k: _f(v) for k, v in r.items() if k >= cutoff}


def raw_close_series(h: pd.DataFrame) -> pd.Series:
    """Undo Yahoo's split adjustment: raw(t) = Close(t) × Π split ratios occurring after t."""
    splits = h["Stock Splits"].fillna(0).astype(float)
    splits = splits.where(splits > 0, 1.0)
    # factor for date t = product of splits strictly after t
    after = splits[::-1].cumprod()[::-1].shift(-1).fillna(1.0)
    return h["Close"].astype(float) * after


def snapshot(h: pd.DataFrame) -> dict:
    close = h["Close"].astype(float)
    last_date = close.index[-1]
    yr = h.loc[last_date - pd.DateOffset(years=1):]
    ma50 = close.rolling(50).mean().iloc[-1] if len(close) >= 50 else None
    ma200 = close.rolling(200).mean().iloc[-1] if len(close) >= 200 else None
    vol3m = h.loc[last_date - pd.DateOffset(months=3):]
    divs = h["Dividends"].fillna(0).astype(float).loc[last_date - pd.DateOffset(years=1):]
    return {
        "last_date": str(last_date.date()),
        "price": _f(close.iloc[-1]),
        "prev_close": _f(close.iloc[-2]) if len(close) > 1 else None,
        "change": _f(close.iloc[-1] - close.iloc[-2]) if len(close) > 1 else None,
        "high_52w": _f(yr["High"].max()),
        "low_52w": _f(yr["Low"].min()),
        "ma50": _f(ma50),
        "ma200": _f(ma200),
        "avg_volume_3m": _f(vol3m["Volume"].mean()),
        "avg_traded_value_3m": _f((vol3m["Volume"] * vol3m["Close"]).mean()),
        "dps_ttm": _f(divs.sum()) if len(divs) else None,
        "history_start": str(close.index[0].date()),
        "history_years": _f((last_date - close.index[0]).days / 365.25),
    }


def compact_prices(h: pd.DataFrame) -> dict:
    """Columnar daily OHLCV for the web client."""
    def col(c, nd=2):
        return [None if pd.isna(v) else round(float(v), nd) for v in h[c]]
    return {
        "d": [d.strftime("%Y-%m-%d") for d in h.index],
        "o": col("Open"), "h": col("High"), "l": col("Low"), "c": col("Close"),
        "a": [None if pd.isna(v) or float(v) <= 0 else round(float(v), 4) for v in h["Adj Close"]],
        "v": [None if pd.isna(v) else int(v) for v in h["Volume"]],
    }
