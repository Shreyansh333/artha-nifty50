import { useMemo, useRef, useState, type ReactNode } from "react";
import type { EChartsOption } from "echarts";
import { Download, Expand, Image as ImageIcon, Table2 } from "lucide-react";
import { EChart, type EChartHandle } from "./EChart";
import { Modal, cx, InfoTip } from "../components/ui";
import { downloadCSV, downloadDataURL, slug, stamp, type Cell } from "../lib/download";

export interface ChartData {
  headers: string[];
  rows: Cell[][];
}

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  info?: ReactNode;
  option: EChartsOption;
  data?: ChartData;
  height?: number;
  controls?: ReactNode;
  footnote?: ReactNode;
  filename?: string;
  onEvents?: Record<string, (p: any) => void>;
  className?: string;
  empty?: ReactNode;
}

/**
 * Standard chart frame: title, inline controls, expand-to-fullscreen, data-table view,
 * CSV export of exactly the plotted data, and PNG export.
 */
export function ChartCard({ title, subtitle, info, option, data, height = 300, controls, footnote, filename, onEvents, className, empty }: Props) {
  const ref = useRef<EChartHandle>(null);
  const bigRef = useRef<EChartHandle>(null);
  const [expanded, setExpanded] = useState(false);
  const [table, setTable] = useState(false);
  const name = slug(filename ?? (typeof title === "string" ? title : "chart"));

  const png = (h: EChartHandle | null) => {
    const inst = h?.instance();
    if (!inst) return;
    const bg = getComputedStyle(document.body).backgroundColor;
    downloadDataURL(inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg }), `${name}_${stamp()}.png`);
  };
  const csv = () => data && downloadCSV(`${name}_${stamp()}.csv`, data.headers, data.rows);

  const actions = (h: () => EChartHandle | null) => (
    <div className="flex items-center gap-1">
      {data && (
        <button className={cx("btn !p-1.5", table && "!text-accent !border-accent/50")} onClick={() => setTable((t) => !t)}
          title={table ? "Show chart" : "Show data table"} aria-pressed={table}>
          <Table2 size={13} />
        </button>
      )}
      {data && <button className="btn !p-1.5" onClick={csv} title="Download chart data (CSV)"><Download size={13} /></button>}
      <button className="btn !p-1.5" onClick={() => png(h())} title="Download image (PNG)"><ImageIcon size={13} /></button>
      {!expanded && <button className="btn !p-1.5" onClick={() => setExpanded(true)} title="Expand"><Expand size={13} /></button>}
    </div>
  );

  const tableView = useMemo(() => data && <DataTable data={data} maxHeight={height} />, [data, height]);

  return (
    <section className={cx("card flex min-w-0 flex-col p-4", className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">{title}{info && <InfoTip text={info} />}</h3>
          {subtitle && <p className="mt-0.5 text-2xs text-ink3">{subtitle}</p>}
        </div>
        {actions(() => ref.current)}
      </header>
      {controls && <div className="mb-3 flex flex-wrap items-center gap-2">{controls}</div>}
      {empty ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-xs text-ink3" style={{ height }}>{empty}</div>
      ) : table && tableView ? (
        tableView
      ) : (
        <EChart ref={ref} option={option} height={height} onEvents={onEvents} />
      )}
      {footnote && <p className="mt-2 text-2xs leading-relaxed text-ink3">{footnote}</p>}
      <Modal open={expanded} onClose={() => setExpanded(false)} title={<span className="flex items-center gap-3">{title}{actions(() => bigRef.current)}</span>}>
        {controls && <div className="mb-3 flex flex-wrap items-center gap-2">{controls}</div>}
        {table && tableView ? <DataTable data={data!} maxHeight={600} /> : <EChart ref={bigRef} option={option} height="68vh" onEvents={onEvents} />}
        {footnote && <p className="mt-3 text-2xs text-ink3">{footnote}</p>}
      </Modal>
    </section>
  );
}

function DataTable({ data, maxHeight }: { data: ChartData; maxHeight: number | string }) {
  return (
    <div className="overflow-auto rounded-xl border border-line" style={{ maxHeight }}>
      <table className="w-full text-xs">
        <thead>
          <tr>{data.headers.map((h) => <th key={h} className="table-head px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-t border-line/60">
              {r.map((c, j) => (
                <td key={j} className={cx("px-3 py-1.5", typeof c === "number" ? "num text-right" : "text-ink2")}>
                  {c === null || c === undefined ? "—" : typeof c === "number" ? Number(c.toFixed(4)).toLocaleString("en-IN") : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
