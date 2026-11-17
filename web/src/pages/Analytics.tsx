import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { useKpiDict, useSectors, useUniverse } from "../lib/data";
import { useSettings } from "../lib/store";
import { ChartCard } from "../charts/ChartCard";
import { base, categoryAxis, cellLabel, clampScore, divergingColor, heatVisual, textOn, tokens, valueAxis, MONO } from "../charts/theme";
import { ErrorState, SectionTitle, Select, Skeleton, cx } from "../components/ui";
import { byUnit, isNum, moneyRaw, UNITS } from "../lib/format";
import { buildMetrics, filterBySector, median, metricOptions, percentileRank, type Metric } from "../lib/metrics";
import type { UniverseRow } from "../lib/types";

const PRESETS: { label: string; x: string; y: string; log?: boolean }[] = [
  { label: "Revenue vs profit growth", x: "revenue_growth", y: "net_income_growth" },
  { label: "ROE vs P/B", x: "roe", y: "pb_now" },
  { label: "Risk vs return (3Y)", x: "vol_3Y", y: "cagr_3Y" },
  { label: "Leverage vs ROE", x: "debt_to_equity", y: "roe" },
  { label: "P/E vs EPS growth", x: "eps_growth", y: "pe_now" },
  { label: "Margin vs valuation", x: "net_margin", y: "pe_now" },
];

const HEAT_KPIS = ["revenue_growth", "net_margin", "roe", "roa", "roce", "current_ratio", "debt_to_equity", "interest_coverage", "asset_turnover", "cash_conversion", "fcf_margin", "pe", "pb", "dividend_yield"];

export default function Analytics() {
  const uni = useUniverse();
  const { data: dict } = useKpiDict();
  const { data: sectors } = useSectors();
  const s = useSettings();
  const nav = useNavigate();
  const t = tokens();
  const [x, setX] = useState("revenue_growth");
  const [y, setY] = useState("net_income_growth");
  const [logY, setLogY] = useState(false);
  const [focus, setFocus] = useState(true);
  const [hl, setHl] = useState("none");
  const [rankM, setRankM] = useState("roe");
  const [secM, setSecM] = useState("all");

  const metrics = useMemo(() => (dict ? buildMetrics(dict) : []), [dict]);
  const M = (id: string) => metrics.find((m) => m.id === id)!;
  const rows = useMemo(() => filterBySector(uni.data ?? [], s.sectors), [uni.data, s.sectors]);

  if (uni.error) return <ErrorState error={uni.error} />;
  if (!uni.data || !dict || !metrics.length) return <Skeleton className="h-[600px]" />;

  const fyLabel = s.fy === "latest" ? "latest FY" : s.fy;
  const sectorNames = Array.from(new Set(uni.data.map((r) => r.sector))).sort();

  // ---------------- scatter
  const mx = M(x), my = M(y);
  const pts = rows.map((r) => ({ r, xv: mx.get(r, s.fy), yv: my.get(r, s.fy), cap: r.valuation.market_cap ?? 0 })).filter((p) => isNum(p.xv) && isNum(p.yv) && (!logY || p.yv! > 0));
  const excluded = rows.length - pts.length;
  const q = (arr: number[], p: number) => { const a = [...arr].sort((u, v) => u - v); return a.length ? a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))] : 0; };
  const xs = pts.map((p) => p.xv!), ys = pts.map((p) => p.yv!);
  const pad = (lo: number, hi: number) => { const d = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1; return [lo - d, hi + d]; };
  const [fx0, fx1] = pad(q(xs, 0.05), q(xs, 0.95));
  const [fy0, fy1] = pad(q(ys, 0.05), q(ys, 0.95));
  const useFocus = focus && pts.length >= 10 && !logY;
  const hidden = useFocus ? pts.filter((p) => p.xv! < fx0 || p.xv! > fx1 || p.yv! < fy0 || p.yv! > fy1).length : 0;
  const maxCap = Math.max(...pts.map((p) => p.cap), 1);
  const scaleVal = (m: Metric, v: number) => (m.unit === "inr" ? moneyRaw(v, s.unit)! : v);
  const highlighted = (r: UniverseRow) => hl === "none" || (hl === "fin" ? r.is_financial : r.sector === hl);
  const fmtAxis = (m: Metric) => (v: number) => (m.unit === "pct" ? `${(v * 100).toFixed(0)}%` : m.unit === "x" ? `${v.toFixed(1)}×` : v.toLocaleString("en-IN"));
  const scatter: EChartsOption = {
    ...base(t),
    grid: { left: 12, right: 40, top: 40, bottom: 30, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), formatter: (p: any) => {
      const r: UniverseRow = p.data.r;
      return `<b>${r.symbol}</b> · ${r.sector}<br/>${mx.label}: <b>${byUnit(p.data.xv, mx.unit, s.unit)}</b><br/>${my.label}: <b>${byUnit(p.data.yv, my.unit, s.unit)}</b>`;
    } },
    xAxis: valueAxis(t, { name: `${mx.label}${mx.fyDependent ? ` (${fyLabel})` : ""}`, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: t.ink2, fontSize: 11 }, scale: true,
      ...(useFocus ? { min: scaleVal(mx, fx0), max: scaleVal(mx, fx1) } : {}),
      axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: fmtAxis(mx) } }),
    yAxis: valueAxis(t, { type: logY ? "log" : "value", name: `${my.label}${my.fyDependent ? ` (${fyLabel})` : ""}`, nameGap: 14, nameTextStyle: { color: t.ink2, fontSize: 11, align: "left", padding: [0, 0, 0, -30] }, scale: true,
      ...(useFocus ? { min: scaleVal(my, fy0), max: scaleVal(my, fy1) } : {}),
      axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: fmtAxis(my) } }),
    dataZoom: [{ type: "inside", xAxisIndex: 0 }, { type: "inside", yAxisIndex: 0 }],
    series: [{
      type: "scatter",
      data: pts.map((p) => ({
        value: [scaleVal(mx, p.xv!), scaleVal(my, p.yv!)], r: p.r, xv: p.xv, yv: p.yv,
        symbolSize: 8 + 30 * Math.sqrt(p.cap / maxCap),
        itemStyle: { color: highlighted(p.r) ? t.series[0] : t.ink3, opacity: highlighted(p.r) ? 0.85 : 0.35, borderColor: t.surface, borderWidth: 1.5 },
        label: { show: true, formatter: p.r.symbol, position: "right", color: highlighted(p.r) ? t.ink2 : t.ink3, fontSize: 9 },
      })),
      labelLayout: { hideOverlap: true },
      markLine: {
        silent: true, symbol: "none", lineStyle: { color: t.ink3, type: "dashed", width: 1 },
        label: { color: t.ink3, fontSize: 9, formatter: "median" },
        data: [{ xAxis: median(pts.map((p) => scaleVal(mx, p.xv!))) ?? 0 }, { yAxis: median(pts.map((p) => scaleVal(my, p.yv!))) ?? 0 }],
      },
    }],
  };
  const scatterData = { headers: ["Symbol", "Sector", `${mx.label}`, `${my.label}`, "Market cap (INR)"], rows: pts.map((p) => [p.r.symbol, p.r.sector, p.xv, p.yv, p.cap]) };

  // ---------------- ranking
  const mr = M(rankM);
  const ranked = rows.map((r) => ({ r, v: mr.get(r, s.fy) })).filter((p) => isNum(p.v)).sort((a, b) => (mr.better === "lower" ? a.v! - b.v! : b.v! - a.v!));
  const rankMed = median(ranked.map((p) => p.v));
  const rankOpt: EChartsOption = {
    ...base(t),
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: any) => { const p = ranked[ps[0].dataIndex]; return `<b>${p.r.symbol}</b> · ${p.r.sector}<br/>${mr.label}: <b>${byUnit(p.v, mr.unit, s.unit)}</b>`; } },
    xAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: fmtAxis(mr) } }),
    yAxis: categoryAxis(t, ranked.map((p) => p.r.symbol), { inverse: true, axisLabel: { color: t.ink2, fontFamily: MONO, fontSize: 10 } }),
    series: [{
      type: "bar", barWidth: 10,
      data: ranked.map((p) => ({ value: scaleVal(mr, p.v!), itemStyle: { color: highlighted(p.r) ? (p.v! < 0 ? t.down : t.series[0]) : t.ink3, borderRadius: p.v! >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })),
      label: { show: true, position: "right", color: t.ink3, fontFamily: MONO, fontSize: 9, formatter: (p: any) => byUnit(ranked[p.dataIndex].v, mr.unit, s.unit) },
      markLine: isNum(rankMed) ? { silent: true, symbol: "none", lineStyle: { color: t.accent, type: "dashed" }, label: { formatter: "median", color: t.accent, fontSize: 9 }, data: [{ xAxis: scaleVal(mr, rankMed) }] } : undefined,
    }],
  };

  // ---------------- sector medians heatmap (column-normalised)
  const secCols = HEAT_KPIS.map((id) => M(id)).filter(Boolean);
  const secRows = (sectors ?? []).filter((x) => !s.sectors.length || s.sectors.includes(x.sector));
  const secCells: any[] = [];
  secCols.forEach((m, ci) => {
    const vals = secRows.map((sr) => median(rows.filter((r) => r.sector === sr.sector).map((r) => m.get(r, s.fy))));
    vals.forEach((v, ri) => {
      const pr = percentileRank(vals, v);
      const score = isNum(pr) ? (m.better === "lower" ? 1 - pr : m.better === "higher" ? pr : 0.5) : null;
      const col = isNum(score) && m.better ? divergingColor(t, (score - 0.5) * 2, 1) : t.raised;
      secCells.push({ value: [ci, ri, v, clampScore(isNum(score) && m.better ? (score - 0.5) * 2 : null)], label: { color: m.better ? textOn(col) : t.ink2 } });
    });
  });
  const secOpt: EChartsOption = {
    ...base(t),
    grid: { left: 8, right: 8, top: 60, bottom: 4, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), formatter: (p: any) => `${secRows[p.value[1]].sector}<br/>${secCols[p.value[0]].label}: <b>${byUnit(p.value[2], secCols[p.value[0]].unit, s.unit)}</b><br/><span style="opacity:.7">median of ${secRows[p.value[1]].count} constituents</span>` },
    xAxis: categoryAxis(t, secCols.map((m) => m.short ?? m.label), { position: "top", axisLabel: { color: t.ink2, fontSize: 10, rotate: 30, interval: 0 } }),
    yAxis: categoryAxis(t, secRows.map((x) => `${x.sector} (${x.count})`), { inverse: true, axisLabel: { color: t.ink2, fontSize: 10, width: 170, overflow: "truncate" } }),
    visualMap: heatVisual(t) as any,
    series: [{ type: "heatmap", data: secCells, label: { show: true, fontSize: 9, fontFamily: MONO, formatter: (p: any) => cellLabel(p.value[2], secCols[p.value[0]].unit) },
      itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 } }],
  };

  // ---------------- company x KPI percentile heatmap
  const heatRows = rows.filter((r) => secM === "all" || r.sector === secM);
  const heatCells: any[] = [];
  secCols.forEach((m, ci) => {
    const all = rows.map((r) => m.get(r, s.fy));
    heatRows.forEach((r, ri) => {
      const v = m.get(r, s.fy);
      const pr = percentileRank(all, v);
      const score = isNum(pr) ? (m.better === "lower" ? 1 - pr : m.better === "higher" ? pr : null) : null;
      const col = isNum(score) ? divergingColor(t, (score - 0.5) * 2, 1) : t.raised;
      heatCells.push({ value: [ci, ri, v, clampScore(isNum(score) ? (score - 0.5) * 2 : null)], pr, label: { color: isNum(score) ? textOn(col) : t.ink3 } });
    });
  });
  const heatOpt: EChartsOption = {
    ...base(t),
    grid: { left: 8, right: 8, top: 60, bottom: 4, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), formatter: (p: any) => `<b>${heatRows[p.value[1]].symbol}</b> · ${secCols[p.value[0]].label}<br/>${isNum(p.value[2]) ? byUnit(p.value[2], secCols[p.value[0]].unit, s.unit) : "unavailable / not applicable"}${isNum(p.data.pr) ? `<br/>percentile ${(p.data.pr * 100).toFixed(0)} within selection` : ""}` },
    xAxis: categoryAxis(t, secCols.map((m) => m.short ?? m.label), { position: "top", axisLabel: { color: t.ink2, fontSize: 10, rotate: 30, interval: 0 } }),
    yAxis: categoryAxis(t, heatRows.map((r) => r.symbol), { inverse: true, axisLabel: { color: t.ink2, fontFamily: MONO, fontSize: 10 } }),
    visualMap: heatVisual(t) as any,
    series: [{ type: "heatmap", data: heatCells, label: { show: true, fontSize: 8.5, fontFamily: MONO, formatter: (p: any) => cellLabel(p.value[2], secCols[p.value[0]].unit) },
      itemStyle: { borderColor: t.surface, borderWidth: 1.5, borderRadius: 2 } }],
  };

  // ---------------- calendar-year rankings
  const years = Array.from(new Set(rows.flatMap((r) => Object.keys(r.calendar)))).sort().slice(-8);
  const calRows = [...rows].sort((a, b) => (b.calendar[years[years.length - 1]] ?? -9) - (a.calendar[years[years.length - 1]] ?? -9));
  const calCells: any[] = [];
  years.forEach((yy, ci) => {
    const vals = rows.map((r) => r.calendar[yy] ?? null).filter(isNum).sort((a, b) => b - a);
    calRows.forEach((r, ri) => {
      const v = r.calendar[yy];
      const rank = isNum(v) ? vals.indexOf(v) + 1 : null;
      const col = divergingColor(t, v ?? null, 0.5);
      calCells.push({ value: [ci, ri, v ?? null, clampScore(isNum(v) ? v / 0.5 : null)], rank, n: vals.length, label: { color: isNum(v) ? textOn(col) : t.ink3 } });
    });
  });
  const calOpt: EChartsOption = {
    ...base(t),
    grid: { left: 8, right: 8, top: 24, bottom: 4, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), formatter: (p: any) => `<b>${calRows[p.value[1]].symbol}</b> · ${years[p.value[0]]}<br/>${isNum(p.value[2]) ? `${byUnit(p.value[2], "pct")} · rank ${p.data.rank}/${p.data.n}` : "not listed / no data"}` },
    xAxis: categoryAxis(t, years, { position: "top" }),
    yAxis: categoryAxis(t, calRows.map((r) => r.symbol), { inverse: true, axisLabel: { color: t.ink2, fontFamily: MONO, fontSize: 10 } }),
    visualMap: heatVisual(t) as any,
    series: [{ type: "heatmap", data: calCells, label: { show: true, fontSize: 9, fontFamily: MONO, formatter: (p: any) => (isNum(p.value[2]) ? `${(p.value[2] * 100).toFixed(0)}` : "—") },
      itemStyle: { borderColor: t.surface, borderWidth: 1.5, borderRadius: 2 } }],
  };

  const opts = metricOptions(metrics);
  return (
    <div className="space-y-5 animate-rise">
      <SectionTitle eyebrow="Module D" title="Advanced analytics"
        desc={`Cross-sectional analysis of ${rows.length} constituents${s.sectors.length ? " (sector filter active)" : ""}. Fiscal-year metrics use ${fyLabel}; current valuation and market metrics use the latest data. Companies with unavailable or not-applicable inputs are excluded from each chart and counted below it.`} />

      <ChartCard title={`${mx.label} vs ${my.label}`} subtitle="Bubble area ∝ market cap · dashed lines = medians of plotted companies · scroll to zoom · click a bubble to open the company"
        option={scatter} data={scatterData} height={480} filename={`scatter_${x}_vs_${y}`}
        onEvents={{ click: (p: any) => p.data?.r && nav(`/company/${p.data.r.symbol}`) }}
        footnote={`${pts.length - hidden} plotted · ${excluded} excluded (metric unavailable, not applicable${logY ? ", or non-positive on log scale" : ""})${hidden ? ` · ${hidden} outlier(s) beyond the 5th–95th percentile window hidden — untick “Focus” to show all` : ""}.`}
        controls={<>
          <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => (
            <button key={p.label} className={cx("chip", x === p.x && y === p.y && "!border-accent/60 !text-ink")} onClick={() => { setX(p.x); setY(p.y); }}>{p.label}</button>
          ))}</div>
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="text-2xs text-ink3">X</span><Select label="X metric" value={x} onChange={setX} options={opts} />
            <span className="text-2xs text-ink3">Y</span><Select label="Y metric" value={y} onChange={setY} options={opts} />
            <label className="chip cursor-pointer"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={focus} onChange={() => setFocus((v) => !v)} />Focus (5th–95th pctl)</label>
            <label className="chip cursor-pointer"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={logY} onChange={() => setLogY((v) => !v)} />Log Y</label>
            <span className="ml-auto text-2xs text-ink3">Highlight</span>
            <Select label="Highlight" value={hl} onChange={setHl} options={[{ value: "none", label: "All equally" }, { value: "fin", label: "Lenders / insurers" }, ...sectorNames.map((n) => ({ value: n, label: n }))]} />
          </div>
        </>} />

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={`Ranking · ${mr.label}`} subtitle={`${mr.fyDependent ? fyLabel + " · " : ""}${mr.basis} · dashed = median`}
          option={rankOpt} height={Math.max(320, ranked.length * 17 + 30)} filename={`ranking_${rankM}`}
          data={{ headers: ["Rank", "Symbol", "Sector", mr.label], rows: ranked.map((p, i) => [i + 1, p.r.symbol, p.r.sector, p.v]) }}
          onEvents={{ click: (p: any) => nav(`/company/${ranked[p.dataIndex].r.symbol}`) }}
          footnote={`${rows.length - ranked.length} excluded (unavailable / not applicable).${mr.unit === "inr" ? ` Values in ${UNITS[s.unit].short}.` : ""}`}
          controls={<Select label="Ranking metric" value={rankM} onChange={setRankM} options={opts} />} />
        <div className="space-y-4">
          <ChartCard title="Sector medians" subtitle={`Median of constituents per sector · ${fyLabel} · colour = relative standing across sectors (green = better), uncoloured where direction is ambiguous`}
            option={secOpt} height={Math.max(320, secRows.length * 26 + 70)} filename="sector_medians"
            data={{ headers: ["Sector", ...secCols.map((m) => m.label)], rows: secRows.map((sr) => [sr.sector, ...secCols.map((m) => median(rows.filter((r) => r.sector === sr.sector).map((r) => m.get(r, s.fy))))]) }}
            footnote="Sectors with 1–2 constituents are shown but are not robust benchmarks." />
        </div>
      </section>

      <ChartCard title="KPI percentile map" subtitle={`Each cell coloured by the company's percentile within the current selection (direction-adjusted: green = better) · ${fyLabel} · “—” = unavailable or not applicable`}
        option={heatOpt} height={Math.max(300, heatRows.length * 20 + 70)} filename="kpi_percentile_map"
        data={{ headers: ["Symbol", ...secCols.map((m) => m.label)], rows: heatRows.map((r) => [r.symbol, ...secCols.map((m) => m.get(r, s.fy))]) }}
        onEvents={{ click: (p: any) => nav(`/company/${heatRows[p.value[1]].symbol}/ratios`) }}
        controls={<Select label="Sector" value={secM} onChange={setSecM} options={[{ value: "all", label: "All companies in selection" }, ...Array.from(new Set(rows.map((r) => r.sector))).sort().map((n) => ({ value: n, label: n }))]} />} />

      <ChartCard title="Historical performance rankings" subtitle="Calendar-year total return (%) · rows sorted by the latest year · hover for rank · YTD for the current year"
        option={calOpt} height={Math.max(320, calRows.length * 18 + 40)} filename="calendar_rankings"
        data={{ headers: ["Symbol", ...years], rows: calRows.map((r) => [r.symbol, ...years.map((yy) => r.calendar[yy] ?? null)]) }} />
    </div>
  );
}
