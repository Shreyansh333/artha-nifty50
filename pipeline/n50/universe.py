"""NIFTY 50 constituent universe.

The constituent list is downloaded from NSE on every run. If NSE is unreachable (it
blocks some cloud IP ranges), the most recent successful snapshot in
data/universe/nifty50_constituents.csv is used and flagged as stale. Nothing is hardcoded.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone

import pandas as pd
import requests

from .config import NSE_CONSTITUENTS_URLS, UNIVERSE_DIR, YAHOO_SUFFIX
from .log import get_logger

log = get_logger("n50.universe")
SNAPSHOT = UNIVERSE_DIR / "nifty50_constituents.csv"
SNAPSHOT_META = UNIVERSE_DIR / "nifty50_constituents.meta.json"

# NSE "Industry" values that denote banks, NBFCs, insurers and financial holding companies.
# For these, working-capital style ratios (current/quick ratio, ROCE, EBITDA) are not meaningful.
FINANCIAL_INDUSTRIES = {"Financial Services"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/csv,*/*",
}


def _download() -> pd.DataFrame | None:
    for url in NSE_CONSTITUENTS_URLS:
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            if {"Company Name", "Industry", "Symbol"} <= set(df.columns) and 45 <= len(df) <= 55:
                log.info("Downloaded %d constituents from %s", len(df), url)
                df.attrs["source_url"] = url
                return df
            log.warning("Unexpected constituent file shape from %s: %s", url, df.shape)
        except Exception as exc:  # noqa: BLE001 - any network/parse failure → try next source
            log.warning("Constituent download failed (%s): %s", url, exc)
    return None


def load_universe(refresh: bool = True) -> tuple[pd.DataFrame, dict]:
    import json

    meta: dict = {}
    df = _download() if refresh else None
    if df is not None:
        df = df.rename(
            columns={"Company Name": "name", "Industry": "sector", "Symbol": "symbol", "ISIN Code": "isin", "Series": "series"}
        )
        df["symbol"] = df["symbol"].str.strip()
        df["yahoo"] = df["symbol"] + YAHOO_SUFFIX
        df = df[["symbol", "yahoo", "name", "sector", "isin", "series"]].sort_values("symbol").reset_index(drop=True)
        meta = {
            "source": df.attrs.get("source_url", NSE_CONSTITUENTS_URLS[0]),
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": int(len(df)),
            "stale": False,
        }
        df.to_csv(SNAPSHOT, index=False)
        SNAPSHOT_META.write_text(json.dumps(meta, indent=2))
    elif SNAPSHOT.exists():
        df = pd.read_csv(SNAPSHOT)
        meta = json.loads(SNAPSHOT_META.read_text()) if SNAPSHOT_META.exists() else {}
        if refresh:  # a download was attempted and failed → flag the snapshot as stale
            meta["stale"] = True
            log.warning("Using cached constituent snapshot retrieved at %s", meta.get("retrieved_at"))
    else:
        raise RuntimeError("NIFTY 50 constituent list unavailable and no cached snapshot exists")

    df["is_financial"] = df["sector"].isin(FINANCIAL_INDUSTRIES)
    return df, meta
