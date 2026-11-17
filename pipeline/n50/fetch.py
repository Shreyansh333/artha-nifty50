"""yfinance acquisition layer: caching, retries, incremental updates.

Design
------
* Prices: cached per ticker as CSV. Subsequent runs download only the last
  PRICE_OVERLAP_DAYS days and merge. If the overlap window shows a split/dividend or the
  adjusted closes no longer match the cache (Yahoo re-adjusts history after corporate
  actions), the full history is re-downloaded so adjusted series stay internally consistent.
* Statements: cached per ticker and statement type. Yahoo only exposes ~4-5 annual and
  ~5-6 quarterly periods, so each refresh is MERGED into the cache (new values win for the
  same period). Over time the cache accumulates more history than a single yfinance call returns.
* Info: quote/profile snapshot cached as JSON with a TTL.
* Every call retries with exponential backoff (rate limits / transient errors).
* fetch_state.json records, per ticker and dataset, the last successful retrieval time.
"""
from __future__ import annotations

import json
import random
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, TypeVar

import pandas as pd
import yfinance as yf

from .config import (
    FETCH_STATE,
    INFO_CACHE,
    INFO_TTL_HOURS,
    PRICE_CACHE,
    PRICE_OVERLAP_DAYS,
    STATEMENT_CACHE,
    STATEMENT_TTL_DAYS,
)
from .log import get_logger

log = get_logger("n50.fetch")
T = TypeVar("T")
_state_lock = threading.Lock()

STATEMENTS = {
    "income_annual": lambda t: t.income_stmt,
    "income_quarterly": lambda t: t.quarterly_income_stmt,
    "balance_annual": lambda t: t.balance_sheet,
    "balance_quarterly": lambda t: t.quarterly_balance_sheet,
    "cashflow_annual": lambda t: t.cashflow,
    "cashflow_quarterly": lambda t: t.quarterly_cashflow,
}

INFO_KEYS = [
    "longName", "shortName", "sector", "industry", "website", "longBusinessSummary", "fullTimeEmployees",
    "city", "country", "currency", "financialCurrency", "exchange", "marketCap", "enterpriseValue",
    "sharesOutstanding", "floatShares", "beta", "trailingPE", "forwardPE", "priceToBook", "trailingEps",
    "bookValue", "dividendYield", "trailingAnnualDividendYield", "payoutRatio", "fiftyTwoWeekHigh",
    "fiftyTwoWeekLow", "fiftyDayAverage", "twoHundredDayAverage", "averageVolume", "regularMarketPrice",
    "previousClose", "ebitda", "totalDebt", "totalCash", "returnOnEquity", "returnOnAssets",
    "profitMargins", "operatingMargins", "revenueGrowth", "earningsGrowth", "heldPercentInsiders",
    "heldPercentInstitutions", "recommendationKey", "lastFiscalYearEnd", "mostRecentQuarter",
]


# --------------------------------------------------------------------------- helpers
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def load_state() -> dict:
    if FETCH_STATE.exists():
        return json.loads(FETCH_STATE.read_text())
    return {}


def save_state(state: dict) -> None:
    with _state_lock:
        FETCH_STATE.write_text(json.dumps(state, indent=1, sort_keys=True))


def mark(state: dict, ticker: str, dataset: str, **extra) -> None:
    with _state_lock:
        state.setdefault(ticker, {})[dataset] = {"retrieved_at": now_utc().isoformat(timespec="seconds"), **extra}


def is_fresh(state: dict, ticker: str, dataset: str, ttl: timedelta) -> bool:
    rec = state.get(ticker, {}).get(dataset)
    if not rec:
        return False
    return now_utc() - datetime.fromisoformat(rec["retrieved_at"]) < ttl


def retry(fn: Callable[[], T], what: str, attempts: int = 5, base: float = 2.0) -> T:
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            last = exc
            rate = "Rate" in type(exc).__name__ or "429" in str(exc) or "Too Many" in str(exc)
            wait = base ** (i + (2 if rate else 0)) + random.uniform(0, 1)
            log.warning("%s failed (attempt %d/%d): %s — retrying in %.1fs", what, i + 1, attempts, exc, wait)
            time.sleep(wait)
    raise RuntimeError(f"{what} failed after {attempts} attempts: {last}")


# --------------------------------------------------------------------------- prices
def _clean_history(h: pd.DataFrame) -> pd.DataFrame:
    if h is None or h.empty:
        return pd.DataFrame()
    h = h.copy()
    h.index = pd.to_datetime(h.index).tz_localize(None).normalize()
    h.index.name = "Date"
    cols = ["Open", "High", "Low", "Close", "Adj Close", "Volume", "Dividends", "Stock Splits"]
    for c in cols:
        if c not in h.columns:
            h[c] = pd.NA
    h = h[cols]
    # Yahoo occasionally emits rows with no close (holidays/partial). Drop them — never zero-fill.
    h = h[h["Close"].notna() & (h["Close"] > 0)]
    return h[~h.index.duplicated(keep="last")].sort_index()


def fetch_prices(ticker: str, state: dict, force_full: bool = False) -> tuple[pd.DataFrame, str]:
    """Return (history, mode) where mode is 'full', 'incremental' or 'cached'."""
    path = PRICE_CACHE / f"{ticker.replace('^', '_')}.csv"
    t = yf.Ticker(ticker)
    cached = pd.read_csv(path, parse_dates=["Date"], index_col="Date") if path.exists() else None

    def full() -> pd.DataFrame:
        h = retry(lambda: t.history(period="max", auto_adjust=False, actions=True), f"{ticker} history(max)")
        h = _clean_history(h)
        if h.empty:
            raise RuntimeError(f"{ticker}: empty price history")
        return h

    mode = "full"
    if cached is None or cached.empty or force_full:
        hist = full()
    else:
        start = (cached.index.max() - timedelta(days=PRICE_OVERLAP_DAYS)).strftime("%Y-%m-%d")
        recent = _clean_history(
            retry(lambda: t.history(start=start, auto_adjust=False, actions=True), f"{ticker} history({start}→)")
        )
        if recent.empty:
            return cached, "cached"
        overlap = recent.index.intersection(cached.index)
        corporate_action = bool(
            (recent["Stock Splits"].fillna(0) != 0).any() or (recent["Dividends"].fillna(0) != 0).any()
        )
        drift = False
        if len(overlap):
            a = cached.loc[overlap, "Adj Close"].astype(float)
            b = recent.loc[overlap, "Adj Close"].astype(float)
            drift = bool(((a - b).abs() / b).max() > 0.001)
        if corporate_action or drift:
            log.info("%s: corporate action / adjustment drift detected → full re-download", ticker)
            hist = full()
        else:
            hist = pd.concat([cached[~cached.index.isin(recent.index)], recent]).sort_index()
            mode = "incremental"
    hist.to_csv(path)
    mark(state, ticker, "prices", mode=mode, rows=int(len(hist)),
         first=str(hist.index.min().date()), last=str(hist.index.max().date()))
    return hist, mode


# --------------------------------------------------------------------------- statements
def _merge_statement(cached: pd.DataFrame | None, fresh: pd.DataFrame | None) -> pd.DataFrame:
    if fresh is None or fresh.empty:
        return cached if cached is not None else pd.DataFrame()
    fresh = fresh.copy()
    fresh.columns = [pd.Timestamp(c).normalize() for c in fresh.columns]
    if cached is None or cached.empty:
        return fresh
    out = cached.copy()
    for col in fresh.columns:
        if col in out.columns:
            # fresh values win where present; keep cached values where Yahoo now returns blank
            merged = fresh[col].combine_first(out[col])
            out = out.drop(columns=[col])
            out = out.join(merged.rename(col), how="outer")
        else:
            out = out.join(fresh[[col]], how="outer")
    return out[sorted(out.columns, reverse=True)]


def statement_path(ticker: str, kind: str):
    d = STATEMENT_CACHE / ticker
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{kind}.csv"


def read_statement(ticker: str, kind: str) -> pd.DataFrame:
    p = statement_path(ticker, kind)
    if not p.exists():
        return pd.DataFrame()
    df = pd.read_csv(p, index_col=0)
    df.columns = [pd.Timestamp(c) for c in df.columns]
    return df


def fetch_statements(ticker: str, state: dict, force: bool = False) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    if not force and is_fresh(state, ticker, "statements", timedelta(days=STATEMENT_TTL_DAYS)):
        return {k: read_statement(ticker, k) for k in STATEMENTS}
    t = yf.Ticker(ticker)
    counts = {}
    for kind, getter in STATEMENTS.items():
        try:
            fresh = retry(lambda g=getter: g(t), f"{ticker} {kind}", attempts=3)
        except Exception as exc:  # noqa: BLE001
            log.error("%s %s unavailable: %s", ticker, kind, exc)
            fresh = None
        merged = _merge_statement(read_statement(ticker, kind), fresh)
        if not merged.empty:
            merged.to_csv(statement_path(ticker, kind))
        out[kind] = merged
        counts[kind] = int(merged.shape[1]) if not merged.empty else 0
    mark(state, ticker, "statements", periods=counts)
    return out


# --------------------------------------------------------------------------- info
def fetch_info(ticker: str, state: dict, force: bool = False) -> dict:
    path = INFO_CACHE / f"{ticker.replace('^', '_')}.json"
    if not force and path.exists() and is_fresh(state, ticker, "info", timedelta(hours=INFO_TTL_HOURS)):
        return json.loads(path.read_text())
    try:
        raw = retry(lambda: yf.Ticker(ticker).info, f"{ticker} info", attempts=3)
        info = {k: raw.get(k) for k in INFO_KEYS if raw.get(k) is not None}
        info["_retrieved_at"] = now_utc().isoformat(timespec="seconds")
        path.write_text(json.dumps(info, indent=1, default=str))
        mark(state, ticker, "info")
        return info
    except Exception as exc:  # noqa: BLE001
        log.error("%s info unavailable: %s", ticker, exc)
        return json.loads(path.read_text()) if path.exists() else {}
