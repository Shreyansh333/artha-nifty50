import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { usePrices } from "../../lib/data";
import { useSettings } from "../../lib/store";
import { ChartCard } from "../../charts/ChartCard";
import { base, categoryAxis, legend, timeAxis, tokens, valueAxis, MONO } from "../../charts/theme";
import { Badge, Delta, InfoTip, Segmented, Skeleton, Stat } from "../../components/ui";
import { fmtDate, mult, money, moneyRaw, num, pct, UNITS } from "../../lib/format";
import { annualisedVol, maxDrawdown, periodReturn, rangeIndices, sma, rangeFor } from "../../lib/series";
import type { Company } from "../../lib/types";
import { InsightCard } from "./InsightsTab";

export default function OverviewTab({ c }: { c: Company }) {
  const s = useSettings();
  const { data: px } = usePrices(c.symbol);
  const [mode, setMode] = useState<"line" | "candle">("line");
  const [ma, setMa] = useState({ m50: true, m200: true, vol: true });
  const t = tokens();
  const range = rangeFor(px, s.range, s.from, s.to);

  const chart = useMemo(() => {
    if (!px || !range) return null;
    const [i, j] = rangeIndices(px, range[0], range[1]);
    const ma50 = sma(px.c, 50), ma200 = sma(px.c, 200);
    const d = px.d.slice(i, j + 1);
    const series: any[] = [];
    if (mode === "line") {
      series.push({ type: "line", name: "Close", data: d.map((x, k) => [x, px.c[i + k]]), showSymbol: false, lineStyle: { width: 1.8, color: t.series[0] }, z: 3 });
    } else {
      series.push({
        type: "candlestick", name: "OHLC", data: d.map((x, k) => [x, px.o[i + k], px.c[i + k], px.l[i + k], px.h[i + k]]),
        itemStyle: { color: t.up, color0: t.down, borderColor: t.up, borderColor0: t.down },
      });
    }
    if (ma.m50) series.push({ type: "line", name: "50-DMA", data: d.map((x, k) => [x, ma50[i + k]]), showSymbol: false, lineStyle: { width: 1.2, color: t.series[1] } });
    if (ma.m200) series.push({ type: "line", name: "200-DMA", data: d.map((x, k) => [x, ma200[i + k]]), showSymbol: false, lineStyle: { width: 1.2, color: t.series[6] } });
    if (ma.vol) series.push({
      type: "bar", name: "Volume", xAxisIndex: 1, yAxisIndex: 1, data: d.map((x, k) => [x, px.v[i + k]]),
      itemStyle: { color: t.accentA(0.35) }, barMaxWidth: 6, large: true,
    });
    const option: EChartsOption = {
      ...base(t),
      legend: legend(t),
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "cross", label: { backgroundColor: t.raised, color: t.ink } },
        valueFormatter: (v: any) => (typeof v === "number" ? (v > 1e5 ? num(v) : num(v, 2)) : "—") },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: ma.vol
        ? [{ left: 8, right: 12, top: 30, height: "64%", containLabel: true }, { left: 8, right: 12, top: "80%", bottom: 34, containLabel: true }]
        : [{ left: 8, right: 12, top: 30, bottom: 40, containLabel: true }],
      xAxis: ma.vol
        ? [timeAxis(t, { axisLabel: { show: false } }), timeAxis(t, { gridIndex: 1 })]
        : [timeAxis(t)],
      yAxis: ma.vol
        ? [valueAxis(t, { scale: true, axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => num(v) } }),
           valueAxis(t, { gridIndex: 1, splitNumber: 2, axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 9, formatter: (v: number) => (v >= 1e7 ? `${(v / 1e7).toFixed(0)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : num(v)) } })]
        : [valueAxis(t, { scale: true })],
      dataZoom: [{ type: "inside", xAxisIndex: ma.vol ? [0, 1] : [0] }, {
        type: "slider", xAxisIndex: ma.vol ? [0, 1] : [0], height: 18, bottom: 4, borderColor: t.line, fillerColor: t.accentA(0.12),
        handleStyle: { color: t.accent }, textStyle: { color: t.ink3, fontSize: 9 }, dataBackground: { lineStyle: { color: t.ink3 }, areaStyle: { color: t.raised } },
      }],
      series,
    };
    const data = { headers: ["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "50-DMA", "200-DMA"],
      rows: d.map((x, k) => [x, px.o[i + k], px.h[i + k], px.l[i + k], px.c[i + k], px.a[i + k], px.v[i + k], ma50[i + k], ma200[i + k]]) };
    const stats = { ret: periodReturn(px.a, i, j), vol: annualisedVol(px.a, i, j), mdd: maxDrawdown(px.a, i, j), from: d[0], to: d[d.length - 1] };
    return { option, data, stats };
  }, [px, range, mode, ma, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  // fundamentals trend (reference workbook chart 1: revenue & profit)
  const fund = useMemo(() => {
    const st = c.statements[s.basis].income;
    const get = (k: string) => st.rows.find((r) => r.key === k)?.values ?? [];
    const rev = get("revenue"), ni = get("net_income"), ebitda = get("ebitda");
    const names = ["Revenue", ...(c.is_financial ? [] : ["EBITDA"]), "Net income"];
    const arrays = [rev, ...(c.is_financial ? [] : [ebitda]), ni];
    const option: EChartsOption = {
      ...base(t), legend: legend(t),
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => (v === null || v === undefined ? "n/a" : `${num(v, 0)} ${UNITS[s.unit].short}`) },
      xAxis: categoryAxis(t, st.periods),
      yAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => num(v) } }),
      series: names.map((n, k) => ({ type: "bar", name: n, data: arrays[k].map((v) => moneyRaw(v, s.unit)), barMaxWidth: 22, itemStyle: { borderRadius: [4, 4, 0, 0] } })),
    };
    return { option, data: { headers: ["Period", ...names.map((n) => `${n} (${UNITS[s.unit].short})`)], rows: st.periods.map((p, k) => [p, ...arrays.map((a) => moneyRaw(a[k], s.unit))]) } };
  }, [c, s.basis, s.unit, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = c.valuation, r = c.market.risk, ret = c.market.returns ?? {};
  const top = [...c.insights].sort((a, b) => b.weight - a.weight).slice(0, 4);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {chart ? (
          <ChartCard title="Share price" subtitle={`${fmtDate(chart.stats.from)} → ${fmtDate(chart.stats.to)} · split-adjusted close (₹) · drag the slider or scroll to zoom`}
            info="Price panel uses Yahoo 'Close' (split-adjusted). Moving averages are simple averages of daily closes. Period statistics use the dividend-adjusted series (total return)."
            option={chart.option} data={chart.data} height={430} filename={`${c.symbol}_prices`}
            controls={<>
              <Segmented value={mode} onChange={setMode} options={[{ value: "line", label: "Line" }, { value: "candle", label: "Candles" }]} />
              {([["m50", "50-DMA"], ["m200", "200-DMA"], ["vol", "Volume"]] as const).map(([k, l]) => (
                <label key={k} className="chip cursor-pointer select-none">
                  <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={ma[k]} onChange={() => setMa((m) => ({ ...m, [k]: !m[k] }))} />{l}
                </label>
              ))}
              <span className="ml-auto flex gap-3 text-2xs text-ink3">
                <span>Period return <Delta v={chart.stats.ret} dp={1} /></span>
                <span>Vol. <span className="num text-ink2">{pct(chart.stats.vol)}</span></span>
                <span>Max DD <span className="num text-down">{pct(chart.stats.mdd)}</span></span>
              </span>
            </>} />
        ) : <Skeleton className="h-[520px]" />}

        <div className="card space-y-4 p-4">
          <div className="text-sm font-medium">Key statistics</div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Market cap" value={money(v.market_cap, s.unit)} sub={v.market_cap_source} />
            <Stat label="P/E" value={mult(v.pe)} sub={v.pe_note ?? v.pe_basis ?? "n/a"} info={`Market cap ÷ net income. Yahoo's trailing P/E for cross-check: ${mult(v.yahoo_trailing_pe)}.`} />
            <Stat label="P/B" value={mult(v.pb)} sub={v.pb_basis ?? ""} />
            <Stat label={c.is_financial ? "P/S" : "EV/EBITDA"} value={mult(c.is_financial ? v.ps : v.ev_ebitda)} sub={(c.is_financial ? v.ps_basis : v.ev_ebitda_basis) ?? "n/a"} />
            <Stat label="Dividend yield" value={pct(v.dividend_yield, 2)} sub="TTM dividends / price" />
            <Stat label="Beta (3Y)" value={num(r?.beta_3Y, 2)} sub={`Yahoo beta ${num(v.beta_yahoo, 2)}`} info="Computed from 3 years of daily returns against the NIFTY 50 index." />
            <Stat label="1Y return" value={<Delta v={ret["1Y"]} dp={1} />} sub="Total return" />
            <Stat label="5Y CAGR" value={pct(c.market.cagr?.["5Y"], 1, true)} sub="Annualised" />
            <Stat label="Volatility 1Y" value={pct(r?.vol_1Y)} sub="Annualised" />
            <Stat label="Max drawdown" value={pct(r?.max_drawdown)} sub={r?.mdd_trough ? `trough ${fmtDate(r.mdd_trough)}` : ""} tone="text-down" />
          </div>
          <div className="border-t border-line pt-3 text-2xs text-ink3">
            Avg. daily traded value (3M) <span className="num text-ink2">{money(c.snapshot.avg_traded_value_3m, s.unit)}</span> · history since {fmtDate(c.snapshot.history_start)}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={`Revenue & profit · ${s.basis}`} subtitle={`${UNITS[s.unit].label} · as reported (Yahoo)`} option={fund.option} data={fund.data}
          height={280} filename={`${c.symbol}_revenue_profit`}
          empty={fund.data.rows.length === 0 ? "No income-statement periods available" : undefined}
          footnote={<>Missing bars are unavailable from the source, not zero. <Link className="text-accent" to={`/company/${c.symbol}/financials`}>Full statements →</Link></>} />
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Key observations <InfoTip text="Deterministic rules applied to the computed figures. 'Fact' lines are verifiable from the evidence; 'Interpretation' lines are analytical readings, not advice." /></div>
            <Link to={`/company/${c.symbol}/insights`} className="text-2xs text-accent hover:underline">All {c.insights.length} →</Link>
          </div>
          <div className="space-y-2">{top.map((o) => <InsightCard key={o.rule + o.period} o={o} compact />)}
            {top.length === 0 && <p className="text-xs text-ink3">No rule thresholds were triggered for this company.</p>}</div>
        </div>
      </section>

      {typeof c.profile.longBusinessSummary === "string" && (
        <section className="card p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">About {c.name}
            {c.profile.fullTimeEmployees ? <Badge>{num(Number(c.profile.fullTimeEmployees))} employees</Badge> : null}
            {c.profile.city ? <Badge>{String(c.profile.city)}</Badge> : null}
          </div>
          <p className="max-w-5xl text-xs leading-relaxed text-ink2">{c.profile.longBusinessSummary}</p>
          <p className="mt-2 text-2xs text-ink3">Company description: Yahoo Finance profile.</p>
        </section>
      )}
    </div>
  );
}
