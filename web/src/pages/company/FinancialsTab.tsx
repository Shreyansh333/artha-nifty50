import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Download } from "lucide-react";
import { useSettings } from "../../lib/store";
import { ChartCard } from "../../charts/ChartCard";
import { base, categoryAxis, legend, tokens, valueAxis, MONO } from "../../charts/theme";
import { InfoTip, Segmented, Select, cx } from "../../components/ui";
import { isNum, money, moneyRaw, num, pct, UNITS } from "../../lib/format";
import { downloadCSV, stamp } from "../../lib/download";
import type { Company, Statement } from "../../lib/types";

type Kind = "income" | "balance" | "cashflow";
const KIND_LABEL: Record<Kind, string> = { income: "Income Statement", balance: "Balance Sheet", cashflow: "Cash Flow" };
const DEFAULTS: Record<Kind, string[]> = {
  income: ["revenue", "ebitda", "net_income"],
  balance: ["total_assets", "equity", "total_debt"],
  cashflow: ["operating_cf", "capex", "free_cash_flow"],
};

export default function FinancialsTab({ c }: { c: Company }) {
  const s = useSettings();
  const [kind, setKind] = useState<Kind>("income");
  const st: Statement = c.statements[s.basis][kind];
  const available = st.rows.map((r) => r.key);
  const [sel, setSel] = useState<string[]>(DEFAULTS.income);
  const [raw, setRaw] = useState(false);
  const [period, setPeriod] = useState<string>("");
  const t = tokens();

  useEffect(() => {
    setSel(DEFAULTS[kind].filter((k) => available.includes(k)).length ? DEFAULTS[kind].filter((k) => available.includes(k)) : available.slice(0, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, s.basis, c.symbol]);
  useEffect(() => setPeriod(st.periods[st.periods.length - 1] ?? ""), [st]);

  const val = (key: string, p: number) => st.rows.find((r) => r.key === key)?.values[p] ?? null;
  const pIdx = Math.max(0, st.periods.indexOf(period));

  // -------- trend chart
  const trend = useMemo(() => {
    const rows = st.rows.filter((r) => sel.includes(r.key));
    const option: EChartsOption = {
      ...base(t), legend: legend(t),
      grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        valueFormatter: (v: any) => (isNum(v) ? `${num(v, 0)} ${UNITS[s.unit].short}` : "n/a (unavailable)") },
      xAxis: categoryAxis(t, st.periods),
      yAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => num(v) } }),
      series: rows.filter((r) => r.monetary).map((r) => ({ type: "bar", name: r.label, data: r.values.map((v) => moneyRaw(v, s.unit)), barMaxWidth: 22, itemStyle: { borderRadius: 3 } })),
    };
    const data = { headers: ["Period", ...rows.map((r) => `${r.label} (${r.monetary ? UNITS[s.unit].short : "as reported"})`)],
      rows: st.periods.map((p, k) => [p, ...rows.map((r) => (r.monetary ? moneyRaw(r.values[k], s.unit) : r.values[k]))]) };
    return { option, data };
  }, [st, sel, s.unit, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------- bridge (waterfall) for the selected period
  const bridge = useMemo(() => {
    type Step = { name: string; v: number | null; total?: boolean };
    let steps: Step[] = [];
    let note = "";
    const g = (k: string) => val(k, pIdx);
    if (kind === "income") {
      const rev = g("revenue"), ebitda = g("ebitda"), ebit = g("ebit"), pbt = g("pretax_income"), ni = g("net_income");
      if (!c.is_financial && [rev, ebitda, ebit, pbt, ni].every(isNum)) {
        steps = [{ name: "Revenue", v: rev, total: true }, { name: "Operating costs", v: ebitda! - rev! }, { name: "EBITDA", v: ebitda, total: true },
          { name: "D&A", v: ebit! - ebitda! }, { name: "EBIT", v: ebit, total: true }, { name: "Interest & other", v: pbt! - ebit! },
          { name: "PBT", v: pbt, total: true }, { name: "Tax & minority", v: ni! - pbt! }, { name: "Net income", v: ni, total: true }];
      } else if ([rev, pbt, ni].every(isNum)) {
        steps = [{ name: "Revenue", v: rev, total: true }, { name: "Expenses & provisions", v: pbt! - rev! }, { name: "PBT", v: pbt, total: true },
          { name: "Tax & minority", v: ni! - pbt! }, { name: "Net income", v: ni, total: true }];
      }
      note = "Intermediate steps are reconciling differences between reported subtotals, so the bridge always ties to reported net income.";
    } else if (kind === "cashflow") {
      const o = g("operating_cf"), i = g("investing_cf"), f = g("financing_cf"), ch = g("change_in_cash");
      if ([o, i, f].every(isNum)) {
        steps = [{ name: "Operating", v: o }, { name: "Investing", v: i }, { name: "Financing", v: f }];
        const sum = o! + i! + f!;
        if (isNum(ch) && Math.abs(ch - sum) > Math.abs(sum) * 0.001 + 1) steps.push({ name: "FX & other", v: ch - sum });
        steps.push({ name: "Net change in cash", v: isNum(ch) ? ch : sum, total: true });
      }
      note = "CFO + CFI + CFF (+ FX/other reconciling item) = net change in cash, as reported.";
    } else {
      const eq = g("equity"), debt = g("total_debt"), tl = g("total_liabilities"), mi = g("minority_interest"), ta = g("total_assets");
      if ([eq, tl, ta].every(isNum)) {
        steps = [{ name: "Shareholders' equity", v: eq }, ...(isNum(mi) && mi !== 0 ? [{ name: "Minority interest", v: mi }] : []),
          ...(isNum(debt) ? [{ name: "Debt", v: debt }, { name: "Other liabilities", v: tl! - debt! }] : [{ name: "Liabilities", v: tl }])];
        const sum = steps.reduce((a, x) => a + (x.v ?? 0), 0);
        if (Math.abs(ta! - sum) > ta! * 0.001) steps.push({ name: "Unreconciled", v: ta! - sum });
        steps.push({ name: "Total assets", v: ta, total: true });
      }
      note = "Funding structure: equity + minority + debt + other liabilities = total assets.";
    }
    let run = 0;
    const helper: (number | string)[] = [], up: (number | string)[] = [], down: (number | string)[] = [], tot: (number | string)[] = [];
    steps.forEach((x) => {
      const v = moneyRaw(x.v, s.unit) ?? 0;
      if (x.total) { helper.push("-"); tot.push(v); up.push("-"); down.push("-"); run = v; return; }
      const start = run, end = run + v;
      helper.push(Math.min(start, end)); tot.push("-");
      if (v >= 0) { up.push(v); down.push("-"); } else { down.push(-v); up.push("-"); }
      run = end;
    });
    const option: EChartsOption = {
      ...base(t),
      grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps: any) => { const k = ps[0].dataIndex; return `<b>${steps[k].name}</b><br/>${money(steps[k].v, s.unit)}`; } },
      xAxis: categoryAxis(t, steps.map((x) => x.name), { axisLabel: { color: t.ink3, fontSize: 10, interval: 0, rotate: steps.length > 6 ? 25 : 0 } }),
      yAxis: valueAxis(t, { axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10, formatter: (v: number) => num(v) } }),
      series: [
        { type: "bar", stack: "w", data: helper, itemStyle: { color: "transparent" }, emphasis: { disabled: true }, tooltip: { show: false } },
        { type: "bar", stack: "w", name: "Increase", data: up, itemStyle: { color: t.up, borderRadius: 3 }, barMaxWidth: 40 },
        { type: "bar", stack: "w", name: "Decrease", data: down, itemStyle: { color: t.down, borderRadius: 3 }, barMaxWidth: 40 },
        { type: "bar", stack: "w", name: "Subtotal", data: tot, itemStyle: { color: t.series[0], borderRadius: 3 }, barMaxWidth: 40 },
      ] as any,
    };
    return { option, steps, note, data: { headers: ["Step", `Amount (${UNITS[s.unit].short})`], rows: steps.map((x) => [x.name, moneyRaw(x.v, s.unit)]) } };
  }, [kind, pIdx, st, s.unit, c.is_financial, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevLabel = s.basis === "annual" ? "vs prior FY" : "QoQ";
  const lastI = st.periods.length - 1;

  const exportTable = () => {
    const headers = ["Line item", "Yahoo source row", ...st.periods];
    const rows = st.rows.map((r) => [r.label, r.source ?? "", ...r.values.map((v) => (r.monetary ? moneyRaw(v, s.unit) : v))]);
    downloadCSV(`${c.symbol}_${kind}_${s.basis}_${UNITS[s.unit].short.replace(/\W/g, "")}_${stamp()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="md" value={kind} onChange={setKind} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <Segmented size="md" value={s.basis} onChange={(v) => s.set({ basis: v })} options={[{ value: "annual", label: "Annual" }, { value: "quarterly", label: "Quarterly" }]} />
        <span className="text-2xs text-ink3">{st.periods.length} {s.basis} periods available from Yahoo · values in {UNITS[s.unit].label}</span>
      </div>

      {st.periods.length === 0 ? (
        <div className="card p-8 text-center text-xs text-ink3">Yahoo provides no {s.basis} {KIND_LABEL[kind].toLowerCase()} for {c.symbol}.</div>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <ChartCard title={`${KIND_LABEL[kind]} trend`} subtitle="Select line items to plot · bars absent = unavailable, not zero"
              option={trend.option} data={trend.data} height={300} filename={`${c.symbol}_${kind}_trend`}
              controls={
                <div className="flex flex-wrap gap-1.5">
                  {st.rows.filter((r) => r.monetary).map((r) => (
                    <button key={r.key} onClick={() => setSel((x) => (x.includes(r.key) ? x.filter((k) => k !== r.key) : [...x, r.key].slice(-6)))}
                      className={cx("chip transition", sel.includes(r.key) ? "!border-accent/60 !bg-accent/10 !text-ink" : "hover:text-ink")}>{r.label}</button>
                  ))}
                </div>
              } />
            <ChartCard title={kind === "income" ? "Profit bridge" : kind === "cashflow" ? "Cash-flow bridge" : "Funding structure"} subtitle={bridge.note}
              option={bridge.option} data={bridge.data} height={300} filename={`${c.symbol}_${kind}_bridge_${period}`}
              empty={bridge.steps.length === 0 ? "Required subtotals are unavailable for this period" : undefined}
              controls={<Select label="Period" value={period} onChange={setPeriod} options={st.periods.map((p) => ({ value: p, label: p }))} />} />
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
              <div className="text-sm font-medium">{KIND_LABEL[kind]} · {s.basis} <InfoTip text="Canonical view maps Yahoo line items to a consistent schema (source row shown on hover). 'All Yahoo items' shows every line Yahoo returned, unmodified apart from unit scaling and FX translation where noted." /></div>
              <div className="flex gap-2">
                <Segmented value={raw ? "raw" : "canon"} onChange={(v) => setRaw(v === "raw")} options={[{ value: "canon", label: "Canonical" }, { value: "raw", label: "All Yahoo items" }]} />
                <button className="btn" onClick={exportTable}><Download size={12} />CSV</button>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              {!raw ? (
                <table className="w-full text-xs">
                  <thead><tr>
                    <th className="table-head px-4 py-2">Line item</th>
                    {st.periods.map((p) => <th key={p} className="table-head px-3 py-2 text-right">{p}</th>)}
                    {lastI > 0 && <th className="table-head px-3 py-2 text-right">Δ {prevLabel}</th>}
                  </tr></thead>
                  <tbody>
                    {st.rows.map((r) => {
                      const a = r.values[lastI - 1], b = r.values[lastI];
                      const ch = isNum(a) && isNum(b) && a !== 0 ? (b - a) / Math.abs(a) : null;
                      const strong = ["revenue", "ebitda", "net_income", "total_assets", "equity", "operating_cf", "free_cash_flow"].includes(r.key);
                      return (
                        <tr key={r.key} className="border-t border-line/50 hover:bg-raised/40">
                          <td className={cx("px-4 py-1.5", strong ? "font-medium text-ink" : "text-ink2")} title={r.source ? `Yahoo row: ${r.source}` : undefined}>{r.label}</td>
                          {r.values.map((v, k) => (
                            <td key={k} className={cx("num px-3 py-1.5 text-right", isNum(v) && v < 0 ? "text-down" : "text-ink")}>
                              {isNum(v) ? (r.monetary ? money(v, s.unit, { suffix: false }) : num(v, r.key.startsWith("eps") ? 2 : 0)) : <span className="text-ink3" title="Unavailable from source">—</span>}
                            </td>
                          ))}
                          {lastI > 0 && <td className={cx("num px-3 py-1.5 text-right", isNum(ch) ? (ch >= 0 ? "text-up" : "text-down") : "text-ink3")}>{pct(ch, 1, true)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <RawTable c={c} kind={kind} />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function RawTable({ c, kind }: { c: Company; kind: Kind }) {
  const s = useSettings();
  const t = c.raw_statements[`${kind}_${s.basis}`];
  if (!t || !t.rows.length) return <div className="p-6 text-xs text-ink3">No raw data.</div>;
  const isCount = (item: string) => /shares|share issued|tax rate|eps/i.test(item);
  return (
    <table className="w-full text-xs">
      <thead><tr><th className="table-head px-4 py-2">Yahoo line item</th>{t.periods.map((p) => <th key={p} className="table-head px-3 py-2 text-right">{p}</th>)}</tr></thead>
      <tbody>
        {t.rows.map((r) => (
          <tr key={r.item} className="border-t border-line/50 hover:bg-raised/40">
            <td className="px-4 py-1.5 text-ink2">{r.item}</td>
            {r.values.map((v, k) => (
              <td key={k} className="num px-3 py-1.5 text-right">{isNum(v) ? (isCount(r.item) ? num(v, Math.abs(v) < 100 ? 2 : 0) : money(v, s.unit, { suffix: false })) : <span className="text-ink3">—</span>}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
