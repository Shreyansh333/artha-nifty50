"""KPI engine tests.

The first group reproduces ratios from the reference workbook
(Shreyansh_Surana_Bharti_Airtel_Ltd.xlsx, 'Data Sheet' FY2025–FY2026, ₹ Cr) to prove the engine's
formulas agree with the methodology the assignment is based on.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from n50 import kpis as K  # noqa: E402
from n50.build import consecutive_quarters, ttm  # noqa: E402
from n50.statements import fy_label, q_label  # noqa: E402
import pandas as pd  # noqa: E402

# Reference workbook values (₹ Cr), Bharti Airtel
FY25 = dict(revenue=172985, net_income=37481, equity=2900 + 110772, total_debt=213642, total_assets=505006,
            current_assets=67589, current_liabilities=198868, receivables=7583, operating_cf=98332, capex=-39342,
            pretax_income=38398, interest_expense=21754)
FY26 = dict(revenue=210973, net_income=33823, equity=3047 + 146010, total_debt=195412, total_assets=545373,
            current_assets=90215, current_liabilities=218533, receivables=8093, operating_cf=122230, capex=-45547,
            pretax_income=45173, interest_expense=21555, dividends_paid=-18603)
for d in (FY25, FY26):
    d["ebit"] = d["pretax_income"] + d["interest_expense"]   # workbook: (PBT + Interest)


def run(periods, fin=False):
    return K.compute_series(periods, fin)


@pytest.fixture
def airtel():
    return run([{"label": "FY2025", "end": "2025-03-31", "values": FY25},
                {"label": "FY2026", "end": "2026-03-31", "values": FY26}])


def v(res, kid, label="FY2026"):
    return res[kid]["values"].get(label)


def test_reference_workbook_ratios(airtel):
    # KPI Ratios sheet formulas, evaluated by hand from the Data Sheet
    assert v(airtel, "roe") == pytest.approx(33823 / 149057, rel=1e-5)              # ROE %
    assert v(airtel, "roa") == pytest.approx(33823 / 545373, rel=1e-5)              # ROA %
    assert v(airtel, "current_ratio") == pytest.approx(90215 / 218533, rel=1e-5)    # Current ratio
    assert v(airtel, "debt_to_equity") == pytest.approx(195412 / 149057, rel=1e-5)  # Debt to equity
    assert v(airtel, "interest_coverage") == pytest.approx((45173 + 21555) / 21555, rel=1e-5)
    assert v(airtel, "asset_turnover") == pytest.approx(210973 / 545373, rel=1e-5)
    assert v(airtel, "receivables_turnover") == pytest.approx(210973 / 8093, rel=1e-5)
    assert v(airtel, "debtor_days") == pytest.approx(8093 / 210973 * 365, rel=1e-5)
    assert v(airtel, "cash_conversion") == pytest.approx(122230 / 33823, rel=1e-5)  # CFO to net profit
    assert v(airtel, "fcf") == pytest.approx(122230 - 45547, rel=1e-5)              # Free cash flow
    assert v(airtel, "dividend_payout") == pytest.approx(18603 / 33823, rel=1e-5)
    assert v(airtel, "revenue_growth") == pytest.approx(210973 / 172985 - 1, rel=1e-5)
    assert v(airtel, "net_income_growth") == pytest.approx(33823 / 37481 - 1, rel=1e-5)
    assert v(airtel, "net_margin") == pytest.approx(33823 / 210973, rel=1e-5)


def test_missing_inputs_are_never_zero(airtel):
    # inventory not supplied → quick ratio unavailable (not computed as if inventory were 0)
    assert v(airtel, "quick_ratio") is None
    assert airtel["quick_ratio"]["na"]["FY2026"] == "missing:inventory"
    # no prior year for the first period
    assert airtel["revenue_growth"]["na"]["FY2025"] == "no_prior_period"
    # dividends not supplied in FY2025 → payout unavailable, not 0%
    assert airtel["dividend_payout"]["na"]["FY2025"] == "missing:dividends_paid"


def test_gross_margin_artefact_suppressed():
    # The reference workbook shows a 100% gross margin for a telecom with no COGS — we withhold it.
    r = run([{"label": "FY2026", "end": "2026-03-31", "values": {"revenue": 100.0, "gross_profit": 100.0, "cost_of_revenue": None}}])
    assert v(r, "gross_margin") is None and r["gross_margin"]["na"]["FY2026"] == "cogs_not_reported"


def test_negative_base_and_negative_earnings():
    r = run([{"label": "FY2025", "end": "2025-03-31", "values": {"net_income": -10.0, "revenue": 50.0}},
             {"label": "FY2026", "end": "2026-03-31", "values": {"net_income": 5.0, "revenue": 60.0, "market_cap_fy": 100.0}}])
    assert r["net_income_growth"]["na"]["FY2026"] == "negative_base"
    assert v(r, "pe") == pytest.approx(20.0)
    r2 = run([{"label": "FY2026", "end": "2026-03-31", "values": {"net_income": -5.0, "market_cap_fy": 100.0}}])
    assert r2["pe"]["na"]["FY2026"] == "negative_earnings"


def test_negative_equity_denominator():
    r = run([{"label": "FY2026", "end": "2026-03-31", "values": {"net_income": 5.0, "equity": -20.0, "total_debt": 50.0}}])
    assert r["roe"]["na"]["FY2026"] == "nonpositive_denominator"
    assert r["debt_to_equity"]["na"]["FY2026"] == "nonpositive_denominator"


def test_financials_not_applicable():
    r = run([{"label": "FY2026", "end": "2026-03-31", "values": FY26}], fin=True)
    for kid in ("current_ratio", "ebitda_margin", "roce", "interest_coverage"):
        assert r[kid]["na"]["FY2026"] == "na_financial"
    assert v(r, "roe") is not None


def test_growth_requires_consecutive_years():
    r = run([{"label": "FY2022·Dec", "end": "2022-12-31", "values": {"revenue": 100.0}},
             {"label": "FY2025", "end": "2025-03-31", "values": {"revenue": 150.0}}])
    assert r["revenue_growth"]["na"]["FY2025"] == "no_prior_period"


def test_labels():
    assert fy_label(pd.Timestamp("2026-03-31")) == "FY2026"
    assert fy_label(pd.Timestamp("2022-12-31")) == "FY2022·Dec"
    assert q_label(pd.Timestamp("2026-09-30")) == "Q2 FY27"
    assert q_label(pd.Timestamp("2026-03-31")) == "Q4 FY26"


def test_ttm_requires_consecutive_quarters():
    q = lambda e, x: {"label": e, "end": e, "values": {"revenue": x}}
    ok = [q("2025-12-31", 1), q("2026-03-31", 2), q("2026-06-30", 3), q("2026-09-30", 4)]
    assert ttm(consecutive_quarters(ok), "revenue") == 10
    gap = [q("2025-06-30", 1), q("2025-12-31", 2), q("2026-03-31", 3), q("2026-06-30", 4)]
    assert consecutive_quarters(gap) is None
