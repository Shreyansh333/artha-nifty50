"""Generate Markdown reference docs from the live KPI registry and the latest build."""
from __future__ import annotations

import json

from .config import ROOT, WEB_DATA
from .kpis import GROUPS, REGISTRY

DOCS = ROOT / "docs"


def write_docs() -> None:
    DOCS.mkdir(exist_ok=True)
    lines = ["# KPI dictionary", "", "_Generated from `pipeline/n50/kpis.py` by `python pipeline/run.py docs`. "
             "Every KPI is computed by the same engine for every company; unavailable values carry a reason code instead of a number._", ""]
    for g in GROUPS:
        lines += [f"## {g}", "", "| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |", "|---|---|---|---|---|---|---|"]
        for k in REGISTRY:
            if k.group != g:
                continue
            lines.append(f"| **{k.name}** | `{k.formula}` | {', '.join(k.inputs)} | {k.basis} | {k.unit} | {'yes' if k.financials else 'n/a'} | {k.significance} |")
        lines.append("")
    lines += ["## Reason codes", "", "| Code | Meaning |", "|---|---|",
              "| `missing:<field>` | Input not provided by Yahoo for that period |",
              "| `na_financial` | Not meaningful for banks, NBFCs and insurers (no current assets/EBITDA in their balance-sheet format) |",
              "| `nonpositive_denominator` | Denominator ≤ 0 (e.g. negative equity) |",
              "| `negative_base` | Growth from a zero/negative base is not meaningful |",
              "| `negative_earnings` | Multiple undefined for a loss-making period |",
              "| `no_prior_period` | Growth needs a consecutive prior fiscal year (period ends 330–400 days apart) |",
              "| `cogs_not_reported` | Gross profit equals revenue because cost of revenue is not reported |", ""]
    (DOCS / "KPI_DICTIONARY.md").write_text("\n".join(lines), encoding="utf-8")

    cov = json.loads((WEB_DATA / "coverage.json").read_text(encoding="utf-8"))
    meta = json.loads((WEB_DATA / "meta.json").read_text(encoding="utf-8"))
    val = json.loads((WEB_DATA / "validation.json").read_text(encoding="utf-8"))
    key = ["revenue", "ebitda", "net_income", "total_assets", "equity", "total_debt", "current_assets", "inventory", "operating_cf", "capex", "dividends_paid"]
    out = ["# Data coverage audit", "", f"_Generated from the build of {meta['generated_at']} (prices to {meta['price_as_of']}). "
           "Cells show the number of annual periods in which Yahoo provides the field._", "",
           "| Symbol | Lender | Annual FYs | Quarters | TTM | KPI completeness | Prices from | " + " | ".join(key) + " |",
           "|---|---|---|---|---|---|---|" + "---|" * len(key)]
    for c in cov:
        n = len(c["annual_periods"])
        out.append(f"| {c['symbol']} | {'yes' if c['is_financial'] else ''} | {', '.join(c['annual_periods'])} | {len(c['quarterly_periods'])} | "
                   f"{'yes' if c['ttm_available'] else 'FY fallback'} | {round((c['kpi_completeness'] or 0) * 100)}% | {c['price_start']} | "
                   + " | ".join(f"{c['fields'].get(f, 0)}/{n}" for f in key) + " |")
    warns = [v for v in val if v["status"] != "pass"]
    out += ["", f"## Validation ({len(val)} checks, {len(warns)} warnings)", ""]
    out += [f"- **{v['symbol']}** — {v['check']}: {v['detail']}" for v in warns] or ["- No warnings."]
    (DOCS / "DATA_COVERAGE.md").write_text("\n".join(out) + "\n", encoding="utf-8")
