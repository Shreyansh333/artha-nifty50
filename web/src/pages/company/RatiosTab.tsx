import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useKpiDict, useSectors } from "../../lib/data";
import { useSettings } from "../../lib/store";
import { ChartCard } from "../../charts/ChartCard";
import { base, categoryAxis, legend, tokens, valueAxis, MONO } from "../../charts/theme";
import { InfoTip, NA, Segmented, Skeleton, Sparkline, cx } from "../../components/ui";
import { byUnit, isNum, pct } from "../../lib/format";
import type { Company, KpiDef } from "../../lib/types";

const GROUPS = ["Growth", "Profitability", "Liquidity", "Solvency", "Efficiency", "Cash Flow", "Valuation"];

export default function RatiosTab({ c }: { c: Company }) {
  const { data: dict } = useKpiDict();
  const { data: sectors } = useSectors();
  const s = useSettings();
  const [group, setGroup] = useState("all");
  const t = tokens();
  const fys = c.annual.map((p) => p.label);
  const med = sectors?.find((x) => x.sector === c.sector)?.medians;

  const lineChart = (ids: string[], names: string[]) => {
    const option: EChartsOption = {
      ...base(t), legend: legend(t),
      grid: { left: 8, right: 16, top: 32, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", valueFormatter: (v: any) => (isNum(v) ? pct(v) : "n/a") },
      xAxis: categoryAxis(t, fys, { boundaryGap: false }),
      yAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => pct(v, 0) } }),
      series: ids.map((id, k) => ({
        type: "line", name: names[k], data: fys.map((f) => c.kpis[id]?.values[f] ?? null), connectNulls: false,
        symbol: "circle", symbolSize: 8, lineStyle: { width: 2 }, itemStyle: { borderColor: t.surface, borderWidth: 2 },
        endLabel: { show: true, formatter: names[k], color: t.ink2, fontSize: 10 },
      })),
    };
    return { option, data: { headers: ["Fiscal year", ...names], rows: fys.map((f) => [f, ...ids.map((id) => c.kpis[id]?.values[f] ?? null)]) } };
  };

  const margins = useMemo(() => c.is_financial
    ? lineChart(["net_margin"], ["Net margin"])
    : lineChart(["gross_margin", "ebitda_margin", "ebit_margin", "net_margin"], ["Gross", "EBITDA", "EBIT", "Net"]), [c, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps
  const returns = useMemo(() => lineChart(c.is_financial ? ["roe", "roa"] : ["roe", "roa", "roce"], c.is_financial ? ["ROE", "ROA"] : ["ROE", "ROA", "ROCE"]), [c, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const quarterly = useMemo(() => {
    const q = c.quarterly_metrics;
    const series = [
      { name: "Net margin", data: q.map((x) => x.net_margin) },
      ...(c.is_financial ? [] : [{ name: "EBITDA margin", data: q.map((x) => x.ebitda_margin) }]),
      { name: "Revenue YoY", data: q.map((x) => x.revenue_yoy) },
    ];
    const option: EChartsOption = {
      ...base(t), legend: legend(t),
      grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => (isNum(v) ? pct(v) : "n/a") },
      xAxis: categoryAxis(t, q.map((x) => x.label)),
      yAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => pct(v, 0) } }),
      series: series.map((x) => ({ type: "bar", name: x.name, data: x.data, barMaxWidth: 16, itemStyle: { borderRadius: 3 } })),
    };
    return { option, data: { headers: ["Quarter", ...series.map((x) => x.name)], rows: q.map((x, k) => [x.label, ...series.map((y) => y.data[k])]) } };
  }, [c, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dict) return <Skeleton className="h-96" />;
  const shown = dict.filter((k) => (group === "all" || k.group === group) && (k.financials || !c.is_financial));
  const hidden = dict.filter((k) => !k.financials && c.is_financial);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Margin trend" subtitle="Annual · % of revenue" option={margins.option} data={margins.data} height={250} filename={`${c.symbol}_margins`}
          footnote={!c.is_financial && !Object.keys(c.kpis.gross_margin?.values ?? {}).length ? "Gross margin withheld: Yahoo does not report cost of revenue separately for this company." : undefined} />
        <ChartCard title="Return metrics" subtitle="ROE · ROA · ROCE on period-end balances" option={returns.option} data={returns.data} height={250} filename={`${c.symbol}_returns`} />
        <ChartCard title="Quarterly margins & growth" subtitle="Quarterly · YoY only where the same quarter a year earlier exists" option={quarterly.option} data={quarterly.data} height={250}
          filename={`${c.symbol}_quarterly`} empty={c.quarterly_metrics.length === 0 ? "No quarterly data" : undefined} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <div>
            <div className="text-sm font-medium">KPI engine output · annual</div>
            <div className="text-2xs text-ink3">Hover a KPI name for its formula, inputs and significance · hover “—” for the reason a value is unavailable</div>
          </div>
          <Segmented value={group} onChange={setGroup} options={[{ value: "all", label: "All" }, ...GROUPS.map((g) => ({ value: g, label: g }))]} />
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr>
              <th className="table-head px-4 py-2">KPI</th>
              {fys.map((f) => <th key={f} className="table-head px-3 py-2 text-right">{f}</th>)}
              <th className="table-head px-3 py-2 text-center">Trend</th>
              <th className="table-head px-3 py-2 text-right">Sector median<InfoTip className="ml-1 align-middle" text={`Median of the latest fiscal-year value across ${med?.n ?? "?"} ${c.sector} constituents.`} /></th>
            </tr></thead>
            <tbody>
              {GROUPS.filter((g) => group === "all" || g === group).map((g) => {
                const ks = shown.filter((k) => k.group === g);
                if (!ks.length) return null;
                return [
                  <tr key={g}><td colSpan={fys.length + 3} className="bg-raised/50 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-ink3">{g}</td></tr>,
                  ...ks.map((k) => <KpiRow key={k.id} k={k} c={c} fys={fys} median={med?.[k.id] ?? null} unit={s.unit} />),
                ];
              })}
            </tbody>
          </table>
        </div>
        {hidden.length > 0 && (
          <p className="border-t border-line p-4 text-2xs text-ink3">
            Not shown for lenders/insurers (not meaningful under a banking balance sheet): {hidden.map((k) => k.name).join(", ")}.
          </p>
        )}
      </section>
    </div>
  );
}

function KpiRow({ k, c, fys, median, unit }: { k: KpiDef; c: Company; fys: string[]; median: number | null; unit: any }) {
  const ser = c.kpis[k.id];
  const vals = fys.map((f) => ser?.values[f] ?? null);
  const latest = [...vals].reverse().find(isNum);
  const vsMed = isNum(latest) && isNum(median) && k.better ? (k.better === "higher" ? latest > median : latest < median) : null;
  return (
    <tr className="border-t border-line/50 hover:bg-raised/40">
      <td className="px-4 py-1.5">
        <span className="group relative cursor-help text-ink">
          {k.name}
          <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-80 rounded-xl border border-line bg-surface p-3 text-2xs leading-relaxed text-ink2 shadow-pop group-hover:block">
            <span className="block font-mono text-ink">{k.formula}</span>
            <span className="mt-1 block">{k.significance}</span>
            <span className="mt-1 block text-ink3">Basis: {k.basis}. Inputs: {k.inputs.join(", ")}.</span>
          </span>
        </span>
      </td>
      {fys.map((f, i) => (
        <td key={f} className={cx("num px-3 py-1.5 text-right", isNum(vals[i]) && vals[i]! < 0 && k.unit !== "inr" ? "text-down" : "")}>
          {isNum(vals[i]) ? byUnit(vals[i], k.unit, unit) : <NA code={ser?.na[f]} short />}
        </td>
      ))}
      <td className="px-3 py-1 text-center"><Sparkline values={vals} /></td>
      <td className={cx("num px-3 py-1.5 text-right", vsMed === true ? "text-up" : vsMed === false ? "text-down" : "text-ink2")}>{byUnit(median, k.unit, unit)}</td>
    </tr>
  );
}
