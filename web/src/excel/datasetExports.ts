import { api } from "../lib/data";
import { buildMetrics, filterBySector, type Metric } from "../lib/metrics";
import { useScreener, useSettings } from "../lib/store";
import { applyScreen, describeScreen } from "../lib/screen";
import { stamp } from "../lib/download";
import type { UniverseRow } from "../lib/types";
import { CONVENTIONS, NF, colL, f, loadExcel, newBook, readme, redGreen, saveBook, sheetTitle, styleHeader, writeGrid } from "./common";
import { fmtFor, metricsSheet, valFor } from "./comparisonReport";

async function base() {
  const [ExcelJS, uni, dict, meta] = await Promise.all([loadExcel(), api.universe(), api.kpiDictionary(), api.meta()]);
  return { ExcelJS, uni, meta, dict, metrics: buildMetrics(dict) };
}

function masterSheet(wb: any, rows: UniverseRow[]) {
  const ws = wb.addWorksheet("Company_Master");
  writeGrid(ws, 1, [
    { header: "Symbol", width: 12 }, { header: "Company", width: 40 }, { header: "NSE sector", width: 28 }, { header: "Yahoo industry", width: 30 },
    { header: "Lender/insurer framework", width: 14 }, { header: "Latest FY", width: 10 }, { header: "Last close (₹)", width: 13, numFmt: NF.inr },
    { header: "Price date", width: 12 }, { header: "Market cap (₹ Cr)", width: 16, numFmt: NF.cr }, { header: "KPI completeness", width: 12, numFmt: "0%" },
  ], rows.map((r) => [r.symbol, r.name, r.sector, r.industry ?? "", r.is_financial ? "Yes" : "No", r.latest_fy ?? "", r.snapshot.price ?? null,
    r.snapshot.last_date ?? "", r.valuation.market_cap ? r.valuation.market_cap / 1e7 : null, r.coverage]));
  return ws;
}

// ------------------------------------------------------------------ filtered screener view
export async function filteredExport() {
  const { ExcelJS, uni, meta, metrics } = await base();
  const s = useSettings.getState(), sc = useScreener.getState();
  const opts = { sectors: s.sectors, q: sc.q, conds: sc.conds, sort: sc.sort, dir: sc.dir, fy: s.fy };
  const rows = applyScreen(uni, opts, metrics);
  const cols = sc.cols.map((id) => metrics.find((m) => m.id === id)).filter(Boolean) as Metric[];
  const wb = newBook(ExcelJS, "NIFTY 50 — filtered dashboard data");
  readme(wb, "Filtered dashboard data (Screener view)", meta, [
    ["Filters applied at export", [...describeScreen(opts, metrics), `Rows exported :: ${rows.length} of ${uni.length} constituents`, `Columns :: ${cols.map((c) => c.label).join(", ")}`]],
    ["Sheet guide", ["Dashboard_Data :: Exactly the rows and columns visible in the screener (all pages), in the same sort order, with summary and rank formulas.", "Company_Master :: Identity and quote data for the exported companies."]],
    ["Conventions", CONVENTIONS],
  ]);
  metricsSheet(wb, "Dashboard_Data", "Filtered screener view", rows, cols, s.fy);
  masterSheet(wb, rows);
  await saveBook(wb, `NIFTY50_Filtered_View_${rows.length}cos_${stamp()}.xlsx`);
  return rows.length;
}

// ------------------------------------------------------------------ sector report (formula-driven)
const SECTOR_METRICS = ["market_cap", "ret_1M", "ret_YTD", "ret_1Y", "pe_now", "pb_now", "revenue_growth", "net_margin", "roe", "debt_to_equity", "div_yield_now", "vol_1Y"];

export async function sectorReport() {
  const { ExcelJS, uni, meta, metrics } = await base();
  const s = useSettings.getState();
  const rows = filterBySector(uni, s.sectors);
  const ms = SECTOR_METRICS.map((id) => metrics.find((m) => m.id === id)!).filter(Boolean);
  const wb = newBook(ExcelJS, "NIFTY 50 — sector comparison");
  readme(wb, "Sector comparison report", meta, [
    ["Filters applied at export", [`Sectors :: ${s.sectors.length ? s.sectors.join(", ") : "All"}`, `Fiscal year :: ${s.fy === "latest" ? "Latest reported FY per company" : s.fy}`, `Companies :: ${rows.length}`]],
    ["Sheet guide", [
      "Company_Data :: One row per constituent (inputs).",
      "Sector_Analysis :: Every figure is a live formula over Company_Data — COUNTIFS, SUMIFS, AVERAGEIFS, MAXIFS/MINIFS (Excel 2019+), and market-cap-weighted returns via SUMPRODUCT.",
      "Note :: Sector medians are shown in the web app; Excel averages are simple (unweighted) means of reporting companies and can be pulled by outliers.",
    ]],
    ["Conventions", CONVENTIONS],
  ]);
  const { firstRow, lastRow } = metricsSheet(wb, "Company_Data", "Company data (inputs for Sector_Analysis)", rows, ms, s.fy, { ranks: false });
  const sa = wb.addWorksheet("Sector_Analysis", { properties: { tabColor: { argb: "FF2A78D6" } } });
  sheetTitle(sa, "Sector analysis", "All values are formulas referencing Company_Data");
  const sectors = Array.from(new Set(rows.map((r) => r.sector))).sort();
  const rng = (col: string) => `Company_Data!$${col}$${firstRow}:$${col}$${lastRow}`;
  const SEC = rng("C");
  const colOf = (id: string) => colL(4 + ms.findIndex((m) => m.id === id));
  const heads = ["Sector", "Companies", "Total market cap (₹ Cr)", "Share of selection", "Cap-wtd return 1M", "Cap-wtd return 1Y",
    ...ms.filter((m) => m.id !== "market_cap").map((m) => `Avg ${m.label}`), "Best 1Y return", "Worst 1Y return"];
  const hr = sa.getRow(4);
  heads.forEach((h, i) => (hr.getCell(i + 1).value = h));
  styleHeader(hr);
  const total = rows.reduce((a, r) => a + (r.valuation.market_cap ?? 0), 0) / 1e7;
  sectors.forEach((sec, k) => {
    const rr = 5 + k;
    const mem = rows.filter((r) => r.sector === sec);
    const cap = mem.reduce((a, r) => a + (r.valuation.market_cap ?? 0), 0) / 1e7;
    sa.getCell(`A${rr}`).value = sec;
    sa.getCell(`B${rr}`).value = f(`COUNTIFS(${SEC},A${rr})`, mem.length);
    sa.getCell(`C${rr}`).value = f(`SUMIFS(${rng(colOf("market_cap"))},${SEC},A${rr})`, cap);
    sa.getCell(`C${rr}`).numFmt = NF.cr;
    sa.getCell(`D${rr}`).value = f(`IF(SUM(${rng(colOf("market_cap"))})>0,C${rr}/SUM(${rng(colOf("market_cap"))}),"")`, total ? cap / total : null);
    sa.getCell(`D${rr}`).numFmt = NF.pct;
    (["ret_1M", "ret_1Y"] as const).forEach((id, j) => {
      const R = rng(colOf(id)), MC = rng(colOf("market_cap"));
      const w = id === "ret_1M" ? "1M" : "1Y";
      const rep = mem.filter((r) => typeof r.returns[w] === "number");
      const num = rep.reduce((a, r) => a + (r.valuation.market_cap ?? 0) * (r.returns[w] as number), 0);
      const den = rep.reduce((a, r) => a + (r.valuation.market_cap ?? 0), 0);
      const cell = sa.getCell(`${colL(5 + j)}${rr}`);
      cell.value = f(`IFERROR(SUMPRODUCT((${SEC}=A${rr})*ISNUMBER(${R})*${MC},${R})/SUMPRODUCT((${SEC}=A${rr})*ISNUMBER(${R})*${MC}),"")`, den ? num / den : null);
      cell.numFmt = NF.pct;
    });
    ms.filter((m) => m.id !== "market_cap").forEach((m, j) => {
      const vals = mem.map((r) => valFor(m, r, s.fy)).filter((x): x is number => x !== null);
      const cell = sa.getCell(`${colL(7 + j)}${rr}`);
      cell.value = f(`IFERROR(AVERAGEIFS(${rng(colOf(m.id))},${SEC},A${rr}),"")`, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
      cell.numFmt = fmtFor(m);
    });
    const n0 = 7 + ms.length - 1;
    const r1 = mem.map((r) => r.returns["1Y"]).filter((x): x is number => typeof x === "number");
    sa.getCell(`${colL(n0)}${rr}`).value = f(`IFERROR(_xlfn.MAXIFS(${rng(colOf("ret_1Y"))},${SEC},A${rr}),"")`, r1.length ? Math.max(...r1) : null);
    sa.getCell(`${colL(n0 + 1)}${rr}`).value = f(`IFERROR(_xlfn.MINIFS(${rng(colOf("ret_1Y"))},${SEC},A${rr}),"")`, r1.length ? Math.min(...r1) : null);
    sa.getCell(`${colL(n0)}${rr}`).numFmt = NF.pct;
    sa.getCell(`${colL(n0 + 1)}${rr}`).numFmt = NF.pct;
  });
  sa.getColumn(1).width = 34;
  for (let i = 2; i <= heads.length; i++) sa.getColumn(i).width = 15;
  sa.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  sa.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + sectors.length, column: heads.length } };
  redGreen(sa, `E5:F${4 + sectors.length}`);
  masterSheet(wb, rows);
  await saveBook(wb, `NIFTY50_Sector_Report_${stamp()}.xlsx`);
}

// ------------------------------------------------------------------ KPI workbook (all KPIs, all FYs)
export async function kpiWorkbook() {
  const { ExcelJS, uni, meta, dict, metrics } = await base();
  const s = useSettings.getState();
  const rows = filterBySector(uni, s.sectors);
  const wb = newBook(ExcelJS, "NIFTY 50 — KPI calculations");
  readme(wb, "KPI calculations — NIFTY 50", meta, [
    ["Filters applied at export", [`Sectors :: ${s.sectors.length ? s.sectors.join(", ") : "All"}`, `Companies :: ${rows.length}`]],
    ["Sheet guide", [
      "KPI_Dictionary :: Formula, inputs, basis, unit and significance of every KPI.",
      "Financial_Ratios :: Latest-FY value of every KPI per company (wide), with summary and rank formulas.",
      "KPI_Long :: Every KPI × company × fiscal year (filterable long format, suited to pivot tables).",
      "Formula-level workings :: Each company's research report (Company page → Excel) rebuilds these KPIs as live formulas from the statements.",
    ]],
    ["Conventions", CONVENTIONS],
  ]);
  const kd = wb.addWorksheet("KPI_Dictionary");
  writeGrid(kd, 1, [{ header: "KPI", width: 32 }, { header: "Group", width: 14 }, { header: "Formula", width: 50 }, { header: "Inputs", width: 40 }, { header: "Basis", width: 46 },
    { header: "Unit", width: 8 }, { header: "Better", width: 8 }, { header: "Applies to lenders", width: 10 }, { header: "Significance", width: 80 }],
    dict.map((k) => [k.name, k.group, k.formula, k.inputs.join(", "), k.basis, k.unit, k.better ?? "—", k.financials ? "Yes" : "No", k.significance]));
  const kpiMetrics = dict.map((k) => metrics.find((m) => m.id === k.id)!).filter(Boolean);
  metricsSheet(wb, "Financial_Ratios", "Financial ratios (latest fiscal year per company)", rows, kpiMetrics, "latest");
  const kl = wb.addWorksheet("KPI_Long");
  const long: any[][] = [];
  rows.forEach((r) => dict.forEach((k) => Object.entries(r.kpi_hist?.[k.id] ?? {}).forEach(([fy, v]) =>
    long.push([r.symbol, r.sector, k.group, k.name, fy, ["operating_cf", "fcf"].includes(k.id) ? v / 1e7 : v, k.unit === "inr" ? "₹ Cr" : k.unit]))));
  writeGrid(kl, 1, [{ header: "Symbol", width: 12 }, { header: "Sector", width: 26 }, { header: "Group", width: 14 }, { header: "KPI", width: 32 }, { header: "Fiscal year", width: 11 },
    { header: "Value", width: 14, numFmt: "0.0000" }, { header: "Unit", width: 8 }], long);
  await saveBook(wb, `NIFTY50_KPI_Calculations_${stamp()}.xlsx`);
}

// ------------------------------------------------------------------ historical prices (multi-company)
export async function pricesWorkbook(symbols: string[], range: [string, string]) {
  const [ExcelJS, meta] = await Promise.all([loadExcel(), api.meta()]);
  const px = await Promise.all(symbols.map((s) => api.prices(s)));
  const wb = newBook(ExcelJS, "NIFTY 50 — historical prices");
  readme(wb, "Historical share prices", meta, [
    ["Selection", [`Symbols :: ${symbols.join(", ")}`, `Period :: ${range[0]} to ${range[1]}`]],
    ["Columns", [
      "Close :: Split-adjusted close (Yahoo 'Close').", "Adj Close :: Split- and dividend-adjusted (total-return basis).",
      "Daily return :: Formula on Adj Close; blank on each symbol's first row and where a price is missing.",
    ]],
    ["Conventions", CONVENTIONS],
  ]);
  const ws = wb.addWorksheet("Historical_Prices");
  const rows: any[][] = [];
  symbols.forEach((sym, k) => {
    const p = px[k];
    p.d.forEach((d, i) => { if (d >= range[0] && d <= range[1]) rows.push([sym, new Date(d + "T00:00:00Z"), p.o[i], p.h[i], p.l[i], p.c[i], p.a[i], p.v[i], null]); });
  });
  writeGrid(ws, 1, [{ header: "Symbol", width: 12 }, { header: "Date", width: 12, numFmt: NF.date }, { header: "Open", numFmt: NF.num2 }, { header: "High", numFmt: NF.num2 },
    { header: "Low", numFmt: NF.num2 }, { header: "Close", numFmt: NF.num2 }, { header: "Adj Close", numFmt: NF.num2 }, { header: "Volume", width: 14, numFmt: NF.int },
    { header: "Daily return", width: 13, numFmt: NF.pct2 }], rows, { freezeCols: 2 });
  for (let i = 1; i < rows.length; i++) {
    const rr = i + 2;
    const same = rows[i][0] === rows[i - 1][0];
    const a0 = rows[i - 1][6], a1 = rows[i][6];
    ws.getCell(`I${rr}`).value = f(`IF(AND(A${rr}=A${rr - 1},ISNUMBER(G${rr}),ISNUMBER(G${rr - 1})),G${rr}/G${rr - 1}-1,"")`, same && a0 && a1 ? a1 / a0 - 1 : null);
  }
  redGreen(ws, `I3:I${rows.length + 1}`);
  await saveBook(wb, `NIFTY50_Prices_${symbols.length > 3 ? symbols.length + "cos" : symbols.join("-")}_${range[0]}_${range[1]}.xlsx`);
}

// ------------------------------------------------------------------ dataset (current filters, no prices)
export async function universeDataset() {
  const { ExcelJS, uni, meta, metrics } = await base();
  const s = useSettings.getState();
  const rows = filterBySector(uni, s.sectors);
  const wb = newBook(ExcelJS, "NIFTY 50 — dataset");
  readme(wb, "NIFTY 50 dataset", meta, [
    ["Filters applied at export", [`Sectors :: ${s.sectors.length ? s.sectors.join(", ") : "All"}`, `Fiscal year :: ${s.fy === "latest" ? "Latest reported FY per company" : s.fy}`, `Companies :: ${rows.length}`]],
    ["Sheet guide", ["Company_Master, Raw_Market_Data (quotes, returns, risk), Financial_Ratios (all metrics), Fundamentals (by fiscal year)."]],
    ["Conventions", CONVENTIONS],
  ]);
  masterSheet(wb, rows);
  const mkt = metrics.filter((m) => ["Market Performance", "Risk", "Valuation (current)"].includes(m.group));
  metricsSheet(wb, "Raw_Market_Data", "Market data, returns and risk", rows, mkt, s.fy, { ranks: false });
  metricsSheet(wb, "Financial_Ratios", "Financial ratios", rows, metrics.filter((m) => !["Market Performance", "Risk", "Valuation (current)"].includes(m.group)), s.fy);
  const fs = wb.addWorksheet("Fundamentals");
  const long: any[][] = [];
  rows.forEach((r) => Object.entries(r.fund_hist ?? {}).forEach(([field, h]) => Object.entries(h).forEach(([fy, v]) => long.push([r.symbol, r.sector, field, fy, v / 1e7]))));
  writeGrid(fs, 1, [{ header: "Symbol", width: 12 }, { header: "Sector", width: 26 }, { header: "Field", width: 18 }, { header: "Fiscal year", width: 11 }, { header: "Value (₹ Cr)", width: 16, numFmt: NF.cr }], long);
  await saveBook(wb, `NIFTY50_Dataset_${rows.length}cos_${stamp()}.xlsx`);
}
