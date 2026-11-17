import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3, BookOpen, Building2, FileSpreadsheet, GitCompare, LayoutGrid, Lightbulb, Menu, Search, SlidersHorizontal, X,
} from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { GlobalControls, ThemeToggle, type ControlKey } from "./GlobalControls";
import { useMeta } from "../lib/data";
import { useSettings } from "../lib/store";
import { ago, fmtDate } from "../lib/format";
import { cx } from "./ui";

const NAV = [
  { to: "/", label: "Market Overview", icon: LayoutGrid, end: true },
  { to: "/company", label: "Company Research", icon: Building2 },
  { to: "/analytics", label: "Advanced Analytics", icon: BarChart3 },
  { to: "/compare", label: "Comparison", icon: GitCompare },
  { to: "/intelligence", label: "Intelligence", icon: Lightbulb },
  { to: "/screener", label: "Screener", icon: SlidersHorizontal },
  { to: "/exports", label: "Export Centre", icon: FileSpreadsheet },
  { to: "/methodology", label: "Methodology & Data", icon: BookOpen },
];

function scopeFor(path: string): ControlKey[] {
  if (path === "/") return ["sector", "range", "unit"];
  if (path.startsWith("/company")) return ["range", "basis", "unit"];
  if (path.startsWith("/analytics")) return ["sector", "fy", "unit"];
  if (path.startsWith("/compare")) return ["range", "fy", "unit"];
  if (path.startsWith("/intelligence")) return ["sector"];
  if (path.startsWith("/screener")) return ["sector", "fy", "unit"];
  if (path.startsWith("/exports")) return ["sector", "range", "fy", "unit"];
  return [];
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-raised" />
        <path d="M8 23 L14 11 L18 18 L21 14 L25 23" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="leading-none">
        <div className="font-display text-[22px] tracking-tight text-ink">Artha</div>
        <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-ink3">NIFTY 50 Terminal</div>
      </div>
    </div>
  );
}

function Freshness() {
  const { data } = useMeta();
  if (!data) return null;
  return (
    <div className="rounded-xl border border-line bg-raised/50 p-3 text-2xs leading-relaxed text-ink3">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-ink2">
        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" /></span>
        End-of-day data
      </div>
      Prices as of <span className="text-ink2">{fmtDate(data.price_as_of)}</span><br />
      Dataset built {ago(data.generated_at)}<br />
      Source: Yahoo Finance (yfinance, unofficial). Not real-time.
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [palette, setPalette] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const { theme, recent } = useSettings();

  // theme application (supports "system")
  useEffect(() => {
    const apply = () => {
      const t = theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
      document.documentElement.setAttribute("data-theme", t);
    };
    apply();
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT")) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => setMobileNav(false), [loc.pathname]);

  const companyHref = `/company/${recent[0] ?? "RELIANCE"}`;
  const scope = scopeFor(loc.pathname);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to === "/company" ? companyHref : to} end={end}
          className={({ isActive }) => {
            const active = to === "/company" ? loc.pathname.startsWith("/company") : isActive;
            return cx("group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
              active ? "bg-raised text-ink" : "text-ink2 hover:bg-raised/60 hover:text-ink");
          }}>
          {({ isActive }) => {
            const active = to === "/company" ? loc.pathname.startsWith("/company") : isActive;
            return <><Icon size={15} className={active ? "text-accent" : "text-ink3 group-hover:text-ink2"} />{label}</>;
          }}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-full">
      {/* sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-line/70 p-4 lg:flex">
        <div className="space-y-6"><Logo />{nav}</div>
        <div className="space-y-3"><Freshness /><ThemeToggle /></div>
      </aside>
      {mobileNav && (
        <div className="fixed inset-0 z-[70] bg-black/50 lg:hidden" onClick={() => setMobileNav(false)}>
          <aside className="h-full w-72 border-r border-line bg-surface p-4 animate-fade" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between"><Logo /><button className="btn !p-1.5" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={14} /></button></div>
            {nav}
            <div className="mt-6 space-y-3"><Freshness /><ThemeToggle /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 lg:px-6">
            <button className="btn !p-1.5 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={15} /></button>
            <div className="lg:hidden"><Logo /></div>
            <button onClick={() => setPalette(true)}
              className="ml-auto flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink3 transition hover:border-ink3/50 hover:text-ink2 lg:ml-0 lg:w-72">
              <Search size={13} />
              <span className="hidden sm:inline">Search company, symbol, sector…</span>
              <kbd className="ml-auto hidden rounded border border-line px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
            </button>
            <div className="ml-auto hidden md:block"><GlobalControls scope={scope} /></div>
          </div>
          {scope.length > 0 && <div className="border-t border-line/60 px-4 py-2 md:hidden"><GlobalControls scope={scope} /></div>}
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6">{children}</main>
        <footer className="border-t border-line/60 px-6 py-4 text-2xs leading-relaxed text-ink3">
          Artha is an academic research project. Data: Yahoo Finance via yfinance (unofficial; coverage and accuracy vary; end-of-day, not real-time).
          All analysis is rule-based and computed from the displayed data. Not investment advice.
        </footer>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
