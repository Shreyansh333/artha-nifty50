import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { api, useAsync, useKpiDict, useMeta } from "../lib/data";
import { Badge, SectionTitle, Segmented, Skeleton, cx } from "../components/ui";
import { fmtDate, fmtDateTime, pct } from "../lib/format";

const KEY_FIELDS: [string, string][] = [
  ["revenue", "Revenue"], ["ebitda", "EBITDA"], ["ebit", "EBIT"], ["net_income", "Net inc."], ["eps_diluted", "EPS"],
  ["total_assets", "Assets"], ["equity", "Equity"], ["total_debt", "Debt"], ["current_assets", "Cur. assets"], ["inventory", "Inventory"],
  ["receivables", "Receiv."], ["operating_cf", "CFO"], ["capex", "Capex"], ["dividends_paid", "Dividends"], ["shares_outstanding", "Shares"],
];

const MAPPING: [string, string][] = [
  ["Data Sheet (Screener export, 10 FYs)", "yfinance acquisition → canonical statement schema with Yahoo source row per line (4–5 FYs from Yahoo, accumulating over time)"],
  ["Profit & Loss / Balance Sheet / Cash Flow sheets", "Company → Financial Statements (annual/quarterly, canonical + all Yahoo line items, bridges)"],
  ["KPI Ratios sheet (growth, profitability, liquidity & leverage, efficiency, cash flow, valuation)", "KPI engine — 34 KPIs with formula, inputs, basis, reason codes; Company → Ratios & KPIs; Excel KPI_Calculations as live formulas"],
  ["Pivot Data / Pivot tables (by year & business phase)", "Analytics sector medians, KPI percentile map, Screener; Excel Sector_Analysis with SUMIFS/AVERAGEIFS"],
  ["Dashboard (slicers, 8 charts)", "Global filters (sector, FY, period, basis, units) driving every chart; revenue/profit, margins, cash flow, liquidity, debt vs equity, quarterly and ROE/ROCE/ROA charts"],
  ["Management Insights (5 written answers)", "Intelligence — deterministic rules with evidence; facts separated from interpretations"],
];

export default function Methodology() {
  const { data: meta } = useMeta();
  const { data: dict } = useKpiDict();
  const cov = useAsync(api.coverage, []);
  const val = useAsync(api.validation, []);
  const [q, setQ] = useState("");
  const [vf, setVf] = useState<"warn" | "all">("warn");

  const vSummary = useMemo(() => {
    const v = val.data ?? [];
    const by = new Map<string, { pass: number; warn: number }>();
    v.forEach((x) => {
      const k = x.check.replace(/ FY\d{4}.*$/, "");
      const e = by.get(k) ?? { pass: 0, warn: 0 };
      if (x.status === "pass") e.pass++; else e.warn++;
      by.set(k, e);
    });
    return [...by.entries()];
  }, [val.data]);

  if (!meta || !dict) return <Skeleton className="h-[600px]" />;

  return (
    <div className="space-y-6 animate-rise">
      <SectionTitle eyebrow="Transparency" title="Methodology & data" desc="How the data is acquired, validated and transformed, how every KPI is defined, and exactly what is — and is not — available for each company." />

      <section className="card p-5">
        <div className="mb-4 text-sm font-medium">Architecture</div>
        <div className="grid gap-3 md:grid-cols-6">
          {[
            ["1 · Acquisition", "Python + yfinance. NSE constituent CSV, daily prices (max history), annual & quarterly statements, quote profile, USD/INR FX. Retries with backoff."],
            ["2 · Storage", "Versioned cache in the Git repo (CSV/JSON). Incremental price updates with corporate-action detection; statements merged so history accumulates."],
            ["3 · Calculation", "Canonical statement mapping, FX translation, TTM construction, 34-KPI engine with reason codes, market & risk analytics, rule-based insights."],
            ["4 · Validation", "Balance-sheet and cash-flow identities, P/E vs Yahoo cross-check, share-count consistency, price sanity. Unit tests replicate the reference workbook."],
            ["5 · Serving", "Static JSON API + pre-built Excel workbook, deployed to Cloudflare Pages’ global CDN. No servers, no keys in the browser."],
            ["6 · Presentation", "React + TypeScript + ECharts. In-browser ExcelJS for filtered, comparison and company exports."],
          ].map(([h, d], i) => (
            <div key={h} className="relative rounded-xl border border-line bg-raised/40 p-3">
              <div className="text-xs font-semibold text-accent">{h}</div>
              <p className="mt-1 text-2xs leading-relaxed text-ink2">{d}</p>
              {i < 5 && <ArrowRight size={14} className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-ink3 md:block" />}
            </div>
          ))}
        </div>
        <p className="mt-3 text-2xs text-ink3">A scheduled GitHub Actions workflow runs the pipeline after NSE market close on weekdays, commits refreshed data and redeploys the site.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 text-sm font-medium">Source & disclaimer</div>
          <p className="text-xs leading-relaxed text-ink2">{meta.disclaimer}</p>
          <dl className="mt-4 space-y-2 text-xs">
            {[["Source", meta.source], ["Dataset built", fmtDateTime(meta.generated_at)], ["Latest price date", fmtDate(meta.price_as_of)],
              ["Constituents", `${meta.universe.count} from NSE (${meta.universe.source}), retrieved ${fmtDateTime(meta.universe.retrieved_at)}${meta.universe.stale ? " — STALE snapshot" : ""}`],
              ["Risk-free rate (Sharpe/Sortino)", pct(meta.risk_free_rate) + " p.a. assumption (≈ India 10Y G-Sec)"]].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[150px_1fr] gap-3 border-b border-line/50 pb-2"><dt className="text-ink3">{k}</dt><dd className="text-ink2">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="card p-5">
          <div className="mb-3 text-sm font-medium">Conventions</div>
          <dl className="space-y-2 text-xs">
            {Object.entries(meta.conventions).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-3 border-b border-line/50 pb-2"><dt className="capitalize text-ink3">{k.replace(/_/g, " ")}</dt><dd className="leading-relaxed text-ink2">{v}</dd></div>
            ))}
            <div className="grid grid-cols-[120px_1fr] gap-3"><dt className="text-ink3">Units</dt><dd className="leading-relaxed text-ink2">{meta.units}</dd></div>
          </dl>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <div><div className="text-sm font-medium">KPI dictionary</div><div className="text-2xs text-ink3">{dict.length} KPIs computed by one engine for every company (pipeline/n50/kpis.py)</div></div>
          <input className="input w-60" placeholder="Search KPIs…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-xs">
            <thead><tr>{["KPI", "Group", "Formula", "Basis", "Unit", "Lenders", "Why it matters"].map((h) => <th key={h} className="table-head px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {dict.filter((k) => !q || `${k.name} ${k.group} ${k.formula}`.toLowerCase().includes(q.toLowerCase())).map((k) => (
                <tr key={k.id} className="border-t border-line/50 align-top">
                  <td className="px-3 py-2 font-medium text-ink">{k.name}</td>
                  <td className="px-3 py-2 text-ink3">{k.group}</td>
                  <td className="px-3 py-2 font-mono text-2xs text-ink2">{k.formula}</td>
                  <td className="px-3 py-2 text-2xs text-ink3">{k.basis}</td>
                  <td className="px-3 py-2 text-ink3">{k.unit}</td>
                  <td className="px-3 py-2">{k.financials ? <Badge tone="positive">Yes</Badge> : <Badge>n/a</Badge>}</td>
                  <td className="px-3 py-2 text-2xs leading-relaxed text-ink2">{k.significance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="text-sm font-medium">Data coverage audit</div>
          <div className="text-2xs text-ink3">Annual periods in which each canonical field is available from Yahoo (n / total). Grey = not reported; this is how “missing” is distinguished from a genuine zero.</div>
        </div>
        {cov.data ? (
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full text-2xs">
              <thead><tr>
                {["Company", "FYs", "Quarters", "TTM", "Price history", "KPI completeness", ...KEY_FIELDS.map((f) => f[1])].map((h) => <th key={h} className="table-head whitespace-nowrap px-2 py-2">{h}</th>)}
              </tr></thead>
              <tbody>
                {cov.data.map((c) => {
                  const n = c.annual_periods.length;
                  return (
                    <tr key={c.symbol} className="border-t border-line/50">
                      <td className="whitespace-nowrap px-2 py-1.5"><Link to={`/company/${c.symbol}`} className="font-mono font-semibold hover:text-accent">{c.symbol}</Link>{c.is_financial && <span className="ml-1 text-ink3">(lender)</span>}</td>
                      <td className="num px-2 py-1.5" title={c.annual_periods.join(", ")}>{n}</td>
                      <td className="num px-2 py-1.5" title={c.quarterly_periods.join(", ")}>{c.quarterly_periods.length}</td>
                      <td className="px-2 py-1.5">{c.ttm_available ? <CheckCircle2 size={12} className="text-up" /> : <span className="text-ink3" title="Fewer than 4 consecutive quarters — latest FY used">FY</span>}</td>
                      <td className="num whitespace-nowrap px-2 py-1.5 text-ink3">{c.price_start?.slice(0, 4)}–{c.price_end?.slice(0, 4)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5"><div className="h-1.5 w-16 rounded-full bg-raised"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${(c.kpi_completeness ?? 0) * 100}%` }} /></div><span className="num">{pct(c.kpi_completeness, 0)}</span></div>
                      </td>
                      {KEY_FIELDS.map(([f]) => {
                        const v = c.fields[f] ?? 0;
                        const r = n ? v / n : 0;
                        return <td key={f} className={cx("num px-2 py-1.5 text-center", r === 1 ? "text-up" : r === 0 ? "bg-raised/60 text-ink3" : "text-warn")}>{v}/{n}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Skeleton className="m-4 h-64" />}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <div><div className="text-sm font-medium">Automated validation</div><div className="text-2xs text-ink3">{val.data?.length ?? "…"} checks run on every build</div></div>
          <Segmented value={vf} onChange={setVf} options={[{ value: "warn", label: "Warnings" }, { value: "all", label: "All checks" }]} />
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-4">
          {vSummary.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line p-3">
              <div className="text-2xs text-ink3">{k}</div>
              <div className="mt-1 flex items-center gap-3 text-sm"><span className="flex items-center gap-1 text-up"><CheckCircle2 size={13} />{v.pass}</span>{v.warn > 0 && <span className="flex items-center gap-1 text-warn"><TriangleAlert size={13} />{v.warn}</span>}</div>
            </div>
          ))}
        </div>
        <div className="max-h-72 overflow-auto border-t border-line">
          <table className="w-full text-2xs">
            <tbody>
              {(val.data ?? []).filter((x) => vf === "all" || x.status !== "pass").map((x, i) => (
                <tr key={i} className="border-b border-line/40">
                  <td className="px-3 py-1.5 font-mono font-semibold">{x.symbol}</td>
                  <td className="px-3 py-1.5 text-ink2">{x.check}</td>
                  <td className="px-3 py-1.5">{x.status === "pass" ? <Badge tone="positive">pass</Badge> : <Badge tone="negative">{x.status}</Badge>}</td>
                  <td className="px-3 py-1.5 text-ink3">{x.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line p-4 text-2xs leading-relaxed text-ink3">
          Warnings are investigated rather than suppressed. Typical causes: one-off items in trailing earnings that Yahoo excludes from its own trailing P/E (e.g. HINDUNILVR),
          a company with no four consecutive quarters so the latest fiscal year is used instead of TTM (e.g. NESTLEIND), or a share-count change between the balance-sheet date and today.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 text-sm font-medium">Known limitations</div>
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink2">
            <li>Yahoo exposes only ~4–5 annual and ~5–7 quarterly statement periods; the reference workbook covered 10 years from Screener. History accumulates in the cache with every refresh but cannot be back-filled from yfinance.</li>
            <li>Quarterly statements have gaps (e.g. a missing Sep quarter). TTM is computed only from four consecutive quarters; otherwise the latest fiscal year is used and labelled.</li>
            <li>Banks and insurers lack current assets/liabilities and EBITDA in Yahoo’s schema; those KPIs are marked not applicable rather than estimated.</li>
            <li>Yahoo labels some statements with the wrong currency (HCLTECH labelled USD but reported in INR; INFY genuinely USD). Currency is verified by magnitude before any FX translation.</li>
            <li>Standalone vs consolidated basis cannot be verified via yfinance; Yahoo generally publishes consolidated figures.</li>
            <li>Demerged/renamed entities (e.g. TMPV, ETERNAL) inherit the ticker’s price history from Yahoo, which may span the pre-restructuring entity.</li>
            <li>Prices are end-of-day. Nothing on this site is real-time or investment advice.</li>
          </ul>
        </div>
        <div className="card p-5">
          <div className="mb-3 text-sm font-medium">From the reference workbook to this platform</div>
          <table className="w-full text-xs">
            <tbody>
              {MAPPING.map(([a, b]) => (
                <tr key={a} className="border-b border-line/50 align-top"><td className="w-2/5 py-2 pr-3 text-ink">{a}</td><td className="py-2 text-ink2">{b}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-2xs leading-relaxed text-ink3">Deliberate departures: missing data is never coerced to 0 (the reference used IFERROR(…,0)); gross margin is withheld when cost of revenue is not reported (the reference showed 100% for a telecom); P/E uses aggregate market cap ÷ net income so share-count restatements cannot distort it.</p>
        </div>
      </section>
    </div>
  );
}
