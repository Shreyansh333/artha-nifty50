# AI usage declaration

This project was developed with substantial assistance from an AI coding agent. This document records which tool
was used, the prompts actually given, and what the AI did, so the work can be assessed transparently.

## 1. AI tool used

| Item | Detail |
|---|---|
| Tool | **Claude Code** (Anthropic's agentic coding tool), command-line interface on Windows 11 |
| Model | **Claude Opus 5.5** — model identifier `claude-opus-5-5` (as reported by the Claude Code session) |
| Date of development session | 17 November 2026 |
| Mode of use | The student issued a single comprehensive prompt; the agent then inspected files, wrote and ran code, fetched data, tested in a browser and produced the documentation, reporting progress in the session. |

## 2. Prompts provided

### 2.1 Record of prompts actually issued

| # | When | Prompt | Where recorded |
|---|---|---|---|
| 1 | Start of session | Master project prompt — “PROJECT: NIFTY 50 FINANCIAL INTELLIGENCE PLATFORM …” | Verbatim in [`prompts/01_master_prompt.md`](prompts/01_master_prompt.md) |
| 2+ | Deployment stage | Any follow-up instructions (e.g. account authorisation for GitHub / Cloudflare) | Append below in the same format |

No other prompts were issued during development. The phase-specific work listed in 2.2 was **not** driven by separate
prompts; it was carried out by the agent under the master prompt. To keep this record accurate, the table maps each
required topic to the section of the master prompt that governed it rather than inventing prompts that were never sent.

> **Student to complete:** append any further prompts you send (for example, approving deployment steps or requesting
> changes) to the table above, verbatim, with the date.

### 2.2 Topics required by the assignment and the governing prompt text

| Topic | Governing section of Prompt 1 | What the agent did in response |
|---|---|---|
| 1. Dataset inspection | §1 “Understand the reference Excel file” | Dumped every sheet, formula and chart of `Shreyansh_Surana_Bharti_Airtel_Ltd.xlsx`; identified its structure (Data Sheet → statements → KPI Ratios → pivots → dashboard → insights) and its methodological weaknesses. |
| 2. Financial KPI identification | §3 “Financial analysis engine” | Defined 34 KPIs in seven groups with formula, inputs, basis, unit, direction and significance (`pipeline/n50/kpis.py`). |
| 3. Financial chart recommendations | §5 Module D “Choose chart types based on the analytical question” | Selected chart forms per question (treemap for cap-weighted market structure, waterfall for profit bridges, rebased lines for relative performance, scatter with median quadrants, percentile heatmaps, radar only on a common percentile scale) and avoided dual-axis charts. |
| 4. Financial analysis | §3 and §5 Module F | Built the KPI engine, TTM construction, market/risk analytics and the rule-based insight engine (`pipeline/n50/insights.py`). |
| 5. Dashboard architecture | §8, §9, §10 | Static-data architecture: Python pipeline → JSON API → React app on Cloudflare Pages, refreshed by GitHub Actions. |
| 6. UI/UX development | §4, §6 | Original “Artha” design system (tokens, typography, light/dark themes), navigation, global filters and chart interactions. |
| 7. Excel integration | §7 | Python XlsxWriter complete workbook + in-browser ExcelJS exports with live formulas and filtered-export support. |
| 8. Testing and deployment | §12 Phases 7–8, §10 | Unit tests, independent formula recalculation, browser testing of every route, responsive checks, deployment configuration. |

## 3. AI contribution note

The AI agent acted as the implementer of a specification written by the student. Its contribution, and its limits,
are summarised below.

**Financial dataset interpretation.** The agent read the reference workbook programmatically and summarised its
methodology. It also identified issues that the new platform deliberately corrects: `IFERROR(…,0)` turning missing
data into zeros, a 100% gross margin for a company that reports no cost of revenue, and an inconsistent per-year share
count that distorts EPS and P/E. On the live data it detected that Yahoo reports Infosys's statements in US dollars,
that HCL Technologies is labelled USD but reported in rupees, and that Nestlé India changed its fiscal year-end. These
were found through automated validation checks, not assumed.

**Financial KPI identification.** The KPI set extends the reference workbook's ratios using standard corporate-finance
definitions. The agent chose conventions — period-end balances, aggregate-based P/E, TTM only from consecutive
quarters, “not applicable” for banks — and documented each one. These are methodological judgements a reviewer may
reasonably disagree with; they are disclosed in `docs/METHODOLOGY.md` and in the app.

**Visualisation recommendations.** Chart types were chosen per analytical question following an explicit
data-visualisation method (fixed categorical colour order, one axis per chart, legends plus direct labels).

**Financial analysis.** All numbers are computed deterministically from Yahoo Finance data by code. The “Intelligence”
observations are produced by explicit rules with stated thresholds; **no language model generates or edits financial
insights at runtime**. Interpretive sentences attached to some rules are fixed templates, labelled as interpretations.

**Interactive dashboard development and Excel report generation.** The agent wrote the frontend, the export code and
the workbook generators, and tested them: browser checks of every page; recalculation of ~8,600 workbook formulas
with an independent Excel engine (matching the Python engine exactly); and a filtered-export check confirming that only
filtered rows are exported.

**Data automation.** The agent designed the incremental pipeline (caching, retries, corporate-action detection,
statement accumulation) and the scheduled GitHub Actions workflow.

**Financial decision support.** The platform organises and computes information. It does not make investment
recommendations, and its rule-based interpretations are not advice.

**Verification status — stated honestly.** Verification so far is automated: unit tests that reproduce ratios from the
reference workbook, internal accounting-identity checks, cross-checks against Yahoo's own published ratios (computed P/E
within a few percent of Yahoo's trailing P/E for 45 of 47 comparable companies), and independent formula recalculation.
**No line-by-line manual reconciliation of the figures to company annual reports has been performed** by the agent or,
at the time of writing, by the student. The underlying data comes from an unofficial interface (yfinance) and may
contain errors that these checks cannot detect.

> **Student to complete:** describe any manual review you carry out (e.g. spot-checking a company's revenue and net
> profit against its annual report) before submission.
