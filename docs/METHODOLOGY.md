# Methodology

## 1. Reference analysis

The reference workbook (`Shreyansh_Surana_Bharti_Airtel_Ltd.xlsx`, 10 sheets) analyses one company from a Screener-style
*Data Sheet* (10 fiscal years). Its structure:

| Sheet | Role |
|---|---|
| Data Sheet | Raw P&L, balance sheet, cash flow, quarterly results, prices, share counts (FY2017–FY2026) |
| Profit & Loss / Balance Sheet / Cash Flow | Statements linked by formula to the Data Sheet |
| KPI Ratios | Growth (sales, net profit, EPS), profitability (gross/operating/net margin, ROE, ROCE, ROI, ROA), liquidity & leverage (current ratio, working capital, D/E, interest coverage), efficiency (asset turnover, receivable turnover, debtor/inventory days), cash flow (OCF, capex, FCF, OCF ratio, CFO/NP, payout), valuation (EPS, P/E, BVPS, P/B, market cap, DPS) |
| Pivot Data / Pivot tables | Year-level table with business phases (Pre-5G / Transition / 5G era) feeding pivots |
| Dashboard | Slicer-driven KPI cards and 8 charts (revenue/costs/profit, margins, OCF/capex/FCF, current assets vs liabilities, equity vs borrowings, phase totals, last 10 quarters, ROE/ROCE/ROA) |
| Management Insights | Five written answers (strongest development, concern, revenue vs profit divergence, cash-flow quality, recommendation) |

What the platform keeps: the full KPI families, statement → ratio formula traceability (rebuilt as live Excel formulas),
the chart set (all eight chart questions exist in the app), and the management-insight questions (answered by
deterministic rules in Module F).

What it changes deliberately:

1. **No zero-filling.** The reference uses `IFERROR(…,0)`; here an unavailable input yields a blank with a reason code.
2. **Gross margin artefact.** Bharti Airtel reports no cost of goods, so the reference shows a 100% gross margin. The
   engine withholds gross margin when cost of revenue is not reported (`cogs_not_reported`).
3. **Valuation on aggregates.** The reference divides by an "adjusted share count" that swings 494 → 1,835 → 530 Cr
   between years, which distorts EPS-based P/E. Here P/E = market cap ÷ net income, where market cap at fiscal-year end
   is the un-split-adjusted price × shares on that balance sheet.
4. **Multi-company.** Banks and insurers get a separate applicability rule instead of meaningless liquidity ratios.

## 2. Data acquisition (`pipeline/n50/fetch.py`, `universe.py`)

* **Universe**: NSE's official `ind_nifty50list.csv` is downloaded on every run (with a fallback mirror). If NSE is
  unreachable, the last committed snapshot is used and flagged *stale*. Tickers get the `.NS` suffix.
* **Prices**: `Ticker.history(period="max", auto_adjust=False, actions=True)` → OHLC, Close (split-adjusted),
  Adj Close (split + dividend adjusted), volume, dividends, splits.
* **Statements**: annual and quarterly income statement, balance sheet and cash flow.
* **Profile**: sector/industry, market cap, shares outstanding, Yahoo's trailing P/E/P/B and beta (used only for
  cross-checks and display alongside the platform's own figures).
* **FX**: USDINR/EURINR/GBPINR for statements reported in a foreign currency.

Robustness: exponential-backoff retries (longer for HTTP 429), per-dataset timestamps in `data/cache/fetch_state.json`,
incremental price updates (last 10 days re-fetched and merged; full re-download when a split/dividend or an adjusted-close
drift is detected), statements merged with the cache so history accumulates beyond Yahoo's 4–5 year window,
statement TTL 7 days, profile TTL 20 hours.

## 3. Normalisation (`statements.py`, `build.py`)

* Each canonical field lists Yahoo row names in priority order; the first available row is used and recorded as the
  source (visible in the app on hover and in the Excel statement sheets).
* **Currency verification**: Yahoo's `financialCurrency` label is checked against magnitudes — Yahoo-implied trailing
  net income (market cap ÷ trailing P/E, INR) versus raw statement net income. Ratio ≈ 1 → INR (HCLTECH is labelled USD but
  reported in INR); ratio ≈ FX rate → translate (INFY is USD). Translation uses average rates for income-statement and
  cash-flow items and period-end rates for balance-sheet items; share counts are not translated.
* **Fiscal labels**: period ending March 2026 → FY2026; non-March year ends are tagged (e.g. `FY2022·Dec`).
* **Lender/insurer framework**: NSE sector *Financial Services* **and** no current assets in Yahoo's balance sheet
  (so BSE and Jio Financial, which report current assets, are analysed as operating companies).
* **Adjusted-price artefacts**: if Yahoo's adjusted close is ≤ 0 (ADANIENT, 2002), return metrics use only the valid tail.

## 4. KPI engine (`kpis.py`)

34 KPIs across Growth, Profitability, Liquidity, Solvency, Efficiency, Cash Flow and Valuation — full definitions in
[`KPI_DICTIONARY.md`](KPI_DICTIONARY.md). Rules:

* Annual figures, **period-end** balances (average balances would drop the earliest of only 4–5 years).
* Growth only between consecutive 12-month periods (period ends 330–400 days apart) and only from a positive base.
* Multiples undefined for loss-making periods; ratios undefined for non-positive denominators.
* Every unavailable value carries a reason code; nothing is set to zero.

**Current valuation** uses the latest quoted market cap and **trailing-twelve-month** flows when four consecutive
quarters exist (80–100 days apart); otherwise the latest fiscal year that reports the field, labelled as such.

## 5. Market and risk analytics (`market.py`)

| Metric | Definition |
|---|---|
| Period returns, CAGR | Adjusted close (total return). Windows shorter than the listing history are reported as unavailable. |
| Volatility | Annualised standard deviation of daily log returns (√252). |
| Sharpe / Sortino | (CAGR − 6.5% risk-free assumption) ÷ σ (downside σ for Sortino), 3Y. |
| Beta / correlation | 3Y daily log returns vs the NIFTY 50 (≥ 200 overlapping days). |
| Max drawdown | Peak-to-trough on the adjusted series (full history and 5Y); current drawdown from ATH. |
| Calendar / monthly returns | Year-end / month-end adjusted closes. |
| 52W range, moving averages | Split-adjusted High/Low/Close. |

## 6. Intelligence engine (`insights.py`)

Deterministic rules, each with a threshold, evidence values and period, e.g. revenue up while profit down; margin
change ≥ 2 pp; debt growth > 10% and > equity growth + 10 pp; CFO/net profit < 0.7× or > 1.5×; interest coverage < 3×;
negative FCF; ROE ± 5 pp vs sector median; P/E re-rating > 30%; P/E premium/discount > 30% vs sector; 1Y return vs
sector median (±10 pp) and vs the index (±15 pp); 52-week high/low proximity; distance from the 200-day average;
drawdown below −30%. Each observation separates the **fact** (verifiable from the evidence) from an optional, labelled
**interpretation**. No language model is used.

## 7. Validation

* **Unit tests** (`pipeline/tests/test_kpis.py`): reproduce ratios from the reference workbook's FY2025–26 data and
  test every reason code, consecutive-year logic, TTM construction and labelling.
* **Build checks** (`validation.json`, shown in the app): balance-sheet identity, cash-flow identity, net-margin
  sanity, computed P/E vs Yahoo trailing P/E, FY-end share-count consistency, price sanity.
* **Workbook verification** (`pipeline/tests/verify_workbook.py`): recalculates every formula with an independent
  Excel engine and compares it with the Python engine.

## 8. Known limitations

See the *Known limitations* panel on the Methodology page; in short: 4–5 years of statements from Yahoo; quarterly
gaps; standalone vs consolidated basis unverifiable; restructured entities (TMPV, ETERNAL) inherit ticker price
history; end-of-day data only; no manual reconciliation to annual reports has been performed.
