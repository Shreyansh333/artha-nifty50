import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { AlertTriangle, ExternalLink, FileSpreadsheet, GitCompare, Loader2 } from "lucide-react";
import { useCompany, useUniverse } from "../lib/data";
import { useSettings, MAX_COMPARE } from "../lib/store";
import { Badge, Delta, ErrorState, Skeleton, cx } from "../components/ui";
import { fmtDate, money, num, price, shortName } from "../lib/format";
import type { Company } from "../lib/types";

const OverviewTab = lazy(() => import("./company/OverviewTab"));
const FinancialsTab = lazy(() => import("./company/FinancialsTab"));
const RatiosTab = lazy(() => import("./company/RatiosTab"));
const ValuationTab = lazy(() => import("./company/ValuationTab"));
const RiskTab = lazy(() => import("./company/RiskTab"));
const InsightsTab = lazy(() => import("./company/InsightsTab"));

const TABS = [
  { id: "", label: "Overview" },
  { id: "financials", label: "Financial Statements" },
  { id: "ratios", label: "Ratios & KPIs" },
  { id: "valuation", label: "Valuation" },
  { id: "risk", label: "Risk & Returns" },
  { id: "insights", label: "Intelligence" },
];

export default function CompanyPage() {
  const { symbol = "RELIANCE", tab = "" } = useParams();
  const { data: c, error, loading } = useCompany(symbol);
  const { data: uni } = useUniverse();
  const { pushRecent } = useSettings();

  useEffect(() => {
    if (c) pushRecent(c.symbol);
  }, [c, pushRecent]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [symbol]);

  if (error) {
    const known = uni?.some((r) => r.symbol === symbol);
    return known === false ? (
      <div className="card p-8 text-sm">“{symbol}” is not a current NIFTY 50 constituent. <Link className="text-accent" to="/">Back to overview</Link></div>
    ) : <ErrorState error={error} />;
  }
  if (loading || !c) return <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-10 w-[520px]" /><Skeleton className="h-[420px]" /></div>;

  const body = {
    "": <OverviewTab c={c} />,
    financials: <FinancialsTab c={c} />,
    ratios: <RatiosTab c={c} />,
    valuation: <ValuationTab c={c} />,
    risk: <RiskTab c={c} />,
    insights: <InsightsTab c={c} />,
  }[tab] ?? <OverviewTab c={c} />;

  return (
    <div className="space-y-5 animate-rise" key={c.symbol}>
      <Header c={c} />
      <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]" aria-label="Company sections">
        {TABS.map((t) => (
          <NavLink key={t.id} end to={`/company/${encodeURIComponent(c.symbol)}${t.id ? `/${t.id}` : ""}`}
            className={({ isActive }) => cx("relative whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors",
              isActive ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent" : "text-ink3 hover:text-ink2")}>
            {t.label}{t.id === "insights" && c.insights.length > 0 && <span className="ml-1.5 rounded-full bg-raised px-1.5 text-2xs text-ink2">{c.insights.length}</span>}
          </NavLink>
        ))}
      </nav>
      {c.data_notes.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-2xs leading-relaxed text-ink2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <div className="space-y-1">{c.data_notes.map((n) => <p key={n}>{n}</p>)}</div>
        </div>
      )}
      <Suspense fallback={<Skeleton className="h-[480px]" />}>{body}</Suspense>
    </div>
  );
}

function Header({ c }: { c: Company }) {
  const s = useSettings();
  const inCmp = s.compare.includes(c.symbol);
  const [busy, setBusy] = useState(false);
  const snap = c.snapshot;
  const lo = snap.low_52w ?? 0, hi = snap.high_52w ?? 0, p = snap.price ?? 0;
  const pos = hi > lo ? ((p - lo) / (hi - lo)) * 100 : 50;

  const exportReport = async () => {
    setBusy(true);
    try {
      const { companyReport } = await import("../excel/companyReport");
      await companyReport(c.symbol);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-raised px-2 py-0.5 font-mono text-xs font-semibold">{c.symbol}</span>
            <Badge>{c.sector}</Badge>
            {c.industry && <Badge>{c.industry}</Badge>}
            {c.is_financial && <Badge tone="accent">Lender / insurer framework</Badge>}
          </div>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">{shortName(c.name)}</h1>
          <div className="mt-1 text-2xs text-ink3">ISIN {c.isin} · NSE · Yahoo {c.yahoo} · statements in INR{c.financial_currency !== "INR" ? ` (translated from ${c.financial_currency})` : ""}</div>
        </div>
        <div className="text-right">
          <div className="num text-4xl font-medium">{price(snap.price)}</div>
          <div className="mt-1 flex items-center justify-end gap-2 text-sm">
            <span className={cx("num", (snap.change ?? 0) >= 0 ? "text-up" : "text-down")}>{(snap.change ?? 0) >= 0 ? "+" : ""}{num(snap.change, 2)}</span>
            <Delta v={c.market.returns?.["1D"]} />
          </div>
          <div className="mt-1 text-2xs text-ink3">Close {fmtDate(snap.last_date)} · EOD · Mkt cap {money(c.valuation.market_cap, s.unit)}</div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-sm">
          <div className="mb-1 flex justify-between text-2xs text-ink3"><span>52W low {price(lo, 0)}</span><span>52W high {price(hi, 0)}</span></div>
          <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/50 via-raised to-up/50">
            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow" style={{ left: `${Math.min(100, Math.max(0, pos))}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={cx("btn", inCmp && "!border-accent/50 !text-accent")} disabled={!inCmp && s.compare.length >= MAX_COMPARE}
            onClick={() => (inCmp ? s.removeCompare(c.symbol) : s.addCompare(c.symbol))}
            title={!inCmp && s.compare.length >= MAX_COMPARE ? `Comparison holds up to ${MAX_COMPARE} companies` : undefined}>
            <GitCompare size={13} />{inCmp ? "In comparison ✓" : "Add to comparison"}
          </button>
          <Link className="btn" to="/compare">Open comparison ({s.compare.length})</Link>
          <button className="btn-primary" onClick={exportReport} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Excel research report
          </button>
          {typeof c.profile.website === "string" && (
            <a className="btn" href={c.profile.website} target="_blank" rel="noreferrer noopener"><ExternalLink size={13} />Website</a>
          )}
        </div>
      </div>
    </section>
  );
}
