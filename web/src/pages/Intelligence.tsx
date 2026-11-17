import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Download } from "lucide-react";
import { api, useAsync, useUniverse } from "../lib/data";
import { useSettings } from "../lib/store";
import { ChartCard } from "../charts/ChartCard";
import { base, categoryAxis, legend, tokens, valueAxis } from "../charts/theme";
import { Badge, ErrorState, SectionTitle, Segmented, Select, Skeleton } from "../components/ui";
import { InsightCard } from "./company/InsightsTab";
import { downloadCSV, stamp } from "../lib/download";

type Tone = "all" | "positive" | "negative" | "neutral";

export default function Intelligence() {
  const { data, error } = useAsync(api.insights, []);
  const { data: uni } = useUniverse();
  const s = useSettings();
  const t = tokens();
  const [tone, setTone] = useState<Tone>("all");
  const [cat, setCat] = useState("all");
  const [rule, setRule] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);

  const sectorOf = useMemo(() => new Map(uni?.map((r) => [r.symbol, r.sector]) ?? []), [uni]);
  const all = useMemo(() => (data?.companies ?? []).filter((o) => !s.sectors.length || s.sectors.includes(sectorOf.get(o.symbol) ?? "")), [data, s.sectors, sectorOf]);
  const list = useMemo(() => all
    .filter((o) => (tone === "all" || o.tone === tone) && (cat === "all" || o.category === cat) && (rule === "all" || o.rule === rule))
    .filter((o) => !q || `${o.symbol} ${o.title} ${o.fact}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol)), [all, tone, cat, rule, q]);

  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-[600px]" />;

  const cats = Array.from(new Set(data.companies.map((o) => o.category))).sort();
  const rules = Array.from(new Set(all.map((o) => o.rule))).sort();
  const tones: Exclude<Tone, "all">[] = ["positive", "neutral", "negative"];
  const toneColor = { positive: t.up, neutral: t.ink3, negative: t.down };
  const mix: EChartsOption = {
    ...base(t), legend: legend(t),
    grid: { left: 8, right: 16, top: 32, bottom: 4, containLabel: true },
    tooltip: { ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: valueAxis(t),
    yAxis: categoryAxis(t, cats, { inverse: true }),
    series: tones.map((tn) => ({ type: "bar", stack: "x", name: tn[0].toUpperCase() + tn.slice(1), barWidth: 14,
      data: cats.map((c) => all.filter((o) => o.category === c && o.tone === tn).length),
      itemStyle: { color: toneColor[tn], borderColor: t.surface, borderWidth: 1 } })),
  };

  const exportCsv = () => downloadCSV(`NIFTY50_insights_${stamp()}.csv`,
    ["Symbol", "Sector", "Category", "Tone", "Rule", "Period", "Title", "Fact", "Interpretation", "Evidence", "Threshold"],
    list.map((o) => [o.symbol, sectorOf.get(o.symbol) ?? "", o.category, o.tone, o.rule, o.period, o.title, o.fact, o.interpretation ?? "", o.evidence.map((e) => `${e.label}=${e.value}`).join("; "), o.threshold ?? ""]));

  return (
    <div className="space-y-5 animate-rise">
      <SectionTitle eyebrow="Module F" title="Financial intelligence"
        desc="Every observation below is produced by a deterministic rule applied to computed figures — no language model generates or edits financial insight. Each card shows the verifiable fact, the evidence numbers and the triggering threshold. Interpretations are standard analytical readings, clearly labelled, and are not investment recommendations." />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="card p-5">
          <div className="mb-3 text-sm font-medium">Market-level facts</div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.universe.map((o) => (
              <div key={o.title} className="rounded-xl border border-line bg-raised/40 p-3">
                <div className="mb-1 flex items-center gap-2"><Badge tone={o.tone === "positive" ? "positive" : o.tone === "negative" ? "negative" : "neutral"}>{o.title}</Badge><Badge>Fact</Badge></div>
                <p className="text-xs leading-relaxed text-ink2">{o.fact}</p>
              </div>
            ))}
          </div>
        </div>
        <ChartCard title="Signal mix by category" subtitle={`${all.length} observations across ${new Set(all.map((o) => o.symbol)).size} companies${s.sectors.length ? " · sector filter on" : ""}`}
          option={mix} height={240} filename="insight_mix"
          data={{ headers: ["Category", ...tones], rows: cats.map((c) => [c, ...tones.map((tn) => all.filter((o) => o.category === c && o.tone === tn).length)]) }} />
      </section>

      <section className="card sticky top-[58px] z-30 flex flex-wrap items-center gap-2 p-3">
        <input className="input w-56" placeholder="Search symbol or text…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented value={tone} onChange={setTone} options={[{ value: "all", label: "All" }, { value: "positive", label: "Positive" }, { value: "negative", label: "Negative" }, { value: "neutral", label: "Neutral" }]} />
        <Select label="Category" value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...cats.map((c) => ({ value: c, label: c }))]} />
        <Select label="Rule" value={rule} onChange={setRule} options={[{ value: "all", label: "All rules" }, ...rules.map((r) => ({ value: r, label: r }))]} />
        <span className="ml-auto text-2xs text-ink3">{list.length} matching</span>
        <button className="btn" onClick={exportCsv}><Download size={12} />CSV</button>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {list.slice(0, limit).map((o) => <InsightCard key={`${o.symbol}-${o.rule}-${o.period}`} o={o} compact showSymbol />)}
      </div>
      {list.length > limit && <div className="text-center"><button className="btn" onClick={() => setLimit((l) => l + 40)}>Show more ({list.length - limit} remaining)</button></div>}
      {list.length === 0 && <div className="card p-8 text-center text-xs text-ink3">No observations match these filters.</div>}
    </div>
  );
}
