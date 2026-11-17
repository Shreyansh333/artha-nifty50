import type { Workbook, Worksheet, Cell as XCell } from "exceljs";
import { saveBlob } from "../lib/download";
import type { Meta } from "../lib/types";

export async function loadExcel() {
  const mod = await import("exceljs");
  return (mod as any).default ?? mod;
}

export const C = {
  ink: "FF15161A",
  accent: "FFB06C0C",
  head: "FF1F2128",
  headText: "FFFFFFFF",
  band: "FFF6F4EF",
  line: "FFE0DCD2",
  up: "FF007A54",
  down: "FFC73131",
  muted: "FF85837D",
  input: "FF1F4E9E", // blue = hard-coded inputs (financial-model convention)
};

export const NF = {
  cr: '#,##0;[Red]-#,##0;"0"',
  cr1: '#,##0.0;[Red]-#,##0.0',
  pct: '0.0%;[Red]-0.0%',
  pct2: '0.00%;[Red]-0.00%',
  x: '0.00"×";[Red]-0.00"×"',
  x1: '0.0"×";[Red]-0.0"×"',
  inr: '"₹"#,##0.00',
  int: '#,##0',
  days: '0" d"',
  date: "dd-mmm-yyyy",
  num2: "#,##0.00",
};

export function colL(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function newBook(ExcelJS: any, title: string): Workbook {
  const wb: Workbook = new ExcelJS.Workbook();
  wb.creator = "Artha — NIFTY 50 Intelligence Terminal";
  wb.title = title;
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true } as any; // Excel recalculates every formula on open
  return wb;
}

export function styleHeader(row: any) {
  row.eachCell((c: XCell) => {
    c.font = { bold: true, color: { argb: C.headText }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.head } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: C.accent } } };
  });
  row.height = 22;
}

export function sheetTitle(ws: Worksheet, title: string, subtitle?: string) {
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: C.ink } };
  if (subtitle) {
    ws.getCell("A2").value = subtitle;
    ws.getCell("A2").font = { italic: true, size: 9, color: { argb: C.muted } };
  }
}

export interface ColSpec {
  header: string;
  key?: string;
  width?: number;
  numFmt?: string;
}

/** Write a header row + data rows at `start` (1-based row), with autofilter and banding. */
export function writeGrid(ws: Worksheet, start: number, cols: ColSpec[], rows: any[][], opts: { filter?: boolean; freeze?: boolean; freezeCols?: number } = {}) {
  const hr = ws.getRow(start);
  cols.forEach((c, i) => (hr.getCell(i + 1).value = c.header));
  styleHeader(hr);
  rows.forEach((r, k) => {
    const row = ws.getRow(start + 1 + k);
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v === undefined ? null : v;
      if (cols[i]?.numFmt) cell.numFmt = cols[i].numFmt!;
      cell.font = { size: 10, color: { argb: C.ink } };
      if (k % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.band } };
    });
  });
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? Math.min(40, Math.max(10, c.header.length + 2))));
  if (opts.filter !== false && rows.length) ws.autoFilter = { from: { row: start, column: 1 }, to: { row: start + rows.length, column: cols.length } };
  if (opts.freeze !== false) ws.views = [{ state: "frozen", ySplit: start, xSplit: opts.freezeCols ?? 1 }];
  return { firstRow: start + 1, lastRow: start + rows.length };
}

export function redGreen(ws: Worksheet, ref: string) {
  ws.addConditionalFormatting({
    ref,
    rules: [
      { type: "cellIs", operator: "lessThan", formulae: ["0"], priority: 1, style: { font: { color: { argb: C.down } } } } as any,
      { type: "cellIs", operator: "greaterThan", formulae: ["0"], priority: 2, style: { font: { color: { argb: C.up } } } } as any,
    ],
  });
}

export function colorScale(ws: Worksheet, ref: string, reverse = false) {
  const lo = reverse ? "FF7FC7A7" : "FFF2A7A7", hi = reverse ? "FFF2A7A7" : "FF7FC7A7";
  ws.addConditionalFormatting({
    ref,
    rules: [{ type: "colorScale", priority: 3, cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }], color: [{ argb: lo }, { argb: "FFFFFFFF" }, { argb: hi }] } as any],
  });
}

export function dataBar(ws: Worksheet, ref: string) {
  ws.addConditionalFormatting({ ref, rules: [{ type: "dataBar", priority: 4, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FFE8A33D" } } as any] });
}

/** Formula cell with cached result so values show even before recalculation. */
export function f(formula: string, result: number | string | null | undefined) {
  return { formula, result: result === null || result === undefined || (typeof result === "number" && !Number.isFinite(result)) ? undefined : result };
}

export function readme(wb: Workbook, title: string, meta: Meta | undefined, sections: [string, string[]][]) {
  const ws = wb.addWorksheet("README", { properties: { tabColor: { argb: C.accent } } });
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 110;
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: C.ink } };
  ws.getCell("A2").value = "Artha — NIFTY 50 Intelligence Terminal";
  ws.getCell("A2").font = { italic: true, color: { argb: C.accent } };
  let r = 4;
  const kv = (k: string, v: string) => {
    ws.getCell(`A${r}`).value = k;
    ws.getCell(`A${r}`).font = { bold: true, size: 10 };
    ws.getCell(`B${r}`).value = v;
    ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`B${r}`).font = { size: 10 };
    r++;
  };
  kv("Generated (local time)", new Date().toLocaleString("en-IN"));
  if (meta) {
    kv("Dataset built (UTC)", meta.generated_at);
    kv("Prices as of", meta.price_as_of);
    kv("Source", meta.source);
    kv("Disclaimer", meta.disclaimer);
  }
  for (const [head, lines] of sections) {
    r++;
    ws.getCell(`A${r}`).value = head.toUpperCase();
    ws.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: C.accent } };
    r++;
    lines.forEach((l) => {
      const [k, ...rest] = l.split(" :: ");
      if (rest.length) kv(k, rest.join(" :: "));
      else {
        ws.getCell(`B${r}`).value = l;
        ws.getCell(`B${r}`).alignment = { wrapText: true };
        ws.getCell(`B${r}`).font = { size: 10 };
        r++;
      }
    });
  }
  return ws;
}

export const CONVENTIONS = [
  "Units :: Monetary values are in ₹ Crore (1 Cr = 10,000,000 INR) unless a column states otherwise. Per-share values in ₹.",
  "Missing data :: Blank cells mean the value is unavailable from the source. Blanks are never zero. Ratio formulas return blank when an input is missing or a denominator is ≤ 0.",
  "Formulas :: Calculated metrics are live Excel formulas referencing the statement sheets (cell comments explain any value the engine withholds). Workbook is set to recalculate on open.",
  "Colour convention :: Blue font = hard-coded inputs from the source; black = formulas.",
  "Fiscal year :: Indian fiscal year (April–March); FY2026 = year ended 31-Mar-2026. A non-March year end is labelled e.g. FY2022·Dec.",
  "Returns :: Total-return figures use Yahoo adjusted close (splits and dividends). The NIFTY 50 index series is a price index.",
  "Ratios basis :: Annual figures and period-end balances. Current multiples use TTM where four consecutive quarters exist, else the latest fiscal year (basis column provided).",
];

export async function saveBook(wb: Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export const cr = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : v / 1e7);
