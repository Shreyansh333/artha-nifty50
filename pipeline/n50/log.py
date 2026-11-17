from __future__ import annotations

import logging
import sys

from .config import LOG_DIR

_configured = False


def get_logger(name: str = "n50") -> logging.Logger:
    global _configured
    if not _configured:
        fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
        root = logging.getLogger("n50")
        root.setLevel(logging.INFO)
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        fh = logging.FileHandler(LOG_DIR / "pipeline.log", encoding="utf-8")
        fh.setFormatter(fmt)
        root.addHandler(sh)
        root.addHandler(fh)
        # yfinance is chatty on 404s for missing fields; keep its warnings out of our log
        logging.getLogger("yfinance").setLevel(logging.CRITICAL)
        _configured = True
    return logging.getLogger(name)
