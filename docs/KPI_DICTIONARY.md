# KPI dictionary

_Generated from `pipeline/n50/kpis.py` by `python pipeline/run.py docs`. Every KPI is computed by the same engine for every company; unavailable values carry a reason code instead of a number._

## Growth

| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |
|---|---|---|---|---|---|---|
| **Revenue Growth** | `Revenueₜ / Revenueₜ₋₁ − 1` | revenue | Annual (fiscal year); balance-sheet items at period end | pct | yes | Pace of top-line expansion; the primary driver of long-run earnings growth. |
| **EBITDA Growth** | `EBITDAₜ / EBITDAₜ₋₁ − 1` | ebitda | Annual (fiscal year); balance-sheet items at period end | pct | n/a | Growth in operating cash earnings before capital structure and depreciation choices. |
| **Net Profit Growth** | `Net Incomeₜ / Net Incomeₜ₋₁ − 1` | net_income | Annual (fiscal year); balance-sheet items at period end | pct | yes | Growth in profit attributable to shareholders; not meaningful from a loss-making base. |
| **EPS Growth** | `Diluted EPSₜ / Diluted EPSₜ₋₁ − 1` | eps_diluted | Annual (fiscal year); balance-sheet items at period end | pct | yes | Per-share earnings growth — captures dilution from new share issuance that net-profit growth hides. |

## Profitability

| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |
|---|---|---|---|---|---|---|
| **Gross Margin** | `Gross Profit / Revenue` | gross_profit, revenue, cost_of_revenue | Annual (fiscal year); balance-sheet items at period end | pct | n/a | Pricing power and direct-cost efficiency. Withheld when cost of revenue is not reported (a 100% 'gross margin' would be an artefact, not economics). |
| **EBITDA Margin** | `EBITDA / Revenue` | ebitda, revenue | Annual (fiscal year); balance-sheet items at period end | pct | n/a | Operating profitability before depreciation, interest and tax; comparable across capital structures. |
| **EBIT (Operating) Margin** | `EBIT / Revenue` | ebit, revenue | Annual (fiscal year); balance-sheet items at period end | pct | n/a | Profitability after depreciation — reflects capital intensity of the business model. |
| **Net Profit Margin** | `Net Income / Revenue` | net_income, revenue | Annual (fiscal year); balance-sheet items at period end | pct | yes | Share of every rupee of revenue retained as shareholder profit after all costs. |
| **Return on Equity** | `Net Income / Shareholders' Equity (period end)` | net_income, equity | Annual (fiscal year); balance-sheet items at period end | pct | yes | Return generated on shareholders' capital; the core measure of value creation for equity holders. |
| **Return on Assets** | `Net Income / Total Assets (period end)` | net_income, total_assets | Annual (fiscal year); balance-sheet items at period end | pct | yes | Profit generated per rupee of assets; the key profitability lens for banks and lenders. |
| **Return on Capital Employed** | `EBIT / (Total Assets − Current Liabilities)` | ebit, total_assets, current_liabilities | Annual (fiscal year); balance-sheet items at period end | pct | n/a | Pre-tax operating return on all long-term capital (debt + equity); compare against cost of capital. |

## Liquidity

| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |
|---|---|---|---|---|---|---|
| **Current Ratio** | `Current Assets / Current Liabilities` | current_assets, current_liabilities | Annual (fiscal year); balance-sheet items at period end | x | n/a | Short-term solvency: ability to meet obligations due within a year from short-term assets. |
| **Quick Ratio** | `(Current Assets − Inventory) / Current Liabilities` | current_assets, inventory, current_liabilities | Annual (fiscal year); balance-sheet items at period end | x | n/a | Stricter liquidity test that excludes inventory, which may not convert to cash quickly. |
| **Cash Ratio** | `(Cash + Short-term Investments) / Current Liabilities` | cash_and_sti, current_liabilities | Annual (fiscal year); balance-sheet items at period end | x | n/a | Most conservative liquidity measure — obligations coverable from cash on hand. |

## Solvency

| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |
|---|---|---|---|---|---|---|
| **Debt to Equity** | `Total Debt / Shareholders' Equity` | total_debt, equity | Annual (fiscal year); balance-sheet items at period end | x | yes | Financial leverage. For lenders, Yahoo's 'Total Debt' covers borrowings, not deposits — compare banks only with banks. |
| **Debt to Assets** | `Total Debt / Total Assets` | total_debt, total_assets | Annual (fiscal year); balance-sheet items at period end | pct | yes | Share of the asset base funded by borrowings. |
| **Interest Coverage** | `EBIT / Interest Expense` | ebit, interest_expense | Annual (fiscal year); balance-sheet items at period end | x | n/a | Times operating profit covers interest; below ~1.5× signals debt-service stress. |
| **Net Debt / EBITDA** | `(Total Debt − Cash & ST Investments) / EBITDA` | total_debt, cash_and_sti, ebitda | Annual (fiscal year); balance-sheet items at period end | x | n/a | Years of operating cash earnings needed to repay net debt; negative means net cash. |

## Efficiency

| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |
|---|---|---|---|---|---|---|
| **Asset Turnover** | `Revenue / Total Assets (period end)` | revenue, total_assets | Annual (fiscal year); balance-sheet items at period end | x | yes | Revenue generated per rupee of assets; links margins to ROA (DuPont). |
| **Inventory Turnover** | `Cost of Revenue / Inventory` | cost_of_revenue, inventory | Annual (fiscal year); balance-sheet items at period end | x | n/a | How many times inventory is sold and replaced in a year; only for inventory-holding businesses. |
| **Receivables Turnover** | `Revenue / Receivables` | revenue, receivables | Annual (fiscal year); balance-sheet items at period end | x | n/a | Speed of cash collection from customers. |
| **Debtor Days** | `Receivables / Revenue × 365` | receivables, revenue | Annual (fiscal year); balance-sheet items at period end | days | n/a | Average collection period in days. |

## Cash Flow

| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |
|---|---|---|---|---|---|---|
| **Operating Cash Flow** | `Cash generated from operations (as reported)` | operating_cf | Annual (fiscal year); balance-sheet items at period end | inr | yes | Cash actually generated by the business — harder to manage than accounting profit. |
| **Free Cash Flow** | `Operating Cash Flow − |Capital Expenditure|` | operating_cf, capex | Annual (fiscal year); balance-sheet items at period end | inr | yes | Cash available to repay debt, pay dividends or reinvest after maintaining the asset base. |
| **Cash Conversion (CFO / Net Income)** | `Operating Cash Flow / Net Income` | operating_cf, net_income | Annual (fiscal year); balance-sheet items at period end | x | yes | Earnings quality: persistently below 1× means profits are not turning into cash. Lenders' CFO is distorted by loan growth. |
| **FCF Margin** | `Free Cash Flow / Revenue` | operating_cf, capex, revenue | Annual (fiscal year); balance-sheet items at period end | pct | yes | Share of revenue converted to free cash. |
| **Capex Intensity** | `|Capital Expenditure| / Revenue` | capex, revenue | Annual (fiscal year); balance-sheet items at period end | pct | yes | Reinvestment rate; high values indicate a capital-intensive or expansion phase. |
| **Dividend Payout** | `|Dividends Paid| / Net Income` | dividends_paid, net_income | Annual (fiscal year); balance-sheet items at period end | pct | yes | Share of profit returned to shareholders as cash dividends. |

## Valuation

| KPI | Formula | Inputs | Basis | Unit | Lenders | Significance |
|---|---|---|---|---|---|---|
| **EPS (Diluted)** | `Diluted EPS as reported` | eps_diluted | Annual (fiscal year); balance-sheet items at period end | inr_ps | yes | Profit per share — as reported for that year (not restated for later splits/bonuses). |
| **Book Value per Share** | `Shareholders' Equity / Shares Outstanding` | equity, shares_outstanding | Annual (fiscal year); balance-sheet items at period end | inr_ps | yes | Accounting net worth per share. |
| **Price / Earnings** | `Market Cap at FY end / Net Income` | market_cap_fy, net_income | Fiscal-year end market cap ÷ that year's net income | x | yes | Rupees paid per rupee of annual profit. Computed on aggregates, so immune to share-count restatements. |
| **Price / Book** | `Market Cap at FY end / Shareholders' Equity` | market_cap_fy, equity | Fiscal-year end market cap ÷ period-end equity | x | yes | Premium to accounting net worth; the anchor multiple for banks. |
| **Price / Sales** | `Market Cap at FY end / Revenue` | market_cap_fy, revenue | Fiscal-year end market cap ÷ that year's revenue | x | yes | Valuation relative to revenue; useful when earnings are depressed or negative. |
| **EV / EBITDA** | `(Market Cap + Total Debt − Cash & ST Inv.) / EBITDA` | market_cap_fy, total_debt, cash_and_sti, ebitda | Fiscal-year end enterprise value ÷ that year's EBITDA | x | n/a | Capital-structure-neutral valuation of operating earnings. |
| **Dividend Yield** | `|Dividends Paid| / Market Cap at FY end` | dividends_paid, market_cap_fy | Dividends paid in the fiscal year ÷ fiscal-year end market cap | pct | yes | Cash return to shareholders relative to the price paid. |

## Reason codes

| Code | Meaning |
|---|---|
| `missing:<field>` | Input not provided by Yahoo for that period |
| `na_financial` | Not meaningful for banks, NBFCs and insurers (no current assets/EBITDA in their balance-sheet format) |
| `nonpositive_denominator` | Denominator ≤ 0 (e.g. negative equity) |
| `negative_base` | Growth from a zero/negative base is not meaningful |
| `negative_earnings` | Multiple undefined for a loss-making period |
| `no_prior_period` | Growth needs a consecutive prior fiscal year (period ends 330–400 days apart) |
| `cogs_not_reported` | Gross profit equals revenue because cost of revenue is not reported |
