import { api } from "../lib/data";
import { reason } from "../lib/format";
import type { KpiDef, Statement } from "../lib/types";
import { C, CONVENTIONS, NF, colL, cr, f, loadExcel, newBook, readme, redGreen, saveBook, sheetTitle, styleHeader, writeGrid } from "./common";
import { stamp } from "../lib/download";

type RefFn = (field: string, offset?: number) => string | null;

/** Excel formula templates mirroring the Python KPI engine (pipeline/n50/kpis.py). */
const div = (a: string, b: string) => `IF(AND(ISNUMBER(${a}),ISNUMBER(${b}),${b}>0),${a}/${b},"")`;
const TEMPLATES: Record<string, (r: RefFn) => string | null | false> = {
  revenue_growth: (r) => g(r, "revenue"),
  ebitda_growth: (r) => g(r, "ebitda"),
  net_income_growth: (r) => g(r, "net_income"),
  eps_growth: (r) => g(r, "eps_diluted"),
  gross_margin: (r) => d2(r, "gross_profit", "revenue"),
  ebitda_margin: (r) => d2(r, "ebitda", "revenue"),
  ebit_margin: (r) => d2(r, "ebit", "revenue"),
  net_margin: (r) => d2(r, "net_income", "revenue"),
  roe: (r) => d2(r, "net_income", "equity"),
  roa: (r) => d2(r, "net_income", "total_assets"),
  roce: (r) => all(r, ["ebit", "total_assets", "current_liabilities"]) && `IF((${r("total_assets")}-${r("current_liabilities")})>0,${r("ebit")}/(${r("total_assets")}-${r("current_liabilities")}),"")`,
  current_ratio: (r) => d2(r, "current_assets", "current_liabilities"),
  quick_ratio: (r) => all(r, ["current_assets", "inventory", "current_liabilities"]) && `IF(${r("current_liabilities")}>0,(${r("current_assets")}-${r("inventory")})/${r("current_liabilities")},"")`,
  cash_ratio: (r) => d2(r, "cash_and_sti", "current_liabilities"),
  debt_to_equity: (r) => d2(r, "total_debt", "equity"),
  debt_to_assets: (r) => d2(r, "total_debt", "total_assets"),
  interest_coverage: (r) => d2(r, "ebit", "interest_expense"),
  net_debt_ebitda: (r) => all(r, ["total_debt", "cash_and_sti", "ebitda"]) && `IF(${r("ebitda")}>0,(${r("total_debt")}-${r("cash_and_sti")})/${r("ebitda")},"")`,
  asset_turnover: (r) => d2(r, "revenue", "total_assets"),
  inventory_turnover: (r) => d2(r, "cost_of_revenue", "inventory"),
  receivables_turnover: (r) => d2(r, "revenue", "receivables"),
  debtor_days: (r) => all(r, ["receivables", "revenue"]) && `IF(${r("revenue")}>0,${r("receivables")}/${r("revenue")}*365,"")`,
  operating_cf: (r) => r("operating_cf") && `${r("operating_cf")}`,
  fcf: (r) => all(r, ["operating_cf", "capex"]) && `${r("operating_cf")}-ABS(${r("capex")})`,
  cash_conversion: (r) => d2(r, "operating_cf", "net_income"),
  fcf_margin: (r) => all(r, ["operating_cf", "capex", "revenue"]) && `IF(${r("revenue")}>0,(${r("operating_cf")}-ABS(${r("capex")}))/${r("revenue")},"")`,
  capex_intensity: (r) => all(r, ["capex", "revenue"]) && `IF(${r("revenue")}>0,ABS(${r("capex")})/${r("revenue")},"")`,
  dividend_payout: (r) => all(r, ["dividends_paid", "net_income"]) && `IF(${r("net_income")}>0,ABS(${r("dividends_paid")})/${r("net_income")},"")`,
  eps: (r) => r("eps_diluted") && `${r("eps_diluted")}`,
  bvps: (r) => all(r, ["equity", "shares_outstanding"]) && `IF(${r("shares_outstanding")}>0,${r("equity")}*10000000/${r("shares_outstanding")},"")`,
  pe: (r) => d2(r, "market_cap_fy", "net_income"),
  pb: (r) => d2(r, "market_cap_fy", "equity"),
  ps: (r) => d2(r, "market_cap_fy", "revenue"),
  ev_ebitda: (r) => all(r, ["market_cap_fy", "total_debt", "cash_and_sti", "ebitda"]) && `IF(${r("ebitda")}>0,(${r("market_cap_fy")}+${r("total_debt")}-${r("cash_and_sti")})/${r("ebitda")},"")`,
  dividend_yield: (r) => all(r, ["dividends_paid", "market_cap_fy"]) && `IF(${r("market_cap_fy")}>0,ABS(${r("dividends_paid")})/${r("market_cap_fy")},"")`,
};
function all(r: RefFn, fs: string[]) { return fs.every((x) => r(x) !== null); }
function d2(r: RefFn, a: string, b: string) { const x = r(a), y = r(b); return x && y ? div(x, y) : null; }
function g(r: RefFn, k: string) {
  const c = r(k), p = r(k, -1);
  return c && p ? `IF(AND(ISNUMBER(${p}),${p}>0,ISNUMBER(${c})),${c}/${p}-1,"")` : null;
}

const MONEY_KPI = new Set(["operating_cf", "fcf"]);
const kpiFmt = (k: KpiDef) => (MONEY_KPI.has(k.id) ? NF.cr : k.unit === "pct" ? NF.pct : k.unit === "days" ? NF.days : k.unit === "inr_ps" ? NF.inr : NF.x);

export async function companyReport(symbol: string) {
  const [ExcelJS, c, dict, meta, px] = await Promise.all([loadExcel(), api.company(symbol), api.kpiDictionary(), api.meta(), api.prices(symbol)]);
  const wb = newBook(ExcelJS, `${c.name} — Financial Research Report`);
  const fys = c.annual.map((p) => p.label);
  const nF = fys.length;
  const firstCol = 3; // A label, B source, C.. periods

  readme(wb, `${c.name} (${c.symbol}) — Financial Research Report`, meta, [
    ["Company", [
      `Symbol :: ${c.symbol} (NSE) · Yahoo ${c.yahoo}`, `Sector / industry :: ${c.sector} / ${c.industry ?? "—"}`,
      `Analytical framework :: ${c.is_financial ? "Lender / insurer — working-capital, EBITDA and ROCE ratios are not applicable" : "Operating company"}`,
      `Statement currency :: INR${c.financial_currency !== "INR" ? ` (translated from ${c.financial_currency}; see data notes)` : ""}`,
      `Fiscal years covered :: ${fys.join(", ") || "none"}`,
    ]],
    ["Sheet guide", [
      "Company_Profile :: Identity, current quote and valuation snapshot (with basis).",
      "Income_Statement / Balance_Sheet / Cash_Flow :: Canonical annual statements in ₹ Cr, with the Yahoo source row for each line.",
      "KPI_Calculations :: Every KPI as a live Excel formula referencing the statement sheets (same methodology as the web app's KPI engine).",
      "Quarterly :: Canonical quarterly income statement and margins.",
      "Historical_Prices :: Full daily OHLCV history with daily-return and 50-day moving-average formulas.",
      "Market_Performance :: Returns, CAGR, risk metrics and calendar-year returns.",
      "Insights :: Rule-based observations with evidence and thresholds.",
      "Data_Coverage :: Field-by-field availability and retrieval timestamps.",
    ]],
    ["Conventions", CONVENTIONS],
    ["Data notes", c.data_notes.length ? c.data_notes : ["No company-specific data issues were detected."]],
  ]);

  // ---------------- profile
  const prof = wb.addWorksheet("Company_Profile");
  sheetTitle(prof, `${c.name}`, "Snapshot as of the dataset build");
  const v = c.valuation;
  const items: [string, any, string?, string?][] = [
    ["Symbol", c.symbol], ["ISIN", c.isin], ["Sector (NSE)", c.sector], ["Industry (Yahoo)", c.industry ?? ""],
    ["Last close (₹)", c.snapshot.price, NF.inr, c.snapshot.last_date], ["52-week high (₹)", c.snapshot.high_52w, NF.inr], ["52-week low (₹)", c.snapshot.low_52w, NF.inr],
    ["Market cap (₹ Cr)", cr(v.market_cap), NF.cr, v.market_cap_source], ["Enterprise value (₹ Cr)", cr(v.enterprise_value), NF.cr],
    ["P/E", v.pe, NF.x1, v.pe_basis ?? v.pe_note ?? ""], ["P/B", v.pb, NF.x1, v.pb_basis ?? ""], ["P/S", v.ps, NF.x, v.ps_basis ?? ""],
    ["EV/EBITDA", v.ev_ebitda, NF.x1, v.ev_ebitda_basis ?? ""], ["Dividend yield", v.dividend_yield, NF.pct2, v.dividend_yield_basis],
    ["Yahoo trailing P/E (cross-check)", v.yahoo_trailing_pe, NF.x1], ["Beta 3Y (computed)", c.market.risk?.beta_3Y, NF.num2], ["Beta (Yahoo)", v.beta_yahoo, NF.num2],
  ];
  writeGrid(prof, 4, [{ header: "Item", width: 32 }, { header: "Value", width: 20 }, { header: "Basis / note", width: 60 }],
    items.map(([k, val, , note]) => [k, val ?? null, note ?? ""]), { filter: false });
  items.forEach(([, , fmt], i) => fmt && (prof.getCell(`B${5 + i}`).numFmt = fmt));

  // ---------------- statements (wide, same FY columns on every sheet)
  const rowOf: Record<string, { sheet: string; row: number }> = {};
  const stmtSheet = (name: string, st: Statement) => {
    const ws = wb.addWorksheet(name);
    sheetTitle(ws, `${name.replace("_", " ")} — ${c.symbol}`, "₹ Crore unless stated · annual · blank = unavailable from source (never zero) · blue = source input");
    const head = ["Line item", "Yahoo source row", ...st.periods];
    const hr = ws.getRow(4);
    head.forEach((h, i) => (hr.getCell(i + 1).value = h));
    styleHeader(hr);
    st.rows.forEach((r, k) => {
      const row = ws.getRow(5 + k);
      row.getCell(1).value = r.label;
      row.getCell(2).value = r.source ?? "";
      row.getCell(2).font = { size: 9, color: { argb: C.muted } };
      r.values.forEach((val, j) => {
        const cell = row.getCell(firstCol + j);
        const out = val === null ? null : r.monetary ? val / 1e7 : val;
        cell.value = out;
        cell.numFmt = r.monetary ? NF.cr : r.key.startsWith("eps") ? NF.inr : NF.int;
        cell.font = { size: 10, color: { argb: C.input } };
      });
      rowOf[r.key] = { sheet: name, row: 5 + k };
    });
    ws.getColumn(1).width = 34;
    ws.getColumn(2).width = 30;
    st.periods.forEach((_, j) => (ws.getColumn(firstCol + j).width = 14));
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
    return ws;
  };
  const A = c.statements.annual;
  stmtSheet("Income_Statement", A.income);
  stmtSheet("Balance_Sheet", A.balance);
  stmtSheet("Cash_Flow", A.cashflow);

  // ---------------- KPI calculations
  const ks = wb.addWorksheet("KPI_Calculations", { properties: { tabColor: { argb: "FF2A78D6" } } });
  sheetTitle(ks, `KPI calculations — ${c.symbol}`, "Live formulas referencing the statement sheets · blank = not computable (see cell note) · ratios unitless, money in ₹ Cr");
  // market inputs block
  const hdr = ["KPI / input", "Formula (definition)", ...fys];
  const hr = ks.getRow(4);
  hdr.forEach((h, i) => (hr.getCell(i + 1).value = h));
  styleHeader(hr);
  let r = 5;
  const section = (title: string) => {
    const cell = ks.getCell(`A${r}`);
    cell.value = title.toUpperCase();
    cell.font = { bold: true, size: 9, color: { argb: C.accent } };
    r++;
  };
  section("Market inputs at fiscal-year end");
  const priceRow = r, sharesRow = r + 1, mcapRow = r + 2;
  ks.getCell(`A${priceRow}`).value = "Share price at FY end (₹, un-split-adjusted)";
  ks.getCell(`B${priceRow}`).value = "Last close on/before period end × later split factors";
  ks.getCell(`A${sharesRow}`).value = "Shares outstanding (balance sheet)";
  ks.getCell(`B${sharesRow}`).value = "Ordinary shares number";
  ks.getCell(`A${mcapRow}`).value = "Market cap at FY end (₹ Cr)";
  ks.getCell(`B${mcapRow}`).value = "Price × Shares ÷ 10^7";
  c.annual.forEach((p, j) => {
    const col = colL(firstCol + j);
    const pc = ks.getCell(`${col}${priceRow}`);
    pc.value = p.values.price_fy ?? null; pc.numFmt = NF.inr; pc.font = { color: { argb: C.input }, size: 10 };
    const sc = ks.getCell(`${col}${sharesRow}`);
    const shRef = rowOf.shares_outstanding ? `Balance_Sheet!${col}${rowOf.shares_outstanding.row}` : null;
    if (shRef && p.values.shares_outstanding) sc.value = f(shRef, p.values.shares_outstanding); else sc.value = p.values.shares_outstanding ?? null;
    sc.numFmt = NF.int;
    const mc = ks.getCell(`${col}${mcapRow}`);
    mc.value = p.values.market_cap_fy ? f(`IF(AND(ISNUMBER(${col}${priceRow}),ISNUMBER(${col}${sharesRow})),${col}${priceRow}*${col}${sharesRow}/10000000,"")`, p.values.market_cap_fy / 1e7) : null;
    mc.numFmt = NF.cr;
  });
  r = mcapRow + 2;

  const ref = (j: number): RefFn => (field, offset = 0) => {
    const jj = j + offset;
    if (jj < 0) return null;
    const col = colL(firstCol + jj);
    if (field === "market_cap_fy") return `${col}${mcapRow}`;
    const loc = rowOf[field];
    return loc ? `${loc.sheet}!${col}${loc.row}` : null;
  };
  const groups = Array.from(new Set(dict.map((k) => k.group)));
  for (const gname of groups) {
    section(gname);
    for (const k of dict.filter((x) => x.group === gname)) {
      ks.getCell(`A${r}`).value = k.name;
      ks.getCell(`B${r}`).value = k.formula;
      ks.getCell(`B${r}`).font = { size: 9, color: { argb: C.muted } };
      const ser = c.kpis[k.id];
      fys.forEach((fy, j) => {
        const cell = ks.getCell(`${colL(firstCol + j)}${r}`);
        const val = ser?.values[fy];
        const tpl = TEMPLATES[k.id]?.(ref(j));
        if (val !== undefined && tpl) {
          cell.value = f(tpl, MONEY_KPI.has(k.id) ? val / 1e7 : val);
        } else if (val !== undefined) {
          cell.value = MONEY_KPI.has(k.id) ? val / 1e7 : val;
          cell.font = { color: { argb: C.input }, size: 10 };
        } else {
          cell.value = null;
          cell.note = reason(ser?.na[fy]);
        }
        cell.numFmt = kpiFmt(k);
      });
      r++;
    }
  }
  ks.getColumn(1).width = 38;
  ks.getColumn(2).width = 46;
  fys.forEach((_, j) => (ks.getColumn(firstCol + j).width = 13));
  ks.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
  if (nF) redGreen(ks, `${colL(firstCol)}${mcapRow + 2}:${colL(firstCol + nF - 1)}${r}`);

  // ---------------- quarterly
  const q = wb.addWorksheet("Quarterly");
  sheetTitle(q, `Quarterly income statement — ${c.symbol}`, "₹ Crore · quarters as returned by Yahoo (gaps are source gaps)");
  const Q = c.statements.quarterly.income;
  writeGrid(q, 4, [{ header: "Line item", width: 32 }, ...Q.periods.map((p) => ({ header: p, width: 13, numFmt: NF.cr }))],
    Q.rows.map((row) => [row.label, ...row.values.map((x) => (x === null ? null : row.monetary ? x / 1e7 : x))]), { filter: false });
  const qm0 = 6 + Q.rows.length;
  writeGrid(q, qm0, [{ header: "Quarter", width: 32 }, { header: "Net margin", numFmt: NF.pct }, { header: "EBITDA margin", numFmt: NF.pct }, { header: "Revenue YoY", numFmt: NF.pct }],
    c.quarterly_metrics.map((m) => [m.label, m.net_margin, m.ebitda_margin, m.revenue_yoy]), { filter: false, freeze: false });

  // ---------------- historical prices with formulas
  const hp = wb.addWorksheet("Historical_Prices");
  const rows = px.d.map((d, i) => [new Date(d + "T00:00:00Z"), px.o[i], px.h[i], px.l[i], px.c[i], px.a[i], px.v[i], null, null]);
  writeGrid(hp, 1, [
    { header: "Date", width: 12, numFmt: NF.date }, { header: "Open", numFmt: NF.num2 }, { header: "High", numFmt: NF.num2 }, { header: "Low", numFmt: NF.num2 },
    { header: "Close", numFmt: NF.num2 }, { header: "Adj Close", numFmt: NF.num2 }, { header: "Volume", width: 14, numFmt: NF.int },
    { header: "Daily return (adj.)", width: 16, numFmt: NF.pct2 }, { header: "50-day MA (close)", width: 16, numFmt: NF.num2 },
  ], rows);
  for (let i = 1; i < px.d.length; i++) {
    const rr = i + 2;
    const a0 = px.a[i - 1], a1 = px.a[i];
    hp.getCell(`H${rr}`).value = f(`IF(AND(ISNUMBER(F${rr - 1}),ISNUMBER(F${rr})),F${rr}/F${rr - 1}-1,"")`, a0 && a1 ? a1 / a0 - 1 : null);
    if (i >= 49) {
      let s = 0, n = 0;
      for (let k = i - 49; k <= i; k++) if (px.c[k] !== null) { s += px.c[k]!; n++; }
      hp.getCell(`I${rr}`).value = f(`AVERAGE(E${rr - 49}:E${rr})`, n ? s / n : null);
    }
  }
  redGreen(hp, `H3:H${px.d.length + 1}`);

  // ---------------- market performance
  const mp = wb.addWorksheet("Market_Performance");
  sheetTitle(mp, `Market performance — ${c.symbol}`, "Total return basis (adjusted close) · risk-free assumption for Sharpe/Sortino: " + (meta.risk_free_rate * 100).toFixed(1) + "%");
  const ret = c.market.returns ?? {}, rk = c.market.risk;
  const perf: [string, any, string][] = [
    ...Object.entries(ret).map(([k, x]) => [`Return ${k}`, x, NF.pct] as [string, any, string]),
    ...Object.entries(c.market.cagr ?? {}).map(([k, x]) => [`CAGR ${k}`, x, NF.pct] as [string, any, string]),
    ["Volatility 1Y (ann.)", rk?.vol_1Y, NF.pct], ["Volatility 3Y (ann.)", rk?.vol_3Y, NF.pct], ["Sharpe 3Y", rk?.sharpe_3Y, NF.num2],
    ["Sortino 3Y", rk?.sortino_3Y, NF.num2], ["Beta vs NIFTY 50 (3Y)", rk?.beta_3Y, NF.num2], ["Max drawdown", rk?.max_drawdown, NF.pct],
    ["Max drawdown 5Y", rk?.max_drawdown_5Y, NF.pct], ["Drawdown from ATH", rk?.current_drawdown, NF.pct],
  ];
  writeGrid(mp, 4, [{ header: "Metric", width: 28 }, { header: "Value", width: 14 }], perf.map(([k, x]) => [k, x ?? null]), { filter: false });
  perf.forEach(([, , fm], i) => (mp.getCell(`B${5 + i}`).numFmt = fm));
  const cal = Object.entries(c.market.calendar ?? {});
  writeGrid(mp, 6 + perf.length, [{ header: "Calendar year", width: 28 }, { header: "Total return", numFmt: NF.pct }], cal.map(([y, x]) => [y, x]), { filter: false, freeze: false });
  redGreen(mp, `B5:B${5 + perf.length + cal.length + 2}`);

  // ---------------- insights
  const ins = wb.addWorksheet("Insights");
  writeGrid(ins, 1, [{ header: "Rule", width: 20 }, { header: "Category", width: 14 }, { header: "Tone", width: 10 }, { header: "Period", width: 12 },
    { header: "Title", width: 40 }, { header: "Fact (verifiable)", width: 80 }, { header: "Interpretation (not advice)", width: 60 }, { header: "Evidence", width: 60 }, { header: "Threshold", width: 30 }],
    c.insights.map((o) => [o.rule, o.category, o.tone, o.period, o.title, o.fact, o.interpretation ?? "", o.evidence.map((e) => `${e.label}: ${e.value ?? "n/a"}`).join(" | "), o.threshold ?? ""]));
  ins.getColumn(6).alignment = { wrapText: true, vertical: "top" };

  // ---------------- coverage
  const cv = wb.addWorksheet("Data_Coverage");
  sheetTitle(cv, `Data coverage audit — ${c.symbol}`, `${fys.length} annual and ${c.coverage.quarterly_periods.length} quarterly periods · KPI completeness ${((c.coverage.kpi_completeness ?? 0) * 100).toFixed(0)}%`);
  writeGrid(cv, 4, [{ header: "Canonical field", width: 28 }, { header: "Annual periods with data", width: 22 }, { header: `of ${fys.length}`, width: 10 }],
    Object.entries(c.coverage.fields).map(([k, n]) => [k, n, fys.length]), { filter: true });
  const base = 6 + Object.keys(c.coverage.fields).length;
  writeGrid(cv, base, [{ header: "Dataset", width: 28 }, { header: "Retrieved (UTC)", width: 30 }], Object.entries(c.coverage.retrieved).map(([k, x]) => [k, x]), { filter: false, freeze: false });

  await saveBook(wb, `${c.symbol}_Research_Report_${stamp()}.xlsx`);
}

