"""Central configuration for the Artha NIFTY 50 data pipeline."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CACHE = DATA / "cache"
PRICE_CACHE = CACHE / "prices"
STATEMENT_CACHE = CACHE / "statements"
INFO_CACHE = CACHE / "info"
UNIVERSE_DIR = DATA / "universe"
LOG_DIR = DATA / "logs"
FETCH_STATE = CACHE / "fetch_state.json"

WEB_DATA = ROOT / "web" / "public" / "data"
WEB_DOWNLOADS = ROOT / "web" / "public" / "downloads"

# Official NSE constituent file (refreshed on every run; falls back to the last snapshot).
NSE_CONSTITUENTS_URLS = [
    "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv",
    "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv",
]
INDEX_TICKER = "^NSEI"
# INR per 1 unit of foreign currency (Yahoo FX pairs). Extend if a constituent reports in another currency.
FX_TICKERS = {"USDINR=X": "USD", "EURINR=X": "EUR", "GBPINR=X": "GBP"}
YAHOO_SUFFIX = ".NS"

# Refresh policy (incremental updates)
STATEMENT_TTL_DAYS = 7       # re-pull financial statements at most weekly
INFO_TTL_HOURS = 20          # re-pull quote/profile snapshot roughly daily
PRICE_OVERLAP_DAYS = 10      # re-download this many days to detect revisions/corporate actions

# Analytics assumptions (disclosed in the UI and the workbook README)
RISK_FREE_RATE = 0.065       # annual, approx. India 10Y G-Sec; used for Sharpe/Sortino only
TRADING_DAYS = 252
CRORE = 1e7

# Excel complete workbook: daily price history window (full history is in per-company exports)
WORKBOOK_PRICE_YEARS = 5

SOURCE_NAME = "Yahoo Finance via the unofficial yfinance Python library"
DISCLAIMER = (
    "Data is retrieved from Yahoo Finance using yfinance, an unofficial, community-maintained "
    "interface that is not affiliated with or endorsed by Yahoo or NSE. Coverage, accuracy and "
    "availability vary by company and field. Prices are end-of-day (or delayed intraday when the "
    "pipeline runs during market hours) and are NOT real-time. Financial statement figures are as "
    "published by Yahoo (generally consolidated) and have not been reconciled to company filings. "
    "Nothing here is investment advice."
)

for d in (PRICE_CACHE, STATEMENT_CACHE, INFO_CACHE, UNIVERSE_DIR, LOG_DIR, WEB_DATA, WEB_DOWNLOADS):
    d.mkdir(parents=True, exist_ok=True)
