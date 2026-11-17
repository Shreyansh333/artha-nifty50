"""Artha pipeline CLI.

    python pipeline/run.py fetch            # acquire/refresh data (incremental)
    python pipeline/run.py fetch --full     # force full price + statement re-download
    python pipeline/run.py build            # compute analytics and write web/public/data
    python pipeline/run.py excel            # generate the complete research workbook
    python pipeline/run.py docs             # regenerate docs/KPI_DICTIONARY.md and docs/DATA_COVERAGE.md
    python pipeline/run.py all              # fetch + build + excel + docs
"""
from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from n50 import fetch  # noqa: E402
from n50.config import FX_TICKERS, INDEX_TICKER  # noqa: E402
from n50.log import get_logger  # noqa: E402
from n50.universe import load_universe  # noqa: E402

log = get_logger("n50.run")


def do_fetch(full: bool = False, workers: int = 4, only: list[str] | None = None) -> None:
    uni, meta = load_universe(refresh=True)
    state = fetch.load_state()
    tickers = list(uni["yahoo"]) if not only else [f"{s}.NS" for s in only]
    t0 = time.time()
    failures: dict[str, str] = {}

    # Index first (benchmark for relative performance and beta)
    try:
        fetch.fetch_prices(INDEX_TICKER, state, force_full=full)
        fetch.fetch_info(INDEX_TICKER, state, force=full)
    except Exception as exc:  # noqa: BLE001
        failures[INDEX_TICKER] = str(exc)
        log.error("Index fetch failed: %s", exc)
    # FX for companies whose statements Yahoo reports in a foreign currency (e.g. INFY, HCLTECH in USD)
    for fx in FX_TICKERS:
        try:
            fetch.fetch_prices(fx, state, force_full=full)
        except Exception as exc:  # noqa: BLE001
            failures[fx] = str(exc)
            log.error("FX fetch failed for %s: %s", fx, exc)

    def job(tk: str) -> str:
        _, mode = fetch.fetch_prices(tk, state, force_full=full)
        fetch.fetch_statements(tk, state, force=full)
        fetch.fetch_info(tk, state, force=full)
        return mode

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(job, tk): tk for tk in tickers}
        for i, f in enumerate(as_completed(futs), 1):
            tk = futs[f]
            try:
                mode = f.result()
                log.info("[%2d/%d] %-14s ok (prices: %s)", i, len(tickers), tk, mode)
            except Exception as exc:  # noqa: BLE001
                failures[tk] = str(exc)
                log.error("[%2d/%d] %-14s FAILED: %s", i, len(tickers), tk, exc)
            fetch.save_state(state)
    state["_last_run"] = {
        "finished_at": fetch.now_utc().isoformat(timespec="seconds"),
        "seconds": round(time.time() - t0, 1),
        "failures": failures,
        "universe": meta,
    }
    fetch.save_state(state)
    log.info("Fetch complete in %.0fs; %d failures", time.time() - t0, len(failures))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["fetch", "build", "excel", "docs", "all"])
    ap.add_argument("--full", action="store_true", help="force full re-download")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--only", nargs="*", help="limit fetch to these NSE symbols")
    a = ap.parse_args()
    if a.command in ("fetch", "all"):
        do_fetch(a.full, a.workers, a.only)
    if a.command in ("build", "all"):
        from n50.build import build_all
        build_all()
    if a.command in ("excel", "all"):
        from n50.excel_workbook import build_workbook
        build_workbook()
    if a.command in ("docs", "all"):
        from n50.docs import write_docs
        write_docs()


if __name__ == "__main__":
    main()
