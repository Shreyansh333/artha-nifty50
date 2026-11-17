import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Columns3, Download, FileSpreadsheet, Loader2, Plus, X } from "lucide-react";
import { useKpiDict, useUniverse } from "../lib/data";
import { DEFAULT_COLS, useScreener, useSettings, type Condition } from "../lib/store";
import { ErrorState, SectionTitle, Select, Skeleton, Sparkline, cx, useOutside } from "../components/ui";
import { byUnit, isNum, shortName, toneClass } from "../lib/format";
import { buildMetrics, metricOptions } from "../lib/metrics";
import { applyScreen } from "../lib/screen";
import { downloadCSV, stamp } from "../lib/download";

export default function Screener() {
  const uni = useUniverse();
  const { data: dict } = useKpiDict();
  const s = useSettings();
  const sc = useScreener();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const metrics = useMemo(() => (dict ? buildMetrics(dict) : []), [dict]);
  const M = (id: string) => metrics.find((m) => m.id === id);

  const rows = useMemo(() => (uni.data && metrics.length ? applyScreen(uni.data, { sectors: s.sectors, q: sc.q, conds: sc.conds, sort: sc.sort, dir: sc.dir, fy: s.fy }, metrics) : []),
    [uni.data, metrics, s.sectors, s.fy, sc.q, sc.conds, sc.sort, sc.dir]);
  useEffect(() => setPage(0), [s.sectors, s.fy, sc.q, sc.conds, sc.sort, sc.dir, sc.pageSize]);

  if (uni.error) return <ErrorState error={uni.error} />;
  if (!uni.data || !metrics.length) return <Skeleton className="h-[600px]" />;

  const cols = sc.cols.map(M).filter(Boolean) as NonNullable<ReturnType<typeof M>>[];
  const pages = Math.max(1, Math.ceil(rows.length / sc.pageSize));
  const view = rows.slice(page * sc.pageSize, (page + 1) * sc.pageSize);
  const sortBy = (id: string) => sc.set(sc.sort === id ? { dir: sc.dir === "asc" ? "desc" : "asc" } : { sort: id, dir: "desc" });

  const exportExcel = async () => {
    setBusy(true);
    try {
      const { filteredExport } = await import("../excel/datasetExports");
      await filteredExport();
    } finally { setBusy(false); }
  };
  const exportCsv = () => downloadCSV(`NIFTY50_screener_${stamp()}.csv`, ["Symbol", "Company", "Sector", ...cols.map((c) => c.label)],
    rows.map((r) => [r.symbol, r.name, r.sector, ...cols.map((c) => c.get(r, s.fy))]));

  return (
    <div className="space-y-4 animate-rise">
      <SectionTitle eyebrow="Interactive table" title="Screener"
        desc="Filter the NIFTY 50 by sector, text and metric conditions; choose columns; sort any column (unavailable values always sort last). Exports contain exactly the rows and columns shown, with the active filters documented in the workbook."
        right={<>
          <button className="btn" onClick={exportCsv}><Download size={12} />CSV</button>
          <button className="btn-primary" onClick={exportExcel} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}Export filtered view (Excel)</button>
        </>} />

      <section className="card space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-60" placeholder="Search symbol, name, industry…" value={sc.q} onChange={(e) => sc.set({ q: e.target.value })} />
          <ColumnPicker options={metricOptions(metrics)} value={sc.cols} onChange={(cols) => sc.set({ cols })} />
          <button className="btn" onClick={() => sc.set({ conds: [...sc.conds, { metric: "roe", op: ">", a: 15, b: null }] })}><Plus size={12} />Add condition</button>
          {(sc.conds.length > 0 || sc.q) && <button className="btn" onClick={() => sc.set({ conds: [], q: "" })}>Clear conditions</button>}
          <span className="ml-auto text-2xs text-ink3"><b className="text-ink">{rows.length}</b> of {uni.data.length} companies match{s.sectors.length ? " · sector filter on" : ""}</span>
        </div>
        {sc.conds.map((c, i) => (
          <CondRow key={i} c={c} options={metricOptions(metrics)} unit={M(c.metric)?.unit ?? "x"}
            onChange={(n) => sc.set({ conds: sc.conds.map((x, k) => (k === i ? n : x)) })} onRemove={() => sc.set({ conds: sc.conds.filter((_, k) => k !== i) })} />
        ))}
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th label="Company" active={sc.sort === "symbol"} dir={sc.dir} onClick={() => sortBy("symbol")} left />
                <th className="table-head px-3 py-2">1Y trend</th>
                {cols.map((c) => <Th key={c.id} label={c.short ?? c.label} title={`${c.label} — ${c.basis}`} active={sc.sort === c.id} dir={sc.dir} onClick={() => sortBy(c.id)} />)}
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.symbol} className="border-t border-line/50 hover:bg-raised/40">
                  <td className="px-3 py-2">
                    <Link to={`/company/${r.symbol}`} className="group block">
                      <span className="font-mono font-semibold group-hover:text-accent">{r.symbol}</span>
                      <span className="block max-w-[220px] truncate text-2xs text-ink3">{shortName(r.name)} · {r.sector}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-1"><Sparkline values={Object.keys(r.calendar).sort().slice(-6).map((y) => r.calendar[y])} width={70} /></td>
                  {cols.map((c) => {
                    const v = c.get(r, s.fy);
                    return (
                      <td key={c.id} className={cx("num px-3 py-2 text-right", c.unit === "pct" && c.id.startsWith("ret_") ? toneClass(v) : "")}>
                        {isNum(v) ? byUnit(v, c.unit, s.unit) : <span className="text-ink3" title={r.is_financial && c.fyDependent ? "Not applicable to lenders/insurers or unavailable" : "Unavailable from source"}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {view.length === 0 && <tr><td colSpan={cols.length + 2} className="p-8 text-center text-ink3">No companies match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-3 text-2xs text-ink3">
          <span>Rows per page</span>
          <Select label="Rows per page" value={String(sc.pageSize)} onChange={(v) => sc.set({ pageSize: Number(v) })} options={["10", "25", "50"].map((v) => ({ value: v, label: v }))} />
          <span className="ml-auto">Page {page + 1} of {pages}</span>
          <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button className="btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </section>
    </div>
  );
}

function Th({ label, title, active, dir, onClick, left }: { label: string; title?: string; active: boolean; dir: string; onClick: () => void; left?: boolean }) {
  return (
    <th className={cx("table-head cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:text-ink", left ? "text-left" : "text-right", active && "!text-accent")} title={title} onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <span className="inline-flex items-center gap-1">{label}{active && (dir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</span>
    </th>
  );
}

function CondRow({ c, options, unit, onChange, onRemove }: { c: Condition; options: { value: string; label: string; group: string }[]; unit: string; onChange: (c: Condition) => void; onRemove: () => void }) {
  const u = unit === "pct" ? "%" : unit === "inr" ? "₹ Cr" : unit === "x" ? "×" : unit === "days" ? "days" : "";
  const num = (v: string) => (v === "" || isNaN(Number(v)) ? null : Number(v));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line/70 bg-raised/30 p-2">
      <Select label="Metric" value={c.metric} onChange={(m) => onChange({ ...c, metric: m })} options={options} />
      <Select label="Operator" value={c.op} onChange={(op) => onChange({ ...c, op })} options={[{ value: ">", label: "greater than" }, { value: "<", label: "less than" }, { value: "between", label: "between" }]} />
      <input className="input w-24" type="number" value={c.a ?? ""} onChange={(e) => onChange({ ...c, a: num(e.target.value) })} />
      {c.op === "between" && <><span className="text-2xs text-ink3">and</span><input className="input w-24" type="number" value={c.b ?? ""} onChange={(e) => onChange({ ...c, b: num(e.target.value) })} /></>}
      <span className="text-2xs text-ink3">{u}</span>
      <span className="text-2xs text-ink3">· companies where the metric is unavailable are excluded</span>
      <button className="btn ml-auto !p-1" onClick={onRemove} aria-label="Remove condition"><X size={12} /></button>
    </div>
  );
}

function ColumnPicker({ options, value, onChange }: { options: { value: string; label: string; group: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutside<HTMLDivElement>(open, close);
  const groups = Array.from(new Set(options.map((o) => o.group)));
  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)}><Columns3 size={12} />Columns ({value.length})</button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 max-h-[60vh] w-[560px] max-w-[90vw] overflow-auto rounded-xl border border-line bg-surface p-3 shadow-pop animate-fade">
          <div className="mb-2 flex items-center justify-between"><span className="eyebrow">Choose columns</span>
            <button className="text-2xs text-accent hover:underline" onClick={() => onChange(DEFAULT_COLS)}>Reset to default</button></div>
          <div className="grid grid-cols-2 gap-x-4">
            {groups.map((g) => (
              <div key={g} className="mb-2">
                <div className="mb-1 text-2xs font-semibold text-ink3">{g}</div>
                {options.filter((o) => o.group === g).map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink2 hover:bg-raised">
                    <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={value.includes(o.value)}
                      onChange={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])} />{o.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
