import { api } from "../lib/data";
import { buildMetrics, median, type Metric } from "../lib/metrics";
import { stamp } from "../lib/download";
import { C, CONVENTIONS, NF, colL, f, loadExcel, newBook, readme, redGreen, saveBook, sheetTitle, styleHeader, writeGrid } from "./common";
import type { UniverseRow } from "../lib/types";

const CMP = [
  "market_cap", "pe_now", "pb_now", "ps_now", "ev_ebitda_now", "div_yield_now",
  "revenue_growth", "net_income_growth", "eps_growth", "rev_cagr", "gross_margin", "ebitda_margin", "ebit_margin", "net_margin",
  "roe", "roa", "roce", "current_ratio", "quick_ratio", "debt_to_equity", "interest_coverage", "asset_turnover",
  "cash_conversion", "fcf_margin", "dividend_payout", "ret_1M", "ret_YTD", "ret_1Y", "cagr_3Y", "cagr_5Y",
  "vol_1Y", "vol_3Y", "sharpe_3Y", "beta_3Y", "max_dd_5Y",
];

export const fmtFor = (m: Metric) => (m.unit === "pct" ? NF.pct : m.unit === "inr" ? NF.cr : m.unit === "days" ? NF.days : m.unit === "inr_ps" ? NF.inr : NF.x);
export const valFor = (m: Metric, r: UniverseRow, fy: string) => {
  const v = m.get(r, fy);
  return v === null || v === undefined ? null : m.unit === "inr" ? v / 1e7 : v;
};

/** Metrics-by-company sheet with summary statistics and rank formulas (shared with sector/filtered exports). */
export function metricsSheet(wb: any, name: string, title: string, rows: UniverseRow[], metrics: Metric[], fy: string, opts: { ranks?: boolean } = {}) {
  const ws = wb.addWorksheet(name);
  sheetTitle(ws, title, `Fiscal-year metrics: ${fy === "latest" ? "each company's latest FY" : fy} · market metrics: latest close · money in ₹ Cr · blank = unavailable / not applicable`);
  const fixed = ["Symbol", "Company", "Sector"];
  const cols = [...fixed.map((h) => ({ header: h, width: h === "Company" ? 34 : h === "Sector" ? 26 : 12 })), ...metrics.map((m) => ({ header: m.label, width: 14, numFmt: fmtFor(m) }))];
  const { firstRow, lastRow } = writeGrid(ws, 4, cols, rows.map((r) => [r.symbol, r.name, r.sector, ...metrics.map((m) => valFor(m, r, fy))]), { freezeCols: 1 });
  // summary rows with formulas
  const stats: [string, string][] = [["Average", "AVERAGE"], ["Median", "MEDIAN"], ["Maximum", "MAX"], ["Minimum", "MIN"], ["Count (reported)", "COUNT"]];
  stats.forEach(([label, fn], k) => {
    const rr = lastRow + 2 + k;
    ws.getCell(`C${rr}`).value = label;
    ws.getCell(`C${rr}`).font = { bold: true, size: 10 };
    metrics.forEach((m, j) => {
      const col = colL(fixed.length + 1 + j);
      const vals = rows.map((r) => valFor(m, r, fy)).filter((x): x is number => x !== null);
      const res = !vals.length ? null : fn === "AVERAGE" ? vals.reduce((a, b) => a + b, 0) / vals.length : fn === "MAX" ? Math.max(...vals) : fn === "MIN" ? Math.min(...vals) : fn === "COUNT" ? vals.length : median(vals);
      const cell = ws.getCell(`${col}${rr}`);
      cell.value = f(vals.length || fn === "COUNT" ? `${fn}(${col}${firstRow}:${col}${lastRow})` : `""`, res);
      cell.numFmt = fn === "COUNT" ? NF.int : fmtFor(m);
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };
    });
  });
  if (opts.ranks !== false) {
    const r0 = lastRow + 2 + stats.length + 2;
    ws.getCell(`A${r0 - 1}`).value = "RANKS (1 = best; direction-aware; blank when unavailable or direction not meaningful)";
    ws.getCell(`A${r0 - 1}`).font = { bold: true, size: 9, color: { argb: C.accent } };
    const hr = ws.getRow(r0);
    [...fixed, ...metrics.map((m) => m.label)].forEach((h, i) => (hr.getCell(i + 1).value = h));
    styleHeader(hr);
    rows.forEach((r, k) => {
      const rr = r0 + 1 + k;
      ws.getCell(`A${rr}`).value = r.symbol;
      ws.getCell(`B${rr}`).value = r.name;
      ws.getCell(`C${rr}`).value = r.sector;
      metrics.forEach((m, j) => {
        if (!m.better) return;
        const col = colL(fixed.length + 1 + j);
        const src = `${col}${firstRow + k}`;
        const vals = rows.map((x) => valFor(m, x, fy)).filter((x): x is number => x !== null);
        const v = valFor(m, r, fy);
        const res = v === null ? null : 1 + vals.filter((x) => (m.better === "higher" ? x > v : x < v)).length;
        ws.getCell(`${col}${rr}`).value = f(`IF(ISNUMBER(${src}),RANK(${src},${col}$${firstRow}:${col}$${lastRow},${m.better === "higher" ? 0 : 1}),"")`, res);
      });
    });
  }
  // conditional formatting: growth/returns red-green
  metrics.forEach((m, j) => {
    if (m.unit === "pct" && m.better === "higher") redGreen(ws, `${colL(fixed.length + 1 + j)}${firstRow}:${colL(fixed.length + 1 + j)}${lastRow}`);
  });
  return { ws, firstRow, lastRow };
}

export async function comparisonReport(symbols: string[], fy: string, range: [string, string] | null, basis: "total" | "price") {
  const [ExcelJS, uni, dict, meta] = await Promise.all([loadExcel(), api.universe(), api.kpiDictionary(), api.meta()]);
  const metrics = buildMetrics(dict);
  const M = (id: string) => metrics.find((m) => m.id === id)!;
  const rows = symbols.map((s) => uni.find((r) => r.symbol === s)).filter(Boolean) as UniverseRow[];
  const wb = newBook(ExcelJS, `NIFTY 50 comparison — ${symbols.join(", ")}`);

  readme(wb, `Company comparison report — ${symbols.join(" · ")}`, meta, [
    ["Selection (exported filters)", [
      `Companies :: ${rows.map((r) => `${r.symbol} (${r.name})`).join("; ")}`,
      `Fiscal year :: ${fy === "latest" ? "Latest reported FY per company" : fy}`,
      `Price period :: ${range ? `${range[0]} to ${range[1]}` : "n/a"}`,
      `Price basis :: ${basis === "total" ? "Total return (Yahoo adjusted close)" : "Price (split-adjusted close)"}`,
    ]],
    ["Sheet guide", [
      "Company_Comparison :: Metrics side by side with AVERAGE/MEDIAN/MAX/MIN/COUNT formulas and RANK formulas.",
      "Normalized_Prices :: Daily prices for the period (inputs) and rebased-to-100 series as formulas (base = first available price in the period).",
      "Period_Statistics :: Period return per company computed by formula from Normalized_Prices.",
      "Fundamentals :: Revenue, net income and equity by fiscal year with YoY growth formulas.",
      "KPI_History :: Long-format KPI values per company and fiscal year (filterable).",
    ]],
    ["Conventions", CONVENTIONS],
  ]);

  metricsSheet(wb, "Company_Comparison", "Company comparison", rows, CMP.map(M).filter(Boolean), fy);

  // ---------------- normalized prices (formulas)
  if (range) {
    const px = await Promise.all(rows.map((r) => api.prices(r.symbol)));
    const dates = Array.from(new Set(px.flatMap((p) => p.d.filter((d) => d >= range[0] && d <= range[1])))).sort();
    const ws = wb.addWorksheet("Normalized_Prices");
    const n = rows.length;
    const first = 4, last = first + dates.length - 1;
    const hr = ws.getRow(3);
    hr.getCell(1).value = "Date";
    rows.forEach((r, i) => {
      hr.getCell(2 + i).value = `${r.symbol} ${basis === "total" ? "adj. close" : "close"}`;
      hr.getCell(2 + n + i).value = `${r.symbol} rebased (=100)`;
    });
    styleHeader(hr);
    ws.getCell("A2").value = "Base (first price in period) →";
    ws.getCell("A2").font = { italic: true, size: 9, color: { argb: C.muted } };
    ws.getCell("A1").value = `Rebased performance ${range[0]} → ${range[1]} (inputs in blue; rebased series are formulas)`;
    ws.getCell("A1").font = { bold: true, size: 12 };
    const maps = px.map((p) => new Map(p.d.map((d, i) => [d, basis === "total" ? p.a[i] : p.c[i]])));
    dates.forEach((d, k) => {
      const rr = first + k;
      ws.getCell(`A${rr}`).value = new Date(d + "T00:00:00Z");
      ws.getCell(`A${rr}`).numFmt = NF.date;
      rows.forEach((_, i) => {
        const v = maps[i].get(d) ?? null;
        const c = ws.getCell(`${colL(2 + i)}${rr}`);
        c.value = v;
        c.numFmt = NF.num2;
        c.font = { color: { argb: C.input }, size: 10 };
      });
    });
    rows.forEach((_, i) => {
      const col = colL(2 + i), rc = colL(2 + n + i);
      const firstVal = dates.map((d) => maps[i].get(d)).find((v) => v !== null && v !== undefined) ?? null;
      ws.getCell(`${col}2`).value = f(`INDEX(${col}${first}:${col}${last},MATCH(TRUE,INDEX(ISNUMBER(${col}${first}:${col}${last}),0),0))`, firstVal);
      ws.getCell(`${col}2`).numFmt = NF.num2;
      dates.forEach((d, k) => {
        const rr = first + k;
        const v = maps[i].get(d);
        ws.getCell(`${rc}${rr}`).value = f(`IF(ISNUMBER(${col}${rr}),${col}${rr}/${col}$2*100,"")`, v && firstVal ? (v / firstVal) * 100 : null);
        ws.getCell(`${rc}${rr}`).numFmt = "0.0";
      });
      ws.getColumn(2 + i).width = 16;
      ws.getColumn(2 + n + i).width = 18;
    });
    ws.getColumn(1).width = 13;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: last, column: 1 + 2 * n } };

    const ps = wb.addWorksheet("Period_Statistics");
    sheetTitle(ps, "Period statistics", `${range[0]} → ${range[1]} · formulas reference Normalized_Prices`);
    const hr2 = ps.getRow(4);
    ["Symbol", "First price", "Last price", "Period return"].forEach((h, i) => (hr2.getCell(i + 1).value = h));
    styleHeader(hr2);
    rows.forEach((r, i) => {
      const col = colL(2 + i), rr = 5 + i;
      const vals = dates.map((d) => maps[i].get(d)).filter((v): v is number => v !== null && v !== undefined);
      ps.getCell(`A${rr}`).value = r.symbol;
      ps.getCell(`B${rr}`).value = f(`Normalized_Prices!${col}2`, vals[0] ?? null);
      ps.getCell(`C${rr}`).value = f(`LOOKUP(2,1/ISNUMBER(Normalized_Prices!${col}${first}:${col}${last}),Normalized_Prices!${col}${first}:${col}${last})`, vals[vals.length - 1] ?? null);
      ps.getCell(`D${rr}`).value = f(`IF(AND(ISNUMBER(B${rr}),ISNUMBER(C${rr})),C${rr}/B${rr}-1,"")`, vals.length ? vals[vals.length - 1] / vals[0] - 1 : null);
      ps.getCell(`B${rr}`).numFmt = NF.num2;
      ps.getCell(`C${rr}`).numFmt = NF.num2;
      ps.getCell(`D${rr}`).numFmt = NF.pct;
    });
    ps.getColumn(1).width = 14; [2, 3, 4].forEach((c) => (ps.getColumn(c).width = 16));
    redGreen(ps, `D5:D${4 + rows.length}`);
  }

  // ---------------- fundamentals with growth formulas
  const fs = wb.addWorksheet("Fundamentals");
  sheetTitle(fs, "Fundamentals by fiscal year", "₹ Crore · YoY growth columns are formulas (blank when prior year unavailable or ≤ 0)");
  const fys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.fund_hist?.revenue ?? {})))).sort();
  let rr = 4;
  for (const [field, label] of [["revenue", "Revenue"], ["net_income", "Net income"], ["equity", "Shareholders' equity"], ["total_debt", "Total debt"], ["operating_cf", "Operating cash flow"]] as const) {
    const hr = fs.getRow(rr);
    hr.getCell(1).value = `${label} (₹ Cr)`;
    fys.forEach((fyy, j) => (hr.getCell(2 + j).value = fyy));
    fys.slice(1).forEach((fyy, j) => (hr.getCell(2 + fys.length + j).value = `YoY ${fyy}`));
    styleHeader(hr);
    rows.forEach((r) => {
      rr++;
      fs.getCell(`A${rr}`).value = r.symbol;
      fys.forEach((fyy, j) => {
        const v = r.fund_hist?.[field]?.[fyy];
        const c = fs.getCell(`${colL(2 + j)}${rr}`);
        c.value = v === undefined ? null : v / 1e7;
        c.numFmt = NF.cr;
        c.font = { color: { argb: C.input }, size: 10 };
      });
      fys.slice(1).forEach((_, j) => {
        const a = `${colL(2 + j)}${rr}`, b = `${colL(3 + j)}${rr}`;
        const va = r.fund_hist?.[field]?.[fys[j]], vb = r.fund_hist?.[field]?.[fys[j + 1]];
        const c = fs.getCell(`${colL(2 + fys.length + j)}${rr}`);
        c.value = f(`IF(AND(ISNUMBER(${a}),ISNUMBER(${b}),${a}>0),${b}/${a}-1,"")`, va && vb && va > 0 ? vb / va - 1 : null);
        c.numFmt = NF.pct;
      });
    });
    redGreen(fs, `${colL(2 + fys.length)}${rr - rows.length + 1}:${colL(1 + 2 * fys.length)}${rr}`);
    rr += 2;
  }
  fs.getColumn(1).width = 26;

  // ---------------- KPI history long table
  const kh = wb.addWorksheet("KPI_History");
  const long: any[][] = [];
  rows.forEach((r) => dict.forEach((k) => Object.entries(r.kpi_hist?.[k.id] ?? {}).forEach(([fyy, v]) => long.push([r.symbol, k.group, k.name, fyy, ["operating_cf", "fcf"].includes(k.id) ? v / 1e7 : v, k.unit === "pct" ? "%" : k.unit === "inr" ? "₹ Cr" : k.unit]))));
  writeGrid(kh, 1, [{ header: "Symbol", width: 12 }, { header: "Group", width: 14 }, { header: "KPI", width: 34 }, { header: "Fiscal year", width: 12 }, { header: "Value", width: 14, numFmt: "0.0000" }, { header: "Unit", width: 8 }], long);

  await saveBook(wb, `NIFTY50_Comparison_${symbols.join("-")}_${stamp()}.xlsx`);
}
