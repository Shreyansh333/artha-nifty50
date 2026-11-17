import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { api, useAsync, usePrices } from "../../lib/data";
import { useSettings } from "../../lib/store";
import { ChartCard } from "../../charts/ChartCard";
import { base, categoryAxis, clampScore, divergingColor, heatVisual, legend, textOn, timeAxis, tokens, valueAxis, MONO } from "../../charts/theme";
import { Delta, InfoTip, Stat } from "../../components/ui";
import { fmtDate, num, pct } from "../../lib/format";
import { annualisedVol, maxDrawdown, periodReturn, rangeIndices, rangeFor } from "../../lib/series";
import type { Company } from "../../lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function RiskTab({ c }: { c: Company }) {
  const s = useSettings();
  const t = tokens();
  const { data: idx } = useAsync(api.index, []);
  const { data: px } = usePrices(c.symbol);
  const { data: ipx } = usePrices("NIFTY50");
  const range = rangeFor(px, s.range, s.from, s.to);
  const r = c.market.risk;

  const dd = useMemo(() => {
    const w = c.market.drawdown_weekly;
    if (!w) return null;
    const option: EChartsOption = {
      ...base(t),
      grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", valueFormatter: (v: any) => pct(v, 1) },
      xAxis: timeAxis(t),
      yAxis: valueAxis(t, { max: 0, axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => pct(v, 0) } }),
      dataZoom: [{ type: "inside" }],
      series: [{ type: "line", name: "Drawdown", data: w.d.map((d, i) => [d, w.v[i]]), showSymbol: false, lineStyle: { width: 1.5, color: t.down },
        areaStyle: { color: t.downA(0.18) } }],
    };
    return { option, data: { headers: ["Week ending", "Drawdown from running peak"], rows: w.d.map((d, i) => [d, w.v[i]]) } };
  }, [c, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const cal = useMemo(() => {
    const years = Object.keys(c.market.calendar ?? {}).sort();
    const option: EChartsOption = {
      ...base(t), legend: legend(t),
      grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => pct(v, 1, true) },
      xAxis: categoryAxis(t, years),
      yAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => pct(v, 0) } }),
      series: [
        { type: "bar", name: c.symbol, data: years.map((y) => c.market.calendar![y]), barMaxWidth: 16, itemStyle: { color: t.series[0], borderRadius: 3 } },
        { type: "bar", name: "NIFTY 50 (price)", data: years.map((y) => idx?.calendar[y] ?? null), barMaxWidth: 16, itemStyle: { color: t.series[1], borderRadius: 3 } },
      ],
    };
    return { option, data: { headers: ["Year", `${c.symbol} total return`, "NIFTY 50 price return"], rows: years.map((y) => [y, c.market.calendar![y], idx?.calendar[y] ?? null]) } };
  }, [c, idx, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const heat = useMemo(() => {
    const m = c.market.monthly ?? {};
    const years = Array.from(new Set(Object.keys(m).map((k) => k.slice(0, 4)))).sort();
    const data = Object.entries(m).map(([k, v]) => {
      const col = divergingColor(t, v, 0.12);
      return { value: [Number(k.slice(5)) - 1, years.indexOf(k.slice(0, 4)), v, clampScore(v === null ? null : v / 0.12)], label: { color: textOn(col) } };
    });
    const option: EChartsOption = {
      ...base(t),
      grid: { left: 8, right: 8, top: 8, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), formatter: (p: any) => `${MONTHS[p.value[0]]} ${years[p.value[1]]}<br/><b>${pct(p.value[2], 2, true)}</b>` },
      visualMap: heatVisual(t) as any,
      xAxis: categoryAxis(t, MONTHS, { position: "top", splitArea: { show: false } }),
      yAxis: categoryAxis(t, years, { inverse: true }),
      series: [{ type: "heatmap", data, label: { show: true, fontSize: 9, fontFamily: MONO, formatter: (p: any) => (p.value[2] * 100).toFixed(1) },
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 } }],
    };
    return { option, height: Math.max(220, years.length * 26 + 30), data: { headers: ["Month", "Total return"], rows: Object.entries(m).map(([k, v]) => [k, v]) } };
  }, [c, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeStats = useMemo(() => {
    if (!px || !range) return null;
    const [i, j] = rangeIndices(px, range[0], range[1]);
    const rets: number[] = [];
    for (let k = i + 1; k <= j; k++) { const a = px.a[k - 1], b = px.a[k]; if (a && b) rets.push(b / a - 1); }
    let idxRet: number | null = null;
    if (ipx) { const [a, b] = rangeIndices(ipx, range[0], range[1]); idxRet = periodReturn(ipx.c, a, b); }
    // histogram of daily returns (0.5% bins, clipped at ±6%)
    const bins = new Map<number, number>();
    rets.forEach((x) => { const b = Math.max(-12, Math.min(12, Math.floor(x / 0.005))); bins.set(b, (bins.get(b) ?? 0) + 1); });
    const keys = Array.from({ length: 25 }, (_, k) => k - 12);
    const option: EChartsOption = {
      ...base(t),
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps: any) => { const b = keys[ps[0].dataIndex]; return `${pct(b * 0.005, 1)} to ${pct((b + 1) * 0.005, 1)}${b === -12 || b === 12 ? " (incl. tail)" : ""}<br/><b>${ps[0].value} days</b>`; } },
      xAxis: categoryAxis(t, keys.map((b) => `${(b * 0.5).toFixed(1)}%`), { axisLabel: { color: t.ink3, fontSize: 9, interval: 3 } }),
      yAxis: valueAxis(t),
      series: [{ type: "bar", data: keys.map((b) => ({ value: bins.get(b) ?? 0, itemStyle: { color: b < 0 ? t.down : t.up, borderRadius: [3, 3, 0, 0] } })), barCategoryGap: "12%" }],
    };
    const sorted = [...rets].sort((a, b) => a - b);
    return {
      option, n: rets.length, from: px.d[i], to: px.d[j],
      ret: periodReturn(px.a, i, j), vol: annualisedVol(px.a, i, j), mdd: maxDrawdown(px.a, i, j), idxRet,
      best: sorted[sorted.length - 1], worst: sorted[0], var95: sorted[Math.floor(sorted.length * 0.05)] ?? null,
      pos: rets.filter((x) => x > 0).length / Math.max(rets.length, 1),
      data: { headers: ["Bin from", "Bin to", "Days"], rows: keys.map((b) => [b * 0.005, (b + 1) * 0.005, bins.get(b) ?? 0]) },
    };
  }, [px, ipx, range, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">Risk profile <InfoTip text={`Volatility = annualised σ of daily log returns (adjusted close). Sharpe/Sortino = (CAGR − ${pct(0.065)} risk-free assumption) ÷ σ (downside σ). Beta = 3-year daily covariance with the NIFTY 50 ÷ index variance.`} /></div>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Volatility 1Y" value={pct(r?.vol_1Y)} />
          <Stat label="Volatility 3Y" value={pct(r?.vol_3Y)} />
          <Stat label="Sharpe 3Y" value={num(r?.sharpe_3Y, 2)} />
          <Stat label="Sortino 3Y" value={num(r?.sortino_3Y, 2)} />
          <Stat label="Beta 3Y" value={num(r?.beta_3Y, 2)} sub={`Correlation ${num(r?.corr_3Y, 2)}`} />
          <Stat label="Max drawdown" value={pct(r?.max_drawdown)} tone="text-down" sub={r?.mdd_peak ? `${fmtDate(r.mdd_peak)} → ${fmtDate(r.mdd_trough)}` : ""} />
          <Stat label="Max DD (5Y)" value={pct(r?.max_drawdown_5Y)} tone="text-down" />
          <Stat label="From all-time high" value={pct(r?.current_drawdown)} tone={(r?.current_drawdown ?? 0) < -0.1 ? "text-down" : "text-ink"} />
        </div>
      </section>

      {rangeStats && (
        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="card p-5">
            <div className="text-sm font-medium">Selected period</div>
            <div className="mb-4 text-2xs text-ink3">{fmtDate(rangeStats.from)} → {fmtDate(rangeStats.to)} · {rangeStats.n} sessions · set in toolbar</div>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Total return" value={<Delta v={rangeStats.ret} dp={1} />} />
              <Stat label="NIFTY 50 (price)" value={<Delta v={rangeStats.idxRet} dp={1} />} />
              <Stat label="Volatility (ann.)" value={pct(rangeStats.vol)} />
              <Stat label="Max drawdown" value={pct(rangeStats.mdd)} tone="text-down" />
              <Stat label="Best day" value={pct(rangeStats.best, 2, true)} tone="text-up" />
              <Stat label="Worst day" value={pct(rangeStats.worst, 2)} tone="text-down" />
              <Stat label="1-day VaR 95%" value={pct(rangeStats.var95, 2)} info="Historical: the 5th-percentile daily return in the period." />
              <Stat label="Up days" value={pct(rangeStats.pos, 0)} />
            </div>
          </div>
          <ChartCard title="Distribution of daily returns" subtitle="Selected period · 0.5% bins · tails grouped at ±6%" option={rangeStats.option} data={rangeStats.data} height={260} filename={`${c.symbol}_return_distribution`} />
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        {dd && <ChartCard title="Drawdown from running peak" subtitle="Weekly · last 10 years · adjusted close" option={dd.option} data={dd.data} height={260} filename={`${c.symbol}_drawdown`} />}
        <ChartCard title="Calendar-year returns vs NIFTY 50" subtitle="Company: total return · index: price return (dividends excluded)" option={cal.option} data={cal.data} height={260} filename={`${c.symbol}_calendar_returns`} />
      </section>
      <ChartCard title="Monthly returns" subtitle="Total return by month · diverging colour capped at ±12% · labels in %" option={heat.option} data={heat.data} height={heat.height} filename={`${c.symbol}_monthly_returns`} />
    </div>
  );
}
