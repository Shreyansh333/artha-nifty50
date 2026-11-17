import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { FileSpreadsheet, Loader2, Plus, X } from "lucide-react";
import { api, useKpiDict, useMany, useUniverse } from "../lib/data";
import { MAX_COMPARE, useSettings } from "../lib/store";
import { ChartCard } from "../charts/ChartCard";
import { base, categoryAxis, legend, timeAxis, tokens, valueAxis, MONO } from "../charts/theme";
import { Badge, ErrorState, InfoTip, SectionTitle, Segmented, Select, Skeleton, cx, useOutside } from "../components/ui";
import { byUnit, fmtDate, isNum, pct, reason, shortName } from "../lib/format";
import { buildMetrics, kpiAt, percentileRank, type Metric } from "../lib/metrics";
import { annualisedVol, maxDrawdown, periodReturn, rangeIndices, rebase, thin, rangeFor } from "../lib/series";
import type { Prices, UniverseRow } from "../lib/types";

const TABLE_METRICS = [
  "market_cap", "pe_now", "pb_now", "ev_ebitda_now", "div_yield_now",
  "revenue_growth", "net_income_growth", "rev_cagr", "ebitda_margin", "net_margin", "roe", "roa", "roce",
  "current_ratio", "debt_to_equity", "interest_coverage", "asset_turnover", "cash_conversion", "fcf_margin",
  "ret_1Y", "cagr_3Y", "cagr_5Y", "vol_1Y", "sharpe_3Y", "beta_3Y", "max_dd_5Y",
];
const RADAR: { id: string; label: string; invert?: boolean }[] = [
  { id: "revenue_growth", label: "Growth" }, { id: "roe", label: "Returns (ROE)" }, { id: "net_margin", label: "Margin" },
  { id: "debt_to_equity", label: "Low leverage", invert: true }, { id: "cash_conversion", label: "Cash quality" },
  { id: "pe_now", label: "Cheapness (P/E)", invert: true }, { id: "ret_1Y", label: "Momentum (1Y)" }, { id: "vol_1Y", label: "Low volatility", invert: true },
];
const PRESETS: { label: string; pick: (u: UniverseRow[]) => string[] }[] = [
  { label: "Top 5 by market cap", pick: (u) => [...u].sort((a, b) => (b.valuation.market_cap ?? 0) - (a.valuation.market_cap ?? 0)).slice(0, 5).map((r) => r.symbol) },
  { label: "IT services", pick: (u) => u.filter((r) => r.sector === "Information Technology").map((r) => r.symbol).slice(0, 6) },
  { label: "Banks", pick: () => ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK"] },
  { label: "Autos", pick: (u) => u.filter((r) => r.sector.startsWith("Automobile")).map((r) => r.symbol).slice(0, 6) },
  { label: "FMCG", pick: (u) => u.filter((r) => r.sector === "Fast Moving Consumer Goods").map((r) => r.symbol).slice(0, 6) },
  { label: "Metals", pick: (u) => u.filter((r) => r.sector === "Metals & Mining").map((r) => r.symbol).slice(0, 6) },
];

export default function Compare() {
  const uni = useUniverse();
  const { data: dict } = useKpiDict();
  const s = useSettings();
  const [params, setParams] = useSearchParams();
  const [basis, setBasis] = useState<"total" | "price">("total");
  const [bench, setBench] = useState(true);
  const [trendKpi, setTrendKpi] = useState("net_margin");
  const [busy, setBusy] = useState(false);
  const t = tokens();

  // URL ⇄ store sync so comparisons are shareable
  useEffect(() => {
    const q = params.get("s");
    if (q) {
      const list = q.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, MAX_COMPARE);
      if (list.join(",") !== s.compare.join(",")) s.set({ compare: list });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setParams(s.compare.length ? { s: s.compare.join(",") } : {}, { replace: true });
  }, [s.compare, setParams]);

  const valid = useMemo(() => s.compare.filter((x) => uni.data?.some((r) => r.symbol === x)), [s.compare, uni.data]);
  const priceKeys = useMemo(() => (bench ? [...valid, "NIFTY50"] : valid), [valid, bench]);
  const prices = useMany<Prices>(priceKeys, api.prices);
  const metrics = useMemo(() => (dict ? buildMetrics(dict) : []), [dict]);
  const M = (id: string) => metrics.find((m) => m.id === id) as Metric;

  if (uni.error) return <ErrorState error={uni.error} />;
  if (!uni.data || !dict) return <Skeleton className="h-[600px]" />;
  const rows = valid.map((x) => uni.data!.find((r) => r.symbol === x)!) as UniverseRow[];
  const fyLabel = s.fy === "latest" ? "latest FY" : s.fy;
  const color = (i: number) => t.series[i % 8];
  const mixed = rows.some((r) => r.is_financial) && rows.some((r) => !r.is_financial);

  // ---------------- normalised performance
  let perf: { option: EChartsOption; data: any; stats: any[]; from?: string; to?: string } | null = null;
  if (prices.data && rows.length) {
    const ref = prices.data[rows[0].symbol];
    const range = ref ? rangeFor(ref, s.range, s.from, s.to) : null;
    if (range) {
      const series: any[] = [];
      const stats: any[] = [];
      const allDates = new Set<string>();
      const keys = bench ? [...rows.map((r) => r.symbol), "NIFTY50"] : rows.map((r) => r.symbol);
      keys.forEach((k, idx) => {
        const p = prices.data![k];
        if (!p) return;
        const [i, j] = rangeIndices(p, range[0], range[1]);
        const src = k === "NIFTY50" ? p.c : basis === "total" ? p.a : p.c;
        const rb = rebase(src, i, j);
        const pts = thin(p.d.slice(i, j + 1).map((d, n) => [d, rb[n] === null ? null : +rb[n]!.toFixed(2)] as [string, number | null]), 1500);
        pts.forEach(([d]) => allDates.add(d));
        const isB = k === "NIFTY50";
        series.push({ type: "line", name: isB ? "NIFTY 50 (price)" : k, data: pts, showSymbol: false, connectNulls: false,
          lineStyle: { width: isB ? 1.5 : 2, type: isB ? "dashed" : "solid", color: isB ? t.ink3 : color(idx) }, itemStyle: { color: isB ? t.ink3 : color(idx) },
          endLabel: { show: true, formatter: (q: any) => `${isB ? "NIFTY" : k} ${q.value[1]?.toFixed(0)}`, color: t.ink2, fontSize: 10, fontFamily: MONO } });
        const firstListed = p.d[0] > range[0];
        stats.push({ k, ret: periodReturn(src, i, j), vol: annualisedVol(src, i, j), mdd: maxDrawdown(src, i, j), firstListed, start: p.d[i] });
      });
      perf = {
        from: range[0], to: range[1], stats,
        option: {
          ...base(t), legend: legend(t),
          grid: { left: 8, right: 118, top: 32, bottom: 30, containLabel: true },
          tooltip: { ...(base(t).tooltip as object), trigger: "axis", valueFormatter: (v: any) => (isNum(v) ? v.toFixed(1) : "—") },
          xAxis: timeAxis(t),
          yAxis: valueAxis(t, { scale: true, axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10 } }),
          dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 4, borderColor: t.line, fillerColor: t.accentA(0.12), handleStyle: { color: t.accent }, textStyle: { color: t.ink3, fontSize: 9 } }],
          series: [...series, { type: "line", data: [], markLine: { silent: true, symbol: "none", lineStyle: { color: t.line }, label: { show: false }, data: [{ yAxis: 100 }] } }],
        },
        data: {
          headers: ["Date", ...series.map((x) => x.name)],
          rows: Array.from(allDates).sort().map((d) => [d, ...series.map((x) => x.data.find((q: any) => q[0] === d)?.[1] ?? null)]),
        },
      };
    }
  }

  // ---------------- KPI trend lines
  const fys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.kpi_hist?.[trendKpi] ?? {})))).filter((f) => /^FY\d{4}$/.test(f)).sort();
  const tk = M(trendKpi);
  const trend: EChartsOption = {
    ...base(t), legend: legend(t),
    grid: { left: 8, right: 70, top: 32, bottom: 4, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), trigger: "axis", valueFormatter: (v: any) => byUnit(v, tk?.unit ?? "x", s.unit) },
    xAxis: categoryAxis(t, fys, { boundaryGap: false }),
    yAxis: valueAxis(t, { scale: true, axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => (tk?.unit === "pct" ? pct(v, 0) : v.toFixed(1)) } }),
    series: rows.map((r, i) => ({ type: "line", name: r.symbol, data: fys.map((f) => r.kpi_hist?.[trendKpi]?.[f] ?? null), symbol: "circle", symbolSize: 7,
      lineStyle: { width: 2, color: color(i) }, itemStyle: { color: color(i), borderColor: t.surface, borderWidth: 2 },
      endLabel: { show: true, formatter: r.symbol, color: t.ink2, fontSize: 10 } })),
  };

  // ---------------- revenue rebased (common first FY)
  const revFys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.fund_hist?.revenue ?? {})))).filter((f) => /^FY\d{4}$/.test(f)).sort();
  const common = revFys.find((f) => rows.every((r) => isNum(r.fund_hist?.revenue?.[f])));
  const revIdx: EChartsOption = {
    ...base(t), legend: legend(t),
    grid: { left: 8, right: 70, top: 32, bottom: 4, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), trigger: "axis", valueFormatter: (v: any) => (isNum(v) ? v.toFixed(1) : "—") },
    xAxis: categoryAxis(t, revFys.filter((f) => !common || f >= common), { boundaryGap: false }),
    yAxis: valueAxis(t, { scale: true }),
    series: rows.map((r, i) => {
      const b = common ? r.fund_hist.revenue[common] : null;
      return { type: "line", name: r.symbol, data: revFys.filter((f) => !common || f >= common).map((f) => (b && isNum(r.fund_hist.revenue?.[f]) ? +(r.fund_hist.revenue[f] / b * 100).toFixed(1) : null)),
        symbol: "circle", symbolSize: 7, lineStyle: { width: 2, color: color(i) }, itemStyle: { color: color(i), borderColor: t.surface, borderWidth: 2 },
        endLabel: { show: true, formatter: r.symbol, color: t.ink2, fontSize: 10 } };
    }),
  };

  // ---------------- radar (percentile within NIFTY 50)
  const radarVals = rows.map((r) => RADAR.map((d) => {
    const m = M(d.id);
    if (!m) return null;
    const pr = percentileRank(uni.data!.map((u) => m.get(u, s.fy)), m.get(r, s.fy));
    return isNum(pr) ? Math.round((d.invert ? 1 - pr : pr) * 100) : null;
  }));
  const radar: EChartsOption = {
    ...base(t), legend: legend(t, { top: "bottom" }),
    tooltip: { ...(base(t).tooltip as object), trigger: "item" },
    radar: {
      indicator: RADAR.map((d) => ({ name: d.label, max: 100 })), radius: "64%", center: ["50%", "48%"],
      axisName: { color: t.ink2, fontSize: 10 }, splitLine: { lineStyle: { color: t.grid } }, splitArea: { show: false }, axisLine: { lineStyle: { color: t.line } },
    },
    series: [{ type: "radar", symbolSize: 5, data: rows.map((r, i) => ({ name: r.symbol, value: radarVals[i].map((v) => v ?? 0),
      lineStyle: { color: color(i), width: 2 }, itemStyle: { color: color(i) }, areaStyle: { color: color(i), opacity: 0.06 } })) }],
  };

  const exportCmp = async () => {
    setBusy(true);
    try {
      const { comparisonReport } = await import("../excel/comparisonReport");
      await comparisonReport(valid, s.fy, perf ? [perf.from!, perf.to!] : null, basis);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-rise">
      <SectionTitle eyebrow="Module E" title="Company comparison"
        desc="Build a peer set of up to six constituents. Prices are rebased to 100 at the start of the selected period; fundamentals use the fiscal year in the toolbar. Metrics unavailable for a company are marked — never filled."
        right={<button className="btn-primary" onClick={exportCmp} disabled={!valid.length || busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}Export comparison (Excel)</button>} />

      <Builder universe={uni.data} />
      {mixed && <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-2xs text-ink2">This set mixes lenders/insurers with operating companies. Margin, liquidity, EBITDA and ROCE metrics are not comparable across the two groups and are shown as “n/a” for lenders.</div>}

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink3">Add companies above to start a comparison.</div>
      ) : (
        <>
          {perf ? (
            <ChartCard title="Relative performance · rebased to 100" subtitle={`${fmtDate(perf.from)} → ${fmtDate(perf.to)} · ${basis === "total" ? "total return (adjusted close)" : "price only"} · change period in toolbar`}
              option={perf.option} data={perf.data} height={400} filename="comparison_rebased"
              controls={<>
                <Segmented value={basis} onChange={setBasis} options={[{ value: "total", label: "Total return" }, { value: "price", label: "Price" }]} />
                <label className="chip cursor-pointer"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={bench} onChange={() => setBench((b) => !b)} />NIFTY 50 benchmark</label>
              </>}
              footnote={perf.stats.some((x) => x.firstListed) ? "A series starts later where the company listed after the period start; it is rebased to 100 on its first trading day." : undefined} />
          ) : <Skeleton className="h-[460px]" />}

          {perf && (
            <section className="card overflow-x-auto p-4">
              <table className="w-full text-xs">
                <thead><tr>{["", "Period return", "Volatility (ann.)", "Max drawdown", "Series start"].map((h) => <th key={h} className="table-head px-3 py-2 text-right first:text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {perf.stats.map((x, i) => (
                    <tr key={x.k} className="border-t border-line/50">
                      <td className="px-3 py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: x.k === "NIFTY50" ? t.ink3 : color(i) }} /><span className="font-mono font-semibold">{x.k === "NIFTY50" ? "NIFTY 50" : x.k}</span></td>
                      <td className={cx("num px-3 py-2 text-right", (x.ret ?? 0) >= 0 ? "text-up" : "text-down")}>{pct(x.ret, 1, true)}</td>
                      <td className="num px-3 py-2 text-right">{pct(x.vol)}</td>
                      <td className="num px-3 py-2 text-right text-down">{pct(x.mdd)}</td>
                      <td className="num px-3 py-2 text-right text-ink3">{fmtDate(x.start)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <KpiMatrix rows={rows} metrics={TABLE_METRICS.map(M).filter(Boolean)} color={color} />

          <section className="grid gap-4 xl:grid-cols-3">
            <ChartCard title={`Trend · ${tk?.label ?? ""}`} subtitle="Annual · each company's reported fiscal years" option={trend} height={300} filename={`compare_trend_${trendKpi}`}
              data={{ headers: ["Symbol", ...fys], rows: rows.map((r) => [r.symbol, ...fys.map((f) => r.kpi_hist?.[trendKpi]?.[f] ?? null)]) }}
              controls={<Select label="KPI" value={trendKpi} onChange={setTrendKpi} options={dict.map((k) => ({ value: k.id, label: k.name, group: k.group }))} />} />
            <ChartCard title="Revenue growth, rebased" subtitle={common ? `Revenue indexed to 100 in ${common} (first fiscal year all selected companies report)` : "No common fiscal year across the selection"}
              option={revIdx} height={300} filename="compare_revenue_index" empty={!common ? "Selected companies share no common revenue year" : undefined}
              data={{ headers: ["Symbol", ...revFys], rows: rows.map((r) => [r.symbol, ...revFys.map((f) => r.fund_hist?.revenue?.[f] ?? null)]) }}
              footnote="Indexing removes scale differences so growth paths of very different-sized companies can share one axis." />
            <ChartCard title="Relative profile" subtitle={`Percentile rank within all NIFTY 50 constituents (100 = best) · ${fyLabel}`}
              info="Radar is used because every axis is on the same 0–100 percentile scale. Inverted axes (leverage, P/E, volatility) score lower values higher. Unavailable metrics plot at 0 and are listed in the table export."
              option={radar} height={300} filename="compare_radar"
              data={{ headers: ["Symbol", ...RADAR.map((d) => d.label)], rows: rows.map((r, i) => [r.symbol, ...radarVals[i]]) }} />
          </section>
        </>
      )}
    </div>
  );
}

function Builder({ universe }: { universe: UniverseRow[] }) {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutside<HTMLDivElement>(open, close);
  const list = universe.filter((r) => !s.compare.includes(r.symbol) && (r.symbol + " " + r.name + " " + r.sector).toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  return (
    <section className="card flex flex-wrap items-center gap-2 p-3">
      {s.compare.map((x, i) => {
        const r = universe.find((u) => u.symbol === x);
        return (
          <span key={x} className="flex items-center gap-2 rounded-lg border border-line bg-raised/60 py-1 pl-2 pr-1 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(--s${(i % 8) + 1})` }} />
            <Link to={`/company/${x}`} className="font-mono font-semibold hover:text-accent">{x}</Link>
            <span className="hidden text-ink3 md:inline">{r ? shortName(r.name) : "not in universe"}</span>
            <button className="rounded p-0.5 text-ink3 hover:bg-surface hover:text-ink" onClick={() => s.removeCompare(x)} aria-label={`Remove ${x}`}><X size={12} /></button>
          </span>
        );
      })}
      <div className="relative" ref={ref}>
        <button className="btn" disabled={s.compare.length >= MAX_COMPARE} onClick={() => setOpen((o) => !o)}><Plus size={12} />Add company</button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-line bg-surface p-2 shadow-pop animate-fade">
            <input autoFocus className="input mb-2 w-full" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-72 overflow-auto">
              {list.map((r) => (
                <button key={r.symbol} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-raised"
                  onClick={() => { s.addCompare(r.symbol); setQ(""); if (s.compare.length + 1 >= MAX_COMPARE) setOpen(false); }}>
                  <span className="w-24 font-mono font-semibold">{r.symbol}</span><span className="truncate text-ink3">{shortName(r.name)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <span className="text-2xs text-ink3">{s.compare.length}/{MAX_COMPARE}</span>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {PRESETS.map((p) => <button key={p.label} className="chip hover:text-ink" onClick={() => s.set({ compare: p.pick(universe).slice(0, MAX_COMPARE) })}>{p.label}</button>)}
        <button className="chip hover:text-ink" onClick={() => s.set({ compare: [] })}>Clear</button>
      </div>
    </section>
  );
}

function KpiMatrix({ rows, metrics, color }: { rows: UniverseRow[]; metrics: Metric[]; color: (i: number) => string }) {
  const s = useSettings();
  const groups = Array.from(new Set(metrics.map((m) => m.group)));
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-4">
        <div>
          <div className="text-sm font-medium">Side-by-side metrics <InfoTip text="Best value in each row (direction-aware) is highlighted. Fiscal-year metrics show the year used under the value when it differs from the selection. Hover “n/a” for the reason." /></div>
          <div className="text-2xs text-ink3">Fiscal-year metrics: {s.fy === "latest" ? "each company's latest FY" : s.fy} · market metrics: latest close</div>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead><tr>
            <th className="table-head px-4 py-2">Metric</th>
            {rows.map((r, i) => <th key={r.symbol} className="table-head px-3 py-2 text-right"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: color(i) }} />{r.symbol}</th>)}
          </tr></thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g}><td colSpan={rows.length + 1} className="bg-raised/50 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-ink3">{g}</td></tr>,
              ...metrics.filter((m) => m.group === g).map((m) => {
                const vals = rows.map((r) => m.get(r, s.fy));
                const ok = vals.filter(isNum);
                const best = m.better && ok.length > 1 ? (m.better === "higher" ? Math.max(...ok) : Math.min(...ok)) : null;
                return (
                  <tr key={m.id} className="border-t border-line/50 hover:bg-raised/40">
                    <td className="px-4 py-1.5 text-ink2" title={m.basis}>{m.label}</td>
                    {rows.map((r, i) => {
                      const v = vals[i];
                      const kid = m.id;
                      const fyUsed = m.fyDependent && dictHas(r, kid) ? kpiAt(r, kid, s.fy).fy : null;
                      const naCode = !isNum(v) && m.fyDependent ? (r.is_financial && ["ebitda_margin", "roce", "current_ratio", "interest_coverage", "ebit_margin"].includes(kid) ? "na_financial" : undefined) : undefined;
                      return (
                        <td key={r.symbol} className={cx("num px-3 py-1.5 text-right", v === best && "font-semibold text-up")}>
                          {isNum(v) ? byUnit(v, m.unit, s.unit) : <span className="cursor-help text-ink3" title={reason(naCode ?? (r.is_financial ? "na_financial" : "missing:inputs for this fiscal year"))}>n/a</span>}
                          {fyUsed && s.fy === "latest" && <div className="text-[9px] text-ink3">{fyUsed}</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line p-3 text-2xs text-ink3"><Badge tone="positive">Best in row</Badge> computed only where a higher/lower direction is meaningful and ≥ 2 companies report the metric.</div>
    </section>
  );
}

function dictHas(r: UniverseRow, id: string) {
  return !!r.kpi_hist?.[id];
}
