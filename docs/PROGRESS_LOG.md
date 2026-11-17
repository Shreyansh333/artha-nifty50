# Progress log

All entries 17 November 2026 (single Claude Code session). Times omitted; order is chronological.

## Phase 1 — Reference analysis
- Inspected the working directory (reference workbook, `trash/` with other students' files — left untouched).
- Dumped all 10 sheets, formulas and 8 chart definitions of the reference workbook; documented its methodology and
  three weaknesses to correct (zero-filling, 100% gross margin artefact, inconsistent share count).

## Phase 2 — Data acquisition
- Confirmed yfinance 1.1.0 works; probed Reliance: prices from 1996, annual statements only FY2023–FY2026.
- Downloaded the official NSE NIFTY 50 list (50 constituents, incl. recent entrants ETERNAL, JIOFIN, MAXHEALTH, TMPV, INDIGO).
- Built the cached, retrying, incremental fetch layer. Initial fetch: 51 tickers in 47 s, 0 failures.
- Coverage audit: 4–5 annual periods per company; quarterly gaps (often Q2 FY26 missing); banks lack current assets/EBITDA.

## Phase 3 — Financial analytics
- KPI engine (34 KPIs with reason codes), market/risk analytics, rule-based insights, validation checks.
- **Issue found by validation:** INFY P/E 1,386× vs Yahoo 15× → Yahoo reports INFY statements in USD. Added FX translation.
- **Issue:** HCLTECH labelled USD but values are INR (P/E 0.2× after translation) → added magnitude-based currency detection.
- **Issue:** NESTLEIND changed fiscal year-end (Dec → Mar, 15-month transition) → growth now requires 330–400-day gaps;
  non-March year ends labelled; TTM falls back per field to the latest year that reports it.
- **Issue:** ADANIENT has negative Yahoo adjusted closes in 2002 → masked; returns use the valid tail; disclosed per company.
- Result: computed P/E within a few percent of Yahoo's trailing P/E for 45 of 47 comparable companies; the two
  differences are explained (HUL one-off gain in TTM; Nestlé FY fallback).
- Unit tests: 9 passing, including reproduction of the reference workbook's ratios.

## Phase 4–5 — Product design & development
- Design system "Artha": warm ink/paper surfaces, saffron accent, Instrument Serif + Geist + Geist Mono, CVD-validated
  categorical palette, diverging red–neutral–green for returns with signed labels.
- Modules: Market Overview (index, heatmap treemap, movers, sector performance, cap distribution, leaderboard,
  freshness), Company Research (6 tabs), Advanced Analytics, Comparison, Intelligence, Screener, Export Centre,
  Methodology & Data.
- Fixed during testing: Chrome's promise-returning `scrollTo` breaking an effect cleanup; ECharts heatmaps requiring
  `visualMap`; non-directional heatmap columns colouring; scatter outliers (added 5th–95th percentile focus);
  mobile overflow from CSS-grid min-width (fixed globally).

## Phase 6 — Excel integration
- Python XlsxWriter complete research workbook (15 sheets, row-aligned statements → formula KPIs).
- In-browser ExcelJS: company report, comparison, sector, KPI, prices, dataset, filtered view.
- Independent recalculation with the `formulas` engine: 8,659 formulas in the complete workbook and every
  recalculable formula in all 8 browser workbook types match the Python engine.
- **Issue found:** `RANK.EQ`, `MAXIFS`, `MINIFS` are Excel "future functions" that need the `_xlfn.` prefix in the file
  or Excel shows `#NAME?` → switched to `RANK`, enabled `use_future_functions`, prefixed in ExcelJS.
- Filtered export verified: sector filter + "ROE > 15%" → exactly 7 matching rows, sorted, with filters in README.

## Phase 7 — Testing
- Every route rendered in development and production builds with zero console errors; unknown tickers handled.
- 390 px viewport: no horizontal overflow on any route.
- Bundle: ECharts switched to modular imports (342 → 220 KB gzipped); ExcelJS lazy-loaded.

## Phase 8 — Hosting
- See `DEPLOYMENT.md`. Status recorded in the README once the public URL is verified.
