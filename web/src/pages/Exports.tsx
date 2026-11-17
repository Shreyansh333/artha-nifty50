import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, Database, FileSpreadsheet, GitCompare, Layers, LineChart, Loader2, SlidersHorizontal, Sigma, Table, TriangleAlert } from "lucide-react";
import { useAsync, useKpiDict, useMeta, useUniverse } from "../lib/data";
import { resolveRange, useScreener, useSettings } from "../lib/store";
import { Badge, SectionTitle, Select, cx } from "../components/ui";
import { fmtDate, fmtDateTime, shortName } from "../lib/format";
import { buildMetrics, filterBySector } from "../lib/metrics";
import { applyScreen, describeScreen } from "../lib/screen";

type Status = { state: "idle" | "busy" | "done" | "error"; msg?: string };

function useRunner() {
  const [st, set] = useState<Record<string, Status>>({});
  const run = async (id: string, fn: () => Promise<unknown>) => {
    set((s) => ({ ...s, [id]: { state: "busy" } }));
    try {
      await fn();
      set((s) => ({ ...s, [id]: { state: "done", msg: `Generated ${new Date().toLocaleTimeString("en-IN")}` } }));
    } catch (e: any) {
      console.error(e);
      set((s) => ({ ...s, [id]: { state: "error", msg: e?.message ?? "Export failed" } }));
    }
  };
  return { st, run };
}

export default function Exports() {
  const { data: uni } = useUniverse();
  const { data: meta } = useMeta();
  const { data: dict } = useKpiDict();
  const manifest = useAsync(() => fetch("/downloads/manifest.json").then((r) => (r.ok ? r.json() : null)).catch(() => null), []);
  const s = useSettings();
  const sc = useScreener();
  const { st, run } = useRunner();
  const [company, setCompany] = useState(s.recent[0] ?? "RELIANCE");
  const [priceSel, setPriceSel] = useState<"compare" | "filter" | "company">("compare");

  const metrics = useMemo(() => (dict ? buildMetrics(dict) : []), [dict]);
  const filtered = useMemo(() => filterBySector(uni ?? [], s.sectors), [uni, s.sectors]);
  const screenOpts = { sectors: s.sectors, q: sc.q, conds: sc.conds, sort: sc.sort, dir: sc.dir, fy: s.fy };
  const screenRows = uni && metrics.length ? applyScreen(uni, screenOpts, metrics).length : 0;
  const range = meta ? resolveRange(s.range, meta.price_as_of, "1990-01-01", s.from, s.to) : null;
  const priceSymbols = priceSel === "compare" ? s.compare : priceSel === "company" ? [company] : filtered.map((r) => r.symbol);

  const card = (id: string, icon: ReactNode, title: string, desc: string, sheets: string, action: () => Promise<unknown>, extra?: ReactNode, disabled?: string) => {
    const status = st[id] ?? { state: "idle" };
    return (
      <div className="card flex flex-col p-5">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</span>
          <div className="text-sm font-medium">{title}</div>
        </div>
        <p className="text-xs leading-relaxed text-ink2">{desc}</p>
        <p className="mt-2 text-2xs text-ink3">Sheets: {sheets}</p>
        {extra && <div className="mt-3">{extra}</div>}
        <div className="mt-auto flex items-center gap-3 pt-4">
          <button className="btn-primary" disabled={status.state === "busy" || !!disabled} onClick={() => run(id, action)} title={disabled}>
            {status.state === "busy" ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} {status.state === "busy" ? "Building…" : "Download .xlsx"}
          </button>
          {status.state === "done" && <span className="flex items-center gap-1 text-2xs text-up"><CheckCircle2 size={12} />{status.msg}</span>}
          {status.state === "error" && <span className="flex items-center gap-1 text-2xs text-down"><TriangleAlert size={12} />{status.msg}</span>}
          {disabled && <span className="text-2xs text-ink3">{disabled}</span>}
        </div>
      </div>
    );
  };

  const ex = () => import("../excel/datasetExports");
  const mf = manifest.data as null | { file: string; bytes: number; built_at: string; sheets: string[]; companies: number; price_years: number };

  return (
    <div className="space-y-5 animate-rise">
      <SectionTitle eyebrow="Excel integration" title="Export centre"
        desc="Professionally formatted Excel workbooks: README with methodology and the exact filters used, frozen headers, filters, number formats, conditional formatting, and live formulas wherever a metric can be expressed in Excel. Workbooks are generated in your browser from the same data the dashboard shows." />

      <section className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-xs">
        <span className="eyebrow">Active filters applied to exports</span>
        <span>Sectors: <b>{s.sectors.length ? s.sectors.join(", ") : "All"}</b> ({filtered.length} cos)</span>
        <span>Fiscal year: <b>{s.fy === "latest" ? "Latest" : s.fy}</b></span>
        <span>Price period: <b>{range ? `${fmtDate(range[0])} → ${fmtDate(range[1])}` : "—"}</b></span>
        <span>Comparison set: <b>{s.compare.join(", ") || "empty"}</b></span>
        <span className="text-ink3">Change these in the toolbar above; every export re-reads them at download time.</span>
      </section>

      <section className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2"><Database size={16} className="text-accent" /><span className="text-base font-medium">Complete NIFTY 50 research workbook</span><Badge tone="accent">Pre-built by the Python pipeline</Badge></div>
            <p className="mt-2 text-xs leading-relaxed text-ink2">
              The full dataset for all constituents in one workbook, generated server-side with XlsxWriter on every data refresh:
              statements for every company, a KPI sheet built entirely from Excel formulas referencing those statements, financial ratios, comparison ranks,
              formula-driven sector analysis, {mf?.price_years ?? 5} years of daily prices with return formulas, dashboard data and the coverage audit.
            </p>
            {mf && <p className="mt-2 text-2xs text-ink3">{mf.sheets.join(" · ")}</p>}
          </div>
          <div className="text-right">
            {mf ? (
              <>
                <a className="btn-primary !px-4 !py-2 !text-sm" href={`/downloads/${mf.file}`} download><FileSpreadsheet size={15} />Download ({(mf.bytes / 1e6).toFixed(1)} MB)</a>
                <div className="mt-2 text-2xs text-ink3">Built {fmtDateTime(mf.built_at)} · {mf.companies} companies</div>
              </>
            ) : <span className="text-xs text-ink3">{manifest.loading ? "Checking…" : "Not available in this build."}</span>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {card("company", <Building2 size={15} />, "Company research report", "One company's financial statements, a formula-driven KPI sheet (mirroring the reference workbook's structure), quarterly data, full price history with formulas, market performance, insights and coverage.",
          "README, Company_Profile, Income_Statement, Balance_Sheet, Cash_Flow, KPI_Calculations, Quarterly, Historical_Prices, Market_Performance, Insights, Data_Coverage",
          () => import("../excel/companyReport").then((m) => m.companyReport(company)),
          <Select label="Company" value={company} onChange={setCompany} className="w-full" options={(uni ?? []).map((r) => ({ value: r.symbol, label: `${r.symbol} — ${shortName(r.name)}` }))} />)}

        {card("dataset", <Table size={15} />, "NIFTY 50 dataset (filtered)", `All metrics for the ${filtered.length} companies in the current sector filter — market data, returns, risk, ratios and fundamentals by fiscal year.`,
          "README, Company_Master, Raw_Market_Data, Financial_Ratios, Fundamentals", () => ex().then((m) => m.universeDataset()))}

        {card("kpi", <Sigma size={15} />, "KPI calculations", "The KPI dictionary (formula, inputs, basis, significance), every KPI per company for the latest fiscal year with summary/rank formulas, and a long table of all KPIs × fiscal years.",
          "README, KPI_Dictionary, Financial_Ratios, KPI_Long", () => ex().then((m) => m.kpiWorkbook()))}

        {card("prices", <LineChart size={15} />, "Historical share prices", `Daily OHLC, adjusted close and volume for the selected period with daily-return formulas. ${priceSymbols.length} symbol(s) selected.`,
          "README, Historical_Prices",
          () => ex().then((m) => m.pricesWorkbook(priceSymbols, range!)),
          <Select label="Symbols" value={priceSel} onChange={setPriceSel} className="w-full" options={[
            { value: "compare", label: `Comparison set (${s.compare.length})` }, { value: "company", label: `Selected company (${company})` }, { value: "filter", label: `All in sector filter (${filtered.length})` },
          ]} />, !priceSymbols.length ? "No symbols selected" : !range ? "Loading…" : undefined)}

        {card("compare", <GitCompare size={15} />, "Company comparison report", `Side-by-side metrics with summary and RANK formulas, rebased price series as formulas, period statistics, fundamentals with growth formulas, KPI history. Set: ${s.compare.join(", ") || "—"}.`,
          "README, Company_Comparison, Normalized_Prices, Period_Statistics, Fundamentals, KPI_History",
          () => import("../excel/comparisonReport").then((m) => m.comparisonReport(s.compare, s.fy, range, "total")),
          <Link to="/compare" className="text-2xs text-accent hover:underline">Edit the comparison set →</Link>, !s.compare.length ? "Comparison set is empty" : undefined)}

        {card("sector", <Layers size={15} />, "Sector comparison report", "Company data plus a Sector_Analysis sheet where every figure is a live formula: counts, total and share of market cap, cap-weighted returns, averages, best/worst performers.",
          "README, Company_Data, Sector_Analysis, Company_Master", () => ex().then((m) => m.sectorReport()))}

        {card("filtered", <SlidersHorizontal size={15} />, "Filtered dashboard data", `Exactly the Screener view — ${screenRows} rows after sector, search and metric conditions, with the chosen columns and sort order. Filters are recorded in the README.`,
          "README, Dashboard_Data, Company_Master", () => ex().then((m) => m.filteredExport()),
          <div className="space-y-0.5 text-2xs text-ink3">{describeScreen(screenOpts, metrics).map((l) => <div key={l}>{l.replace(" :: ", ": ")}</div>)}<Link to="/screener" className="text-accent hover:underline">Adjust in Screener →</Link></div>)}
      </section>

      <p className={cx("text-2xs leading-relaxed text-ink3")}>
        Formula workbooks are flagged to recalculate when opened, and every formula cell also stores its computed value so figures display correctly in viewers that do not recalculate (e.g. previews).
        MAXIFS/MINIFS in the sector report require Excel 2019 / Microsoft 365. CSV exports of any individual chart are available from the download icon on each chart.
      </p>
    </div>
  );
}

