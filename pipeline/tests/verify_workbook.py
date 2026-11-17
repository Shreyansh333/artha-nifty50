"""Independent recalculation check of the complete research workbook.

Builds a copy of the workbook (with a short price window to keep it small), recalculates every
formula with the `formulas` Excel engine, and compares each result with the value the Python KPI
engine computed (stored in the cell as the cached result). Any mismatch means an Excel formula
does not reproduce the engine's methodology.

    python pipeline/tests/verify_workbook.py [output_dir]
"""
from __future__ import annotations

import math
import sys
import tempfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import formulas  # noqa: E402
import openpyxl  # noqa: E402

from n50.excel_workbook import build_workbook  # noqa: E402

SHEETS = ["KPI_CALCULATIONS", "FINANCIAL_RATIOS", "COMPANY_COMPARISON", "SECTOR_ANALYSIS", "HISTORICAL_PRICES"]


def main() -> int:
    if len(sys.argv) > 2 and sys.argv[1] == "--file":
        bad = 0
        for f in sys.argv[2:]:
            print(f"== {Path(f).name}")
            bad += verify(Path(f), None)
        return 1 if bad else 0
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    path = out_dir / "verify_workbook.xlsx"
    build_workbook(out_path=path, price_years=0.03, write_manifest=False)
    return 1 if verify(path, SHEETS) else 0


def verify(path: Path, sheets: list[str] | None) -> int:
    """Recalculate `path` and compare with cached values. Returns number of mismatches."""
    cached = openpyxl.load_workbook(path, data_only=True)
    formulas_wb = openpyxl.load_workbook(path, data_only=False)
    model = formulas.ExcelModel().loads(str(path)).finish()
    sol = model.calculate()

    calc = {}
    for k, v in sol.items():
        key = str(k).upper()
        if "!" not in key:
            continue
        sheet = key.split("]")[-1].split("'!")[0].strip("'")
        cell = key.split("!")[-1]
        if ":" in cell:
            continue
        try:
            val = v.value[0, 0]
        except Exception:  # noqa: BLE001
            val = v
        calc[(sheet, cell)] = val

    stats = Counter()
    mismatches = []
    for ws in formulas_wb.worksheets:
        name = ws.title.upper()
        if sheets is not None and name not in sheets:
            continue
        for row in ws.iter_rows():
            for c in row:
                if not (isinstance(c.value, str) and c.value.startswith("=")):
                    continue
                stats[name, "formulas"] += 1
                want = cached[ws.title][c.coordinate].value
                got = calc.get((name, c.coordinate))
                if got is None or (isinstance(got, str) and got.startswith("#")) or type(got).__name__ in ("XlError", "Error"):
                    stats[name, "engine_unsupported_or_error"] += 1
                    if len(mismatches) < 15:
                        mismatches.append((ws.title, c.coordinate, c.value[:90], want, got))
                    continue
                blank_want = want in (None, "")
                blank_got = got in ("", None) or (isinstance(got, str) and got.strip() == "")
                if blank_want and blank_got:
                    stats[name, "match"] += 1
                    continue
                try:
                    ok = not blank_want and math.isclose(float(got), float(want), rel_tol=1e-5, abs_tol=1e-6)
                except (TypeError, ValueError):
                    ok = False
                if ok:
                    stats[name, "match"] += 1
                else:
                    stats[name, "mismatch"] += 1
                    if len(mismatches) < 40:
                        mismatches.append((ws.title, c.coordinate, c.value[:90], want, got))

    print("Recalculation results")
    for sheet in (sheets or sorted({s for s, _ in stats})):
        f = stats[sheet, "formulas"]
        if f:
            print(f"  {sheet:20s} formulas={f:6d}  match={stats[sheet, 'match']:6d}  mismatch={stats[sheet, 'mismatch']:4d}  "
                  f"unsupported/error={stats[sheet, 'engine_unsupported_or_error']:4d}")
    if mismatches:
        print("\nFirst issues:")
        for m in mismatches:
            print("  ", m)
    return sum(v for (s, k), v in stats.items() if k == "mismatch")


if __name__ == "__main__":
    raise SystemExit(main())
