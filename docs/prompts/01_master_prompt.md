# Prompt 1 — Master project prompt (verbatim)

Issued by the student in Claude Code on 17 November 2026 at the start of the session. It was the only
instruction given before development began; every phase (reference analysis → deployment) was carried out
from it. It is reproduced exactly as submitted.

---

# PROJECT: NIFTY 50 FINANCIAL INTELLIGENCE PLATFORM
### Build a world-class, interactive financial analytics platform with live market data, advanced financial analysis, Excel exports and public cloud hosting.

You are operating as an autonomous senior engineering, financial research and product design team.

Your expertise includes:
- Financial modelling and equity research.
- Indian stock markets and NIFTY 50 companies.
- Python, yfinance and financial data engineering.
- Advanced financial analytics and KPI development.
- React, TypeScript and modern frontend engineering.
- Premium fintech UI/UX design.
- Excel automation and financial reporting.
- Cloud infrastructure and deployment.

Your responsibility is to design, develop, test and deploy a complete financial intelligence web application.

This is an MBA academic assignment, but the quality should be comparable to a premium commercial financial analytics platform.

**Do not build a conventional college dashboard. Build an actual financial intelligence product.**

---

# 1. UNDERSTAND THE REFERENCE EXCEL FILE

I am providing the following Excel workbook:

`@Shreyansh_Surana_Bharti_Airtel_Ltd.xlsx`

IMPORTANT: This workbook is a reference for financial analysis methodology.

Study it thoroughly before beginning development.

Inspect:
- All worksheets.
- Financial statement structures.
- Financial KPIs and ratios.
- Financial calculations.
- Historical analysis.
- Growth calculations.
- Formula dependencies.
- Chart recommendations.
- Formatting and analytical presentation.

Understand how the financial analysis was performed.

Use this workbook to understand the expected depth and structure of financial analysis.

However:

- Do not simply reproduce the workbook.
- Do not restrict the new application to Bharti Airtel.
- Do not blindly copy company-specific calculations.
- Adapt relevant financial analysis techniques to the NIFTY 50 universe.
- Preserve the analytical depth of the reference workbook.

The new application must support NIFTY 50 companies, not just one company.

---

# 2. DATA ACQUISITION: YFINANCE

Use Python and the `yfinance` library as the primary market-data acquisition mechanism.

The objective is to create a financial database covering NIFTY 50 companies.

### Company universe

- Obtain the latest available NIFTY 50 constituent list.
- Include all constituents, with their correct NSE ticker symbols.
- Use `.NS` suffixes where appropriate for Yahoo Finance.
- Maintain company name, ticker, sector and industry wherever available.
- Provide a company selector and sector-based filtering.

Do not hardcode an outdated NIFTY 50 constituent list as permanently current.

Design the system so that the constituent universe can be updated.

### Historical data

Retrieve the maximum useful historical coverage available, targeting at least 10 years where the source supports it.

Collect:

**A. Market Data**
- Historical stock prices.
- Open, high, low and close.
- Adjusted close where available.
- Trading volume.
- Daily returns.
- Market capitalization.
- 52-week high and low.
- Beta, where available.
- Moving averages.

**B. Financial Statements**
- Income statement.
- Balance sheet.
- Cash flow statement.
- Annual financials.
- Quarterly financials.

**C. Financial Metrics**
- Revenue.
- EBITDA, where available.
- EBIT.
- Net income.
- EPS.
- Total assets.
- Total equity.
- Total debt.
- Cash and equivalents.
- Operating cash flow.
- Free cash flow.
- Dividends.
- Profitability and valuation metrics.

Retrieve additional metrics whenever they add meaningful analytical value.

### Data integrity requirements

Yahoo Finance and yfinance do not guarantee that every company has complete historical financial statements or every financial metric.

Therefore:

1. Audit data coverage company by company.
2. Handle missing fields gracefully.
3. Never fabricate financial values.
4. Never silently substitute missing data with zero.
5. Record the source and retrieval date.
6. Clearly distinguish unavailable data from genuine zero values.
7. Maintain data timestamps.
8. Handle API failures, rate limits and incomplete responses.
9. Cache downloaded data.
10. Implement incremental updates instead of downloading the entire history repeatedly.

Clearly disclose that yfinance is an unofficial Yahoo Finance data interface and that its coverage, accuracy and availability can vary.

Do not claim that prices are real-time unless the source actually provides real-time data.

---

# 3. FINANCIAL ANALYSIS ENGINE

This is the most important analytical component.

Use the provided Excel workbook as a reference for the depth of analysis.

Identify suitable financial KPIs and develop a reusable calculation engine that works across different NIFTY 50 companies.

### Profitability
- Revenue Growth.
- EBITDA Margin.
- EBIT Margin.
- Net Profit Margin.
- Return on Equity.
- Return on Assets.
- Return on Capital Employed, where inputs permit.

### Liquidity
- Current Ratio.
- Quick Ratio, where inputs permit.
- Cash Ratio, where inputs permit.

### Solvency
- Debt-to-Equity.
- Interest Coverage.
- Debt-to-Assets.

### Efficiency
- Asset Turnover.
- Inventory Turnover, where applicable.
- Receivables Turnover, where applicable.

### Valuation
- Price-to-Earnings.
- Price-to-Book.
- Price-to-Sales.
- EV/EBITDA, where inputs permit.
- Dividend Yield.

### Market Performance
- CAGR.
- Annual Returns.
- Monthly Returns.
- Volatility.
- Maximum Drawdown.
- Relative Performance.
- Moving Averages.
- Risk-adjusted performance, where appropriate.

These are proposed KPIs, not mandatory calculations regardless of data availability.

For every KPI:
- Define the formula.
- Identify its input fields.
- Calculate it correctly.
- Define its reporting period.
- Explain its financial significance.
- Validate its output.

Be particularly careful with financial statement units, negative values, denominator problems, quarterly versus annual figures and standalone versus consolidated statements.

Do not mix incompatible reporting bases.

Clearly indicate whether ratios use trailing twelve months, annual figures or quarterly figures.

---

# 4. THE PRODUCT: WORLD-CLASS FINANCIAL INTELLIGENCE DASHBOARD

Create a sophisticated web application with a unique product identity.

Design inspiration:

- Bloomberg Terminal's analytical depth.
- TradingView's chart interactions.
- Apple's visual simplicity.
- Stripe's premium dashboard aesthetics.
- Institutional equity research platforms.

Do not copy any existing platform.

Create an original visual identity.

### Design direction

I want a premium, sophisticated and visually distinctive interface.

Use:
- Beautiful typography.
- Carefully selected financial color palettes.
- Elegant dark and light themes.
- Subtle gradients where appropriate.
- Premium chart styling.
- Sophisticated KPI cards.
- Smooth transitions.
- Micro-interactions.
- Well-designed navigation.
- Responsive layouts.
- Excellent information hierarchy.

Avoid generic dashboard templates.

Avoid excessive cards, random colors, unnecessary animations and clutter.

The experience should feel like a product developed by a professional fintech company.

---

# 5. DASHBOARD MODULES

Create the following application sections, adapting them to actual data availability.

## MODULE A: NIFTY 50 MARKET OVERVIEW

The landing page should provide an overview of the NIFTY 50 universe.

Include:
- NIFTY 50 market performance.
- Number of companies covered.
- Sector distribution.
- Market capitalization distribution.
- Best-performing companies.
- Worst-performing companies.
- Top gainers and losers.
- Sector performance.
- Market trends.
- Data freshness indicators.

Include an interactive market heatmap.

Allow users to explore individual companies directly from the heatmap.

## MODULE B: COMPANY FINANCIAL ANALYSIS

Provide a dedicated research page for every NIFTY 50 company.

Include:
- Company information.
- Share price performance.
- Financial statement analysis.
- Revenue and profitability trends.
- Financial ratios.
- Cash flow analysis.
- Debt analysis.
- Valuation metrics.
- Historical growth.
- Key financial observations.

Allow users to switch between companies without leaving the application.

The company selector should be fast, intuitive and searchable.

## MODULE C: FINANCIAL STATEMENT ANALYSIS

Create detailed interactive visualizations for:

- Income statement.
- Balance sheet.
- Cash flow statement.

Allow users to switch between annual and quarterly reporting where available.

Show historical movements and financial growth.

Provide detailed underlying numerical tables.

## MODULE D: ADVANCED ANALYTICS

This section should provide deeper financial insights.

Examples:
- Revenue versus net profit growth.
- Profitability comparison across companies.
- Debt versus equity analysis.
- ROE comparison.
- Valuation multiples comparison.
- Sector-level comparisons.
- Risk and return analysis.
- Historical performance rankings.

Use suitable charts such as:
- Interactive line charts.
- Bar charts.
- Stacked charts.
- Waterfall charts.
- Scatter plots.
- Treemaps.
- Heatmaps.
- Radar charts where analytically justified.

Choose chart types based on the analytical question, not simply to make the dashboard look impressive.

## MODULE E: COMPANY COMPARISON

This must be a major feature.

Allow users to select multiple NIFTY 50 companies and compare them.

Include:
- Revenue growth.
- Profitability.
- Financial ratios.
- Valuation.
- Market performance.
- Risk metrics.

Support comparison of multiple companies on the same visualization.

Allow period selection and appropriate normalization.

For example, compare the share price performance of different companies using a common starting base of 100.

Clearly identify missing metrics and avoid comparing incompatible data.

## MODULE F: FINANCIAL INTELLIGENCE

Create an intelligent analytical section.

Generate data-driven observations such as:

- Revenue increased while net profit declined.
- Operating margins improved.
- Debt levels increased faster than equity.
- Cash flow diverged from reported earnings.
- A company outperformed its sector.
- Valuation multiples changed significantly.

Generate management-style and investment-research-style observations.

Every observation must be supported by actual calculations.

Do not use an LLM to invent financial insights.

Use deterministic calculations for financial analysis. If an LLM is added later, restrict it to explaining verified results.

Clearly distinguish factual observations from investment opinions.

---

# 6. INTERACTIVITY

This must be a genuinely dynamic application.

Implement:

### Global controls
- Company selection.
- Sector selection.
- Financial year.
- Custom date ranges.
- Quarterly/annual toggle.
- Currency and unit presentation where relevant.

### Chart interactions
- Interactive tooltips.
- Zoom and pan where appropriate.
- Chart legends.
- Metric selection.
- Dynamic filtering.
- Drill-down.
- Expand chart view.
- Export chart data.

### Application interactions
- Searchable company selector.
- Comparison builder.
- Theme switcher.
- Filter reset.
- Interactive tables.
- Sorting.
- Pagination.
- Download controls.

All relevant components must respond to user selections.

Never create buttons that look functional but do nothing.

---

# 7. EXCEL EXPORT CENTRE

Excel integration is a core product feature.

Build a sophisticated export centre.

Users should be able to export:

1. Complete NIFTY 50 dataset.
2. Individual company financial statements.
3. Individual company financial analysis.
4. Financial KPI calculations.
5. Historical share price data.
6. Company comparison reports.
7. Sector comparison reports.
8. Filtered dashboard data.
9. Complete financial research workbook.

### Workbook structure

Create professionally formatted Excel workbooks with appropriate sheets:

- README
- Company_Master
- Raw_Market_Data
- Historical_Prices
- Income_Statement
- Balance_Sheet
- Cash_Flow
- KPI_Calculations
- Financial_Ratios
- Company_Comparison
- Sector_Analysis
- Dashboard_Data
- Data_Coverage

Adapt the workbook to the actual available data.

Use:
- Excel formulas.
- Cell references.
- Structured tables.
- Number formatting.
- Conditional formatting.
- Professional layouts.
- Frozen headers.
- Filters.
- Clear units.
- Source and methodology notes.

Calculated metrics should use Excel formulas wherever practical rather than simply exporting static calculated numbers.

Where an Excel formula is not practical, clearly document the calculation methodology.

**Critical feature:** Exporting after applying dashboard filters must export the relevant filtered dataset, not the entire unfiltered dataset.

Also provide one-click downloads for individual company reports.

---

# 8. DATA ENGINEERING AND AUTOMATIC UPDATES

Design a proper data pipeline.

It should support:

- Initial historical data acquisition.
- Incremental price updates.
- Periodic financial statement refreshes.
- Caching.
- Data validation.
- Error logging.
- Retry mechanisms.
- Data freshness tracking.

Do not make the frontend download historical financial data repeatedly.

Separate:
1. Data acquisition.
2. Data storage.
3. Financial calculations.
4. API/data serving.
5. Frontend presentation.
6. Excel generation.

Make the system modular and maintainable.

---

# 9. TECHNOLOGY STACK

Choose the most appropriate architecture.

Preferred technologies:

Frontend:
- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- A powerful charting library such as Apache ECharts.

Backend/data pipeline:
- Python.
- yfinance.
- Pandas.
- NumPy.
- OpenPyXL or XlsxWriter.

Storage:
- Evaluate SQLite, PostgreSQL, Cloudflare D1, R2 or static JSON/Parquet storage based on actual requirements.

Deployment:
- GitHub.
- Cloudflare Pages.
- Cloudflare Workers/Functions where necessary.
- GitHub Actions for scheduled Python data ingestion.

You are free to select a better stack if there is a compelling technical reason.

Do not unnecessarily introduce complex infrastructure.

---

# 10. PUBLIC HOSTING AND DEPLOYMENT

The final product MUST be hosted online.

I want a publicly accessible URL that I can share with my professor and classmates.

Preferred hosting:
1. Cloudflare Pages.
2. GitHub Pages if technically suitable.
3. Another reliable free-tier hosting solution if necessary.

IMPORTANT TECHNICAL CONSIDERATION:

Cloudflare Pages is suitable for hosting the frontend, but Python yfinance cannot simply run inside a static Pages deployment.

Design a proper deployment architecture.

Possible architecture:
- Python yfinance ingestion using GitHub Actions.
- Process and validate the data.
- Store generated datasets in an appropriate storage layer.
- Serve the data through static assets or a lightweight API.
- Host the frontend using Cloudflare Pages.
- Use Cloudflare Workers/Functions if required.

Choose the architecture based on reliability, cost and maintainability.

The application should continue working even if the user is not running Claude Code or their local computer.

Do not make the hosted dashboard depend on localhost.

Do not expose API keys or credentials in frontend code.

### Deployment deliverables

- Complete GitHub repository.
- Clean project structure.
- README.
- Environment variable documentation.
- Deployment configuration.
- Data update instructions.
- Public deployment URL.
- Instructions to reproduce the deployment.

If deployment requires account authorization, guide me through the required steps. Do not claim deployment is complete until a working public URL has been verified.

---

# 11. ACADEMIC ASSIGNMENT DOCUMENTATION

My MBA assignment requires that I explicitly mention the AI tool and prompts used.

Create a dedicated documentation file.

Include:

### AI tool used
Claude Code.

Mention the actual model/version used if identifiable.

### Prompts provided

Document the actual prompts used during development, including:

1. Dataset inspection.
2. Financial KPI identification.
3. Financial chart recommendations.
4. Financial analysis.
5. Dashboard architecture.
6. UI/UX development.
7. Excel integration.
8. Testing and deployment.

Maintain an accurate record of the prompts actually used.

### AI contribution note

Write a brief but professional academic explanation of how AI contributed to:

- Financial dataset interpretation.
- Financial KPI identification.
- Visualization recommendations.
- Financial analysis.
- Interactive dashboard development.
- Excel report generation.
- Data automation.
- Financial decision support.

Do not exaggerate AI capabilities or claim human verification that did not occur.

---

# 12. EXECUTION PLAN

Work autonomously in the following phases.

PHASE 1 — REFERENCE ANALYSIS
- Inspect the supplied Excel workbook.
- Understand the analysis methodology.
- Document the proposed financial metrics.

PHASE 2 — DATA ACQUISITION
- Identify the NIFTY 50 constituents.
- Build the yfinance acquisition pipeline.
- Retrieve historical data.
- Audit data coverage.

PHASE 3 — FINANCIAL ANALYTICS
- Build the KPI calculation engine.
- Validate financial formulas.
- Create company and sector analytics.

PHASE 4 — PRODUCT DESIGN
- Establish the design system.
- Design navigation and application architecture.
- Build the major dashboard modules.

PHASE 5 — DEVELOPMENT
- Implement frontend.
- Implement data-serving architecture.
- Connect financial calculations.
- Implement all interactions.

PHASE 6 — EXCEL INTEGRATION
- Build export functionality.
- Create professional workbooks.
- Validate formulas and filtered exports.

PHASE 7 — TESTING
- Verify financial calculations.
- Test every major feature.
- Test exports.
- Test data updates.
- Test responsive design.
- Resolve errors.

PHASE 8 — HOSTING
- Prepare GitHub repository.
- Configure deployment.
- Deploy publicly.
- Verify the actual public URL.

PHASE 9 — ACADEMIC DOCUMENTATION
- Document AI usage.
- Document prompts.
- Prepare the AI contribution note.
- Prepare project methodology.

---

# 13. IMPORTANT DEVELOPMENT RULES

1. Inspect the existing working directory before creating or modifying files.
2. Inspect the reference Excel workbook before designing the financial analysis.
3. Do not overwrite existing work unnecessarily.
4. Do not start with a generic dashboard template.
5. Do not fabricate financial data.
6. Do not leave important features as placeholders.
7. Do not sacrifice financial accuracy for visual appeal.
8. Test actual functionality, not just appearance.
9. Keep the code organized and maintainable.
10. Make reasonable autonomous decisions.
11. Ask questions only when blocked by a genuinely necessary missing input.
12. Maintain a progress log and update the README.

If the dataset is large, build a robust data pipeline instead of loading everything into the browser.

If a yfinance field is unavailable, handle it gracefully and document the limitation.

If free-tier hosting introduces architectural limitations, adapt the architecture rather than abandoning public hosting.

---

# FINAL SUCCESS CRITERIA

The project is complete only when:

- The NIFTY 50 company universe is available.
- Historical market data is acquired and validated.
- Financial statement coverage is audited.
- Financial KPIs are calculated accurately.
- Company-level analysis works.
- Company comparisons work.
- Sector analytics work.
- Dashboard filters dynamically update visualizations.
- Excel exports generate valid workbooks.
- Filtered exports work correctly.
- The application is responsive.
- The public website is accessible.
- Documentation of actual AI usage is complete.

**My vision:**

I want to open the website and feel like I am using a premium institutional financial research terminal.

It should be visually exceptional, analytically powerful, extremely interactive and genuinely useful.

Make the product memorable.

Do not stop at a plan, wireframe or prototype. Build, test and deploy the complete application.
