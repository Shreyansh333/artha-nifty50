import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { ArrowRight, Database, TrendingDown, TrendingUp } from "lucide-react";
import { api, useAsync, useMeta, useSectors, useUniverse } from "../lib/data";
import { useSettings } from "../lib/store";
import { ChartCard } from "../charts/ChartCard";
import { EChart } from "../charts/EChart";
import { base, categoryAxis, divergingColor, textOn, timeAxis, tokens, valueAxis, MONO } from "../charts/theme";
import { Badge, Delta, ErrorState, InfoTip, Segmented, Skeleton, Stat, cx } from "../components/ui";
import { ago, fmtDate, fmtDateTime, isNum, money, mult, num, pct, price, shortName } from "../lib/format";
import { filterBySector, median } from "../lib/metrics";
import { periodReturn, rangeIndices, thin, rangeFor } from "../lib/series";
import type { Returns, UniverseRow } from "../lib/types";

type Win = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "3Y";
const WINS: Win[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "3Y"];
const CAP: Record<Win, number> = { "1D": 0.03, "1W": 0.05, "1M": 0.08, "3M": 0.15, YTD: 0.25, "1Y": 0.3, "3Y": 0.6 };

export default function Overview() {
  const uni = useUniverse();
  const sectors = useSectors();
  const { data: meta } = useMeta();
  const idx = useAsync(api.index, []);
  const idxPx = useAsync(() => api.prices("NIFTY50"), []);
  const s = useSettings();
  const [win, setWin] = useState<Win>("1D");
  const nav = useNavigate();
  const t = tokens();

  const rows = useMemo(() => filterBySector(uni.data ?? [], s.sectors), [uni.data, s.sectors]);
  const range = rangeFor(idxPx.data, s.range, s.from, s.to);

  if (uni.error) return <ErrorState error={uni.error} />;
  if (!uni.data || !idx.data) return <OverviewSkeleton />;

  const ret = (r: UniverseRow) => (r.returns as Returns)[win] ?? null;
  const ranked = rows.filter((r) => isNum(ret(r))).sort((a, b) => ret(b)! - ret(a)!);
  const gainers = ranked.slice(0, 6);
  const losers = ranked.slice(-6).reverse();
  const adv = rows.filter((r) => (r.returns["1D"] ?? 0) > 0).length;
  const dec = rows.filter((r) => (r.returns["1D"] ?? 0) < 0).length;
  const above200 = rows.filter((r) => r.snapshot.price && r.snapshot.ma200 && r.snapshot.price > r.snapshot.ma200).length;
  const totalCap = rows.reduce((a, r) => a + (r.valuation.market_cap ?? 0), 0);
  const medPE = median(rows.map((r) => r.valuation.pe));
  const ix = idx.data;

  // ---------------- index chart
  let idxOption: EChartsOption = {};
  let idxData;
  let rangeRet: number | null = null;
  if (idxPx.data && range) {
    const [i, j] = rangeIndices(idxPx.data, range[0], range[1]);
    const pts = thin(idxPx.data.d.slice(i, j + 1).map((d, k) => [d, idxPx.data!.c[i + k]] as [string, number | null]));
    rangeRet = periodReturn(idxPx.data.c, i, j);
    const col = (rangeRet ?? 0) >= 0 ? t.up : t.down;
    idxOption = {
      ...base(t),
      grid: { left: 8, right: 12, top: 12, bottom: 8, containLabel: true },
      tooltip: { ...base(t).tooltip as object, trigger: "axis", valueFormatter: (v) => num(v as number, 2) },
      xAxis: timeAxis(t),
      yAxis: valueAxis(t, { scale: true, axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => num(v) } }),
      dataZoom: [{ type: "inside" }],
      series: [{
        type: "line", name: "NIFTY 50", data: pts, showSymbol: false, lineStyle: { width: 2, color: col },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: col.replace("rgb", "rgba").replace(")", ",0.22)") }, { offset: 1, color: "rgba(0,0,0,0)" }] } },
      }],
    };
    idxData = { headers: ["Date", "NIFTY 50 close"], rows: pts.map(([d, v]) => [d, v]) };
  }

  // ---------------- heatmap (treemap grouped by sector)
  const bySector = new Map<string, UniverseRow[]>();
  rows.forEach((r) => bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]));
  const tree: any[] = [...bySector.entries()].map(([sec, rs]) => ({
    name: sec,
    value: rs.reduce((a, r) => a + (r.valuation.market_cap ?? 0), 0),
    children: rs.filter((r) => r.valuation.market_cap).map((r) => {
      const c = divergingColor(t, ret(r), CAP[win]);
      return {
        name: r.symbol, value: r.valuation.market_cap, ret: ret(r), full: r.name, price: r.snapshot.price,
        itemStyle: { color: c }, label: { color: textOn(c) },
      };
    }),
  }));
  const heatOption: EChartsOption = {
    ...base(t),
    tooltip: {
      ...(base(t).tooltip as object),
      formatter: (p: any) => p.data?.full
        ? `<b>${p.data.name}</b> · ${shortName(p.data.full)}<br/>Return ${win}: <b>${pct(p.data.ret, 2, true)}</b><br/>Price ${price(p.data.price)}<br/>Market cap ${money(p.data.value, s.unit)}`
        : `<b>${p.name}</b><br/>Market cap ${money(p.value, s.unit)}`,
    },
    series: [{
      type: "treemap", data: tree, roam: false, nodeClick: false, breadcrumb: { show: false }, width: "100%", height: "100%",
      top: 0, left: 0, right: 0, bottom: 0, squareRatio: 0.9,
      upperLabel: { show: true, height: 18, color: t.ink2, fontSize: 10, fontWeight: 500, backgroundColor: "transparent", formatter: "{b}" },
      label: {
        show: true, fontFamily: MONO, fontSize: 11, lineHeight: 14,
        formatter: (p: any) => `{s|${p.name}}\n${pct(p.data.ret, 1, true)}`, rich: { s: { fontWeight: 600, fontSize: 11 } },
      },
      itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2 },
      levels: [
        { itemStyle: { borderColor: t.surface, borderWidth: 0, gapWidth: 3 }, upperLabel: { show: false } },
        { itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2 }, upperLabel: { show: true, formatter: "{b}" } },
        { itemStyle: { borderColor: t.surface, borderWidth: 1, gapWidth: 1 }, upperLabel: { show: false } },
      ],
    }],
  };
  const heatData = { headers: ["Symbol", "Company", "Sector", `Return ${win}`, "Market cap (INR)"], rows: rows.map((r) => [r.symbol, r.name, r.sector, ret(r), r.valuation.market_cap]) };

  // ---------------- sector performance
  const secList = (sectors.data ?? []).filter((x) => !s.sectors.length || s.sectors.includes(x.sector));
  const secPerf = secList.map((x) => ({ name: x.sector, v: x.weighted_returns[win === "3Y" ? "1Y" : win] ?? null, n: x.count })).filter((x) => isNum(x.v)).sort((a, b) => a.v! - b.v!);
  const secOption: EChartsOption = {
    ...base(t),
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => pct(v as number, 2, true) },
    xAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => pct(v, 0) } }),
    yAxis: categoryAxis(t, secPerf.map((x) => x.name), { axisLabel: { color: t.ink2, fontSize: 10.5, width: 150, overflow: "truncate" } }),
    series: [{
      type: "bar", barWidth: 12, data: secPerf.map((x) => ({ value: x.v, itemStyle: { color: x.v! >= 0 ? t.up : t.down, borderRadius: x.v! >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
      label: { show: true, position: "right", formatter: (p: any) => pct(p.value, 1, true), color: t.ink2, fontFamily: MONO, fontSize: 10 },
    }],
  };

  // ---------------- market-cap distribution by sector
  const capSec = [...secList].sort((a, b) => a.market_cap - b.market_cap);
  const capTotal = capSec.reduce((a, x) => a + x.market_cap, 0);
  const capOption: EChartsOption = {
    ...base(t),
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p: any) => `${p[0].name}<br/><b>${money(p[0].value, s.unit)}</b> · ${pct(p[0].value / capTotal, 1)} of selection` },
    xAxis: valueAxis(t, { axisLabel: { show: false } }),
    yAxis: categoryAxis(t, capSec.map((x) => x.sector), { axisLabel: { color: t.ink2, fontSize: 10.5, width: 150, overflow: "truncate" } }),
    series: [{
      type: "bar", barWidth: 12, data: capSec.map((x) => x.market_cap), itemStyle: { color: t.series[0], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: (p: any) => pct(p.value / capTotal, 1), color: t.ink2, fontFamily: MONO, fontSize: 10 },
    }],
  };

  return (
    <div className="space-y-6 animate-rise">
      {/* hero */}
      <section className="card relative overflow-hidden p-5 lg:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <div className="flex flex-col justify-between gap-5">
            <div>
              <div className="eyebrow flex items-center gap-2">NSE · NIFTY 50 Index <Badge>EOD · {fmtDate(ix.snapshot.last_date)}</Badge></div>
              <div className="mt-3 font-display text-6xl leading-none tracking-tight">{num(ix.snapshot.price, 2)}</div>
              <div className="mt-2 flex items-center gap-3 text-sm">
                <span className={cx("num", (ix.snapshot.change ?? 0) >= 0 ? "text-up" : "text-down")}>{(ix.snapshot.change ?? 0) >= 0 ? "+" : ""}{num(ix.snapshot.change, 2)}</span>
                <Delta v={ix.returns["1D"]} />
                <span className="text-2xs text-ink3">vs prior close</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {(["1M", "YTD", "1Y"] as const).map((w) => <Stat key={w} label={w} value={<Delta v={ix.returns[w]} dp={1} />} />)}
              <Stat label="3Y CAGR" value={pct(ix.cagr["3Y"], 1, true)} tone={(ix.cagr["3Y"] ?? 0) >= 0 ? "text-up" : "text-down"} />
              <Stat label="5Y CAGR" value={pct(ix.cagr["5Y"], 1, true)} tone={(ix.cagr["5Y"] ?? 0) >= 0 ? "text-up" : "text-down"} />
              <Stat label="Vol. 1Y" value={pct(ix.risk.vol_1Y, 1)} info="Annualised standard deviation of daily log returns over the last year." />
            </div>
            <p className="text-2xs text-ink3">{ix.basis}. 52-week range {num(ix.snapshot.low_52w)} – {num(ix.snapshot.high_52w)}.</p>
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-2xs text-ink3">
              <span>Range {range ? `${fmtDate(range[0])} → ${fmtDate(range[1])}` : ""} · change the period in the toolbar</span>
              {rangeRet !== null && <span>Period return <Delta v={rangeRet} /></span>}
            </div>
            {idxPx.data ? <EChart option={idxOption} height={250} /> : <Skeleton className="h-[250px]" />}
            {idxData && <span className="sr-only">{idxData.rows.length} data points</span>}
          </div>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Companies covered", v: `${rows.length}`, sub: s.sectors.length ? `of ${uni.data.length} · sector filter on` : `NSE constituents · ${meta?.universe.retrieved_at ? fmtDate(meta.universe.retrieved_at) : ""}` },
          { l: "Combined market cap", v: money(totalCap, s.unit), sub: "Sum of constituent market caps" },
          { l: "Breadth today", v: <span><span className="text-up">{adv}▲</span> <span className="text-ink3">/</span> <span className="text-down">{dec}▼</span></span>, sub: "Advancers / decliners, last session" },
          { l: "Above 200-DMA", v: `${above200} / ${rows.length}`, sub: pct(rows.length ? above200 / rows.length : null, 0) + " in long-term uptrend" },
          { l: "Median P/E", v: mult(medPE), sub: "TTM where available" },
          { l: "Data freshness", v: meta ? ago(meta.generated_at) : "—", sub: meta ? `Prices to ${fmtDate(meta.price_as_of)}` : "" },
        ].map((k) => (
          <div key={k.l} className="card p-4"><Stat label={k.l} value={k.v} sub={k.sub} /></div>
        ))}
      </section>

      {/* heatmap + movers */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ChartCard title="Market heatmap" subtitle={`Tile area = market cap · colour = ${win} total return · grouped by NSE sector · click a tile to open the company`}
          info="Treemap sized by current market capitalisation. Colour uses a diverging scale (red ↔ neutral ↔ green) capped at ±the shown range; every tile also prints its signed return so colour is never the only cue."
          option={heatOption} data={heatData} height={600} filename={`heatmap_${win}`}
          controls={<><Segmented value={win} onChange={setWin} options={WINS.map((w) => ({ value: w, label: w }))} label="Return window" /><Legend cap={CAP[win]} /></>}
          onEvents={{ click: (p: any) => p.data?.full && nav(`/company/${encodeURIComponent(p.data.name)}`) }} />
        <div className="grid gap-4">
          <Movers title="Top gainers" icon={<TrendingUp size={14} className="text-up" />} rows={gainers} ret={ret} win={win} />
          <Movers title="Top losers" icon={<TrendingDown size={14} className="text-down" />} rows={losers} ret={ret} win={win} />
        </div>
      </section>

      {/* sectors */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={`Sector performance · ${win === "3Y" ? "1Y" : win}`} subtitle="Market-cap-weighted total return of constituents in each sector · click a bar to filter"
          option={secOption} height={Math.max(260, secPerf.length * 24)} filename="sector_performance"
          data={{ headers: ["Sector", "Cap-weighted return", "Constituents"], rows: secPerf.map((x) => [x.name, x.v, x.n]) }}
          onEvents={{ click: (p: any) => s.toggleSector(p.name) }}
          footnote={win === "3Y" ? "Sector aggregates are pre-computed up to 1Y; 3Y shows 1Y." : undefined} />
        <ChartCard title="Market-cap distribution by sector" subtitle={`Share of combined market cap (${money(capTotal, s.unit)})`}
          option={capOption} height={Math.max(260, capSec.length * 24)} filename="market_cap_by_sector"
          data={{ headers: ["Sector", "Market cap (INR)", "Share"], rows: capSec.map((x) => [x.sector, x.market_cap, x.market_cap / capTotal]) }} />
      </section>

      <Leaderboard rows={rows} />

      {/* insights + freshness */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <UniverseInsights />
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Database size={14} className="text-accent" /> Data freshness & provenance</div>
          {meta && (
            <dl className="space-y-2 text-xs">
              {[
                ["Dataset generated", fmtDateTime(meta.generated_at)],
                ["Latest price date", fmtDate(meta.price_as_of)],
                ["Oldest latest-price", fmtDate(meta.price_as_of_min)],
                ["Constituents source", "NSE ind_nifty50list.csv"],
                ["Constituents retrieved", fmtDateTime(meta.universe.retrieved_at)],
                ["Fetch failures", `${Object.keys(meta.fetch.failures ?? {}).length}`],
                ["Market data source", "Yahoo Finance (yfinance)"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2"><dt className="text-ink3">{k}</dt><dd className="num text-right text-ink2">{v}</dd></div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-2xs leading-relaxed text-ink3">{meta?.disclaimer}</p>
          <Link to="/methodology" className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline">Coverage audit & methodology <ArrowRight size={12} /></Link>
        </div>
      </section>
    </div>
  );
}

function Legend({ cap }: { cap: number }) {
  return (
    <div className="ml-auto flex items-center gap-2 text-2xs text-ink3">
      <span className="num">{pct(-cap, 0)}</span>
      <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg,var(--div-neg),var(--div-mid),var(--div-pos))" }} />
      <span className="num">{pct(cap, 0, true)}</span>
    </div>
  );
}

function Movers({ title, icon, rows, ret, win }: { title: string; icon: React.ReactNode; rows: UniverseRow[]; ret: (r: UniverseRow) => number | null; win: string }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div><span className="eyebrow">{win}</span></div>
      <ul>
        {rows.map((r) => (
          <li key={r.symbol}>
            <Link to={`/company/${encodeURIComponent(r.symbol)}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-raised">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-semibold">{r.symbol}</div>
                <div className="truncate text-2xs text-ink3">{shortName(r.name)}</div>
              </div>
              <div className="text-right"><div className="num text-xs">{price(r.snapshot.price)}</div><Delta v={ret(r)} dp={2} className="text-2xs" /></div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="p-3 text-xs text-ink3">No companies in the current filter.</li>}
      </ul>
    </div>
  );
}

function Leaderboard({ rows }: { rows: UniverseRow[] }) {
  const [h, setH] = useState<"1Y" | "3Y" | "5Y" | "10Y">("3Y");
  const get = (r: UniverseRow) => (h === "1Y" ? r.returns["1Y"] : r.cagr[h]) ?? null;
  const ranked = rows.filter((r) => isNum(get(r))).sort((a, b) => get(b)! - get(a)!);
  const missing = rows.length - ranked.length;
  const best = ranked.slice(0, 5), worst = ranked.slice(-5).reverse();
  const Item = ({ r, i }: { r: UniverseRow; i: number }) => (
    <Link to={`/company/${encodeURIComponent(r.symbol)}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised">
      <span className="num w-5 text-2xs text-ink3">{i + 1}</span>
      <span className="w-24 font-mono text-xs font-semibold">{r.symbol}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink2">{shortName(r.name)}</span>
      <Delta v={get(r)} dp={1} className="text-xs" />
    </Link>
  );
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Performance leaderboard <InfoTip text="1Y = total return. 3Y/5Y/10Y = annualised total return (CAGR) from Yahoo adjusted closes. Companies listed for less than the horizon are excluded rather than estimated." /></div>
          <div className="text-2xs text-ink3">{h === "1Y" ? "1-year total return" : `${h} CAGR`} · {ranked.length} ranked{missing ? ` · ${missing} excluded (insufficient listing history)` : ""}</div>
        </div>
        <Segmented value={h} onChange={setH} options={(["1Y", "3Y", "5Y", "10Y"] as const).map((x) => ({ value: x, label: x }))} />
      </div>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div><div className="eyebrow mb-1 px-2 text-up">Best</div>{best.map((r, i) => <Item key={r.symbol} r={r} i={i} />)}</div>
        <div><div className="eyebrow mb-1 px-2 text-down">Worst</div>{worst.map((r, i) => <Item key={r.symbol} r={r} i={ranked.length - 1 - i} />)}</div>
      </div>
    </section>
  );
}

function UniverseInsights() {
  const { data } = useAsync(api.insights, []);
  return (
    <div className="card p-5">
      <div className="mb-1 text-sm font-medium">Market intelligence</div>
      <div className="mb-4 text-2xs text-ink3">Rule-based observations computed from the dataset · <Link className="text-accent hover:underline" to="/intelligence">see all company insights →</Link></div>
      <div className="grid gap-3 md:grid-cols-2">
        {data?.universe.map((o) => (
          <div key={o.title} className="rounded-xl border border-line bg-raised/40 p-3">
            <div className="mb-1 flex items-center gap-2"><Badge tone={o.tone === "positive" ? "positive" : o.tone === "negative" ? "negative" : "neutral"}>{o.title}</Badge><Badge>Fact</Badge></div>
            <p className="text-xs leading-relaxed text-ink2">{o.fact}</p>
          </div>
        )) ?? <Skeleton className="h-40" />}
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-72" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <Skeleton className="h-[520px]" />
    </div>
  );
}
