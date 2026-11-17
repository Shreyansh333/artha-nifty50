# Artha — NIFTY 50 Intelligence Terminal

An institutional-style financial research platform for the 50 constituents of India's NIFTY 50 index. It
combines market data, a 34-KPI financial analysis engine, company comparison, rule-based financial
intelligence and formula-driven Excel exports, refreshed automatically after every trading day.

**Live site:** _to be added once deployment is verified_ · **Data:** Yahoo Finance via yfinance (unofficial; end-of-day, not real-time)

> MBA academic project. Built with the AI coding agent Claude Code — see [`docs/AI_USAGE.md`](docs/AI_USAGE.md) for the
> tool, model, the exact prompt used and an honest account of the AI's contribution.

## What it does

| Module | Highlights |
|---|---|
| **A · Market overview** | NIFTY 50 index with range selector, market-cap treemap heatmap (1D → 3Y; click to drill into a company), top gainers/losers, cap-weighted sector performance, market-cap distribution, performance leaderboard, breadth, data freshness |
| **B · Company research** | 50 company pages: price chart (line/candles, 50/200-DMA, volume, zoom), key statistics with stated basis, revenue/profit trends, observations, profile |
| **C · Financial statements** | Income statement, balance sheet, cash flow; annual ⇄ quarterly; line-item trend charts; profit / cash-flow / funding waterfall bridges; canonical and full raw Yahoo tables |
| **D · Advanced analytics** | Any-metric scatter explorer with median quadrants, rankings, sector medians heatmap, KPI percentile map, calendar-year performance rankings |
| **E · Comparison** | Up to 6 companies: rebased-to-100 performance vs NIFTY 50, period risk stats, side-by-side metric matrix with best-in-row, KPI trends, revenue indexed to a common year, percentile radar |
| **F · Intelligence** | Deterministic rules (no LLM) producing facts with evidence and thresholds, labelled interpretations, filterable across the universe |
| **Screener** | Sort, paginate, choose columns, search, metric conditions — and export exactly that view |
| **Export centre** | Complete research workbook (Python) + 7 in-browser workbook types with live formulas; every filter is honoured |
| **Methodology & data** | Architecture, KPI dictionary, company × field coverage audit, validation results, known limitations |

Global controls: sector filter, fiscal year, date range presets + custom range, annual/quarterly basis, ₹ unit
(Cr / L Cr / Bn / Mn), dark/light/system theme, reset. Every chart: tooltips, legend toggles, expand, data-table view,
CSV and PNG export. `Ctrl K` opens company search.

## Data integrity principles

* Missing data is **never** zero — it is blank with a reason (e.g. *not applicable to lenders*, *loss-making period*).
* Every statement line records the Yahoo row it came from; every figure shows its basis (TTM / FY / period-end).
* Currency labels are verified by magnitude (Infosys is reported in USD and translated; HCLTECH's USD label is wrong and ignored).
* 487 automated validation checks per build (accounting identities, P/E vs Yahoo, share-count consistency).
* Workbook formulas are independently recalculated and must match the Python engine before deployment.

## Repository layout

```
pipeline/              Python data pipeline
  n50/universe.py      NSE constituent list (refreshed every run, cached snapshot fallback)
  n50/fetch.py         yfinance acquisition: caching, retries, incremental updates
  n50/statements.py    canonical statement schema + source tracking
  n50/kpis.py          KPI engine (34 KPIs, reason codes)
  n50/market.py        returns, CAGR, volatility, drawdown, beta, Sharpe/Sortino
  n50/insights.py      rule-based intelligence engine
  n50/build.py         FX translation, TTM, validation, sector aggregates → static JSON API
  n50/excel_workbook.py complete research workbook (XlsxWriter)
  run.py               CLI: fetch | build | excel | docs | all
  tests/               KPI unit tests + independent workbook recalculation
data/cache/            cached raw data (committed; enables incremental updates)
data/universe/         NSE constituent snapshot
web/                   React + TypeScript + Vite + Tailwind + ECharts app
  src/pages/           modules A–F, screener, exports, methodology
  src/excel/           in-browser ExcelJS workbook generators
docs/                  methodology, KPI dictionary, coverage audit, deployment, AI usage, progress log
.github/workflows/     scheduled update + deploy
```

## Quick start

```bash
pip install -r pipeline/requirements.txt
python pipeline/run.py all              # fetch (≈1 min) → build → Excel → docs
python -m pytest pipeline/tests -q
cd web && npm install && npm run dev    # http://localhost:5173
```

Deployment, secrets and data-update instructions: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Documentation

* [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — reference-workbook analysis, data pipeline, KPI rules, validation
* [`docs/KPI_DICTIONARY.md`](docs/KPI_DICTIONARY.md) — every KPI: formula, inputs, basis, significance (generated)
* [`docs/DATA_COVERAGE.md`](docs/DATA_COVERAGE.md) — company-by-field coverage and validation warnings (generated)
* [`docs/AI_USAGE.md`](docs/AI_USAGE.md) — AI tool, model, prompts, contribution note
* [`docs/PROGRESS_LOG.md`](docs/PROGRESS_LOG.md) — development log, issues found and fixed

## Disclaimer

Data is retrieved from Yahoo Finance using yfinance, an unofficial, community-maintained library not affiliated with
Yahoo or NSE. Coverage, accuracy and availability vary by company and field. Prices are end-of-day. Statement figures
are as published by Yahoo (generally consolidated) and have not been reconciled to company filings. Nothing here is
investment advice.
