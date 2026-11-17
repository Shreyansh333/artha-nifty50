import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useSectors } from "../../lib/data";
import { useSettings } from "../../lib/store";
import { ChartCard } from "../../charts/ChartCard";
import { EChart } from "../../charts/EChart";
import { base, categoryAxis, tokens, valueAxis, MONO } from "../../charts/theme";
import { InfoTip, Stat } from "../../components/ui";
import { isNum, money, mult, num, pct, reason } from "../../lib/format";
import type { Company } from "../../lib/types";

export default function ValuationTab({ c }: { c: Company }) {
  const s = useSettings();
  const { data: sectors } = useSectors();
  const t = tokens();
  const v = c.valuation;
  const med = sectors?.find((x) => x.sector === c.sector)?.medians;
  const fys = c.annual.map((p) => p.label);

  const multiples = [
    { id: "pe", label: "P/E", now: v.pe, median: med?.pe_now ?? null, basis: v.pe_basis },
    { id: "pb", label: "P/B", now: v.pb, median: med?.pb_now ?? null, basis: v.pb_basis },
    { id: "ps", label: "P/S", now: v.ps, median: med?.ps ?? null, basis: v.ps_basis },
    ...(c.is_financial ? [] : [{ id: "ev_ebitda", label: "EV/EBITDA", now: v.ev_ebitda, median: med?.ev_ebitda ?? null, basis: v.ev_ebitda_basis }]),
  ];

  const prem = useMemo(() => {
    const rows = multiples.map((m) => ({ ...m, p: isNum(m.now) && isNum(m.median) && m.median > 0 ? m.now / m.median - 1 : null }));
    const option: EChartsOption = {
      ...base(t),
      grid: { left: 8, right: 56, top: 8, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps: any) => { const r = rows[ps[0].dataIndex]; return `<b>${r.label}</b><br/>Company ${mult(r.now)} · sector median ${mult(r.median)}<br/>${isNum(r.p) ? (r.p >= 0 ? "Premium " : "Discount ") + pct(Math.abs(r.p), 0) : "n/a"}`; } },
      xAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (x: number) => pct(x, 0, true) } }),
      yAxis: categoryAxis(t, rows.map((r) => r.label), { inverse: true }),
      series: [{
        type: "bar", barWidth: 14, data: rows.map((r) => ({ value: r.p, itemStyle: { color: (r.p ?? 0) >= 0 ? t.series[1] : t.series[0], borderRadius: (r.p ?? 0) >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
        label: { show: true, position: "right", color: t.ink2, fontFamily: MONO, fontSize: 10, formatter: (p: any) => (isNum(p.value) ? pct(p.value, 0, true) : "n/a") },
      }],
    };
    return { option, data: { headers: ["Multiple", "Company", "Sector median", "Premium / (discount)"], rows: rows.map((r) => [r.label, r.now, r.median, r.p]) } };
  }, [c, med, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const mini = (id: string, label: string) => {
    const ser = c.kpis[id];
    const vals = fys.map((f) => ser?.values[f] ?? null);
    const option: EChartsOption = {
      ...base(t),
      grid: { left: 4, right: 8, top: 10, bottom: 2, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", formatter: (ps: any) => { const k = ps[0].dataIndex; return `${fys[k]}<br/><b>${label} ${isNum(vals[k]) ? mult(vals[k]) : reason(ser?.na[fys[k]])}</b>`; } },
      xAxis: categoryAxis(t, fys, { boundaryGap: false, axisLabel: { color: t.ink3, fontSize: 9 } }),
      yAxis: valueAxis(t, { scale: true, splitNumber: 3, axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 9, formatter: (x: number) => `${x.toFixed(0)}×` } }),
      series: [{ type: "line", data: vals, symbol: "circle", symbolSize: 7, lineStyle: { width: 2, color: t.series[0] }, itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 } }],
    };
    return { option, vals };
  };

  const dupont = useMemo(() => {
    const rows = c.annual.map((p) => {
      const ni = p.values.net_income, rev = p.values.revenue, ta = p.values.total_assets, eq = p.values.equity;
      const nm = isNum(ni) && isNum(rev) && rev > 0 ? ni / rev : null;
      const at = isNum(rev) && isNum(ta) && ta > 0 ? rev / ta : null;
      const em = isNum(ta) && isNum(eq) && eq > 0 ? ta / eq : null;
      return { fy: p.label, nm, at, em, roe: nm !== null && at !== null && em !== null ? nm * at * em : null };
    });
    const series = [
      { name: "Net margin", key: "nm" as const, fmt: (x: number) => pct(x) },
      { name: "Asset turnover", key: "at" as const, fmt: (x: number) => mult(x, 2) },
      { name: "Equity multiplier", key: "em" as const, fmt: (x: number) => mult(x, 2) },
    ];
    return { rows, series };
  }, [c]);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">Current valuation <InfoTip text="Multiples use the latest quoted market cap. Flows use trailing twelve months where four consecutive quarters exist; otherwise the latest reported fiscal year — the basis is printed under every figure. Yahoo's own figures are shown for cross-checking." /></div>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Market cap" value={money(v.market_cap, s.unit)} sub={v.market_cap_source} />
          <Stat label="Enterprise value" value={c.is_financial ? "n/a" : money(v.enterprise_value, s.unit)} sub={c.is_financial ? "Not meaningful for lenders" : "Mkt cap + debt − cash & ST inv."} />
          <Stat label="P/E" value={mult(v.pe)} sub={v.pe_note ?? `${v.pe_basis ?? "n/a"} · Yahoo ${mult(v.yahoo_trailing_pe)}`} />
          <Stat label="P/B" value={mult(v.pb)} sub={`${v.pb_basis ?? "n/a"} · Yahoo ${mult(v.yahoo_price_to_book)}`} />
          <Stat label="P/S" value={mult(v.ps, 2)} sub={v.ps_basis ?? "n/a"} />
          <Stat label="EV/EBITDA" value={c.is_financial ? "n/a" : mult(v.ev_ebitda)} sub={c.is_financial ? "Not meaningful for lenders" : v.ev_ebitda_basis ?? "n/a"} />
          <Stat label="Dividend yield" value={pct(v.dividend_yield, 2)} sub={v.dividend_yield_basis} />
          <Stat label="TTM revenue" value={money(v.revenue_ttm, s.unit)} sub={v.ps_basis ?? ""} />
          <Stat label="TTM net income" value={money(v.net_income_ttm, s.unit)} sub={v.pe_basis ?? ""} />
          <Stat label="TTM EBITDA" value={c.is_financial ? "n/a" : money(v.ebitda_ttm, s.unit)} sub={v.ev_ebitda_basis ?? ""} />
          <Stat label="Book value / share" value={isNum(c.kpis.bvps?.values[fys[fys.length - 1]]) ? `₹${num(c.kpis.bvps.values[fys[fys.length - 1]], 1)}` : "—"} sub={fys[fys.length - 1]} />
          <Stat label="EPS (diluted)" value={(() => { const e = c.kpis.eps?.values; const k = e && Object.keys(e).sort().pop(); return k ? `₹${num(e![k], 2)}` : "—"; })()} sub="Latest FY, as reported" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ChartCard title="Premium / discount to sector median" subtitle={`Company multiple ÷ ${c.sector} median − 1 · ${med?.n ?? "?"} constituents`}
          option={prem.option} data={prem.data} height={220} filename={`${c.symbol}_valuation_vs_sector`}
          footnote={(med?.n ?? 0) < 3 ? "Sector has fewer than 3 constituents — the median is not a robust benchmark." : "Sector median for P/S and EV/EBITDA uses latest fiscal-year values."} />
        <div className="card p-4">
          <div className="mb-1 text-sm font-medium">Fiscal-year-end multiples</div>
          <div className="mb-3 text-2xs text-ink3">Market cap at FY end (un-split-adjusted close × shares) ÷ that year's figures · one panel per multiple</div>
          <div className="grid grid-cols-2 gap-3">
            {[["pe", "P/E"], ["pb", "P/B"], ["ps", "P/S"], ...(c.is_financial ? [] : [["ev_ebitda", "EV/EBITDA"]])].map(([id, l]) => {
              const m = mini(id, l);
              const last = [...m.vals].reverse().find(isNum);
              return (
                <div key={id} className="rounded-xl border border-line/70 p-2">
                  <div className="flex items-baseline justify-between px-1"><span className="text-2xs text-ink3">{l}</span><span className="num text-xs">{mult(last)}</span></div>
                  {m.vals.some(isNum) ? <EChart option={m.option} height={110} /> : <div className="flex h-[110px] items-center justify-center text-2xs text-ink3">No valid periods</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">DuPont decomposition of ROE <InfoTip text="ROE = Net margin × Asset turnover × Equity multiplier (Assets ÷ Equity). Separates profitability, efficiency and leverage as drivers of shareholder returns." /></div>
        <div className="mb-4 text-2xs text-ink3">Annual · period-end balances</div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr><th className="table-head px-3 py-2">Driver</th>{dupont.rows.map((r) => <th key={r.fy} className="table-head px-3 py-2 text-right">{r.fy}</th>)}</tr></thead>
            <tbody>
              {dupont.series.map((x) => (
                <tr key={x.key} className="border-t border-line/50">
                  <td className="px-3 py-2 text-ink2">{x.name}</td>
                  {dupont.rows.map((r) => <td key={r.fy} className="num px-3 py-2 text-right">{isNum(r[x.key]) ? x.fmt(r[x.key]!) : "—"}</td>)}
                </tr>
              ))}
              <tr className="border-t border-line font-medium">
                <td className="px-3 py-2">= ROE</td>
                {dupont.rows.map((r) => <td key={r.fy} className="num px-3 py-2 text-right text-accent">{pct(r.roe)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

