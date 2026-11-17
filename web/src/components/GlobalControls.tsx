import { useCallback, useState } from "react";
import { CalendarRange, Filter, Moon, RotateCcw, Sun, Monitor } from "lucide-react";
import { useSettings, type RangePreset, type Unit } from "../lib/store";
import { useMeta, useUniverse } from "../lib/data";
import { Segmented, Select, cx, useOutside } from "./ui";
import { UNITS } from "../lib/format";
import type { UniverseRow } from "../lib/types";

export type ControlKey = "sector" | "range" | "fy" | "basis" | "unit";

const RANGES: RangePreset[] = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"];

export function SectorFilter() {
  const { data } = useUniverse();
  const { sectors, toggleSector, set } = useSettings();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutside<HTMLDivElement>(open, close);
  const all = data ? Array.from(new Set(data.map((r) => r.sector))).sort() : [];
  const counts = (s: string) => data?.filter((r) => r.sector === s).length ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button className={cx("btn", sectors.length > 0 && "!border-accent/60 !text-accent")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Filter size={12} />
        {sectors.length === 0 ? "All sectors" : sectors.length === 1 ? sectors[0] : `${sectors.length} sectors`}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-surface p-2 shadow-pop animate-fade">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="eyebrow">Filter by NSE sector</span>
            <button className="text-2xs text-accent hover:underline" onClick={() => set({ sectors: [] })}>Clear</button>
          </div>
          <div className="max-h-80 overflow-auto">
            {all.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-raised">
                <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={sectors.includes(s)} onChange={() => toggleSector(s)} />
                <span className="flex-1 text-ink2">{s}</span>
                <span className="num text-2xs text-ink3">{counts(s)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RangeControl() {
  const { range, from, to, set } = useSettings();
  const { data: meta } = useMeta();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutside<HTMLDivElement>(open, close);
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");
  const valid = f && t && f < t;
  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <div className="hidden xl:block">
        <Segmented label="Date range" value={range === "CUSTOM" ? ("" as RangePreset) : range}
          options={RANGES.map((r) => ({ value: r, label: r }))} onChange={(v) => set({ range: v })} />
      </div>
      <div className="xl:hidden">
        <Select label="Date range" value={range} onChange={(v) => (v === "CUSTOM" ? setOpen(true) : set({ range: v }))}
          options={[...RANGES.map((r) => ({ value: r, label: r })), { value: "CUSTOM" as RangePreset, label: "Custom…" }]} />
      </div>
      <button className={cx("btn", range === "CUSTOM" && "!border-accent/60 !text-accent")} onClick={() => setOpen((o) => !o)} title="Custom date range">
        <CalendarRange size={12} />
        <span className="hidden 2xl:inline">{range === "CUSTOM" && from && to ? `${from} → ${to}` : "Custom"}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-surface p-3 shadow-pop animate-fade">
          <div className="eyebrow mb-2">Custom date range</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-2xs text-ink3">From<input type="date" className="input mt-1 w-full" value={f} max={meta?.price_as_of} onChange={(e) => setF(e.target.value)} /></label>
            <label className="text-2xs text-ink3">To<input type="date" className="input mt-1 w-full" value={t} max={meta?.price_as_of} onChange={(e) => setT(e.target.value)} /></label>
          </div>
          {f && t && !valid && <p className="mt-2 text-2xs text-down">“From” must be before “To”.</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!valid} onClick={() => { set({ range: "CUSTOM", from: f, to: t }); setOpen(false); }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** March-year-end fiscal years reported by at least 10 constituents, newest first. */
export function availableFys(data: UniverseRow[] | undefined): string[] {
  const counts = new Map<string, number>();
  data?.forEach((r) => Object.keys(r.fund_hist?.revenue ?? {}).forEach((fy) => counts.set(fy, (counts.get(fy) ?? 0) + 1)));
  return [...counts.entries()].filter(([fy, n]) => n >= 10 && /^FY\d{4}$/.test(fy)).map(([fy]) => fy).sort().reverse();
}

export function FySelect() {
  const { fy, set } = useSettings();
  const { data } = useUniverse();
  const fys = availableFys(data);
  const options = [{ value: "latest", label: "Latest FY" }, ...fys.map((f) => ({ value: f, label: f }))];
  return <Select label="Fiscal year" value={fy} onChange={(v) => set({ fy: v })} options={options} />;
}

export function ThemeToggle() {
  const { theme, set } = useSettings();
  return (
    <Segmented label="Theme" value={theme} onChange={(v) => set({ theme: v })}
      options={[
        { value: "dark", label: <Moon size={12} />, title: "Dark" },
        { value: "light", label: <Sun size={12} />, title: "Light" },
        { value: "system", label: <Monitor size={12} />, title: "Match system" },
      ]} />
  );
}

export function GlobalControls({ scope }: { scope: ControlKey[] }) {
  const { unit, basis, set, reset, sectors, range, fy } = useSettings();
  const dirty = sectors.length > 0 || range !== "1Y" || fy !== "latest" || basis !== "annual" || unit !== "cr";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {scope.includes("sector") && <SectorFilter />}
      {scope.includes("range") && <RangeControl />}
      {scope.includes("fy") && <FySelect />}
      {scope.includes("basis") && (
        <Segmented label="Reporting basis" value={basis} onChange={(v) => set({ basis: v })}
          options={[{ value: "annual", label: "Annual" }, { value: "quarterly", label: "Quarterly" }]} />
      )}
      {scope.includes("unit") && (
        <Select label="Currency unit" value={unit} onChange={(v) => set({ unit: v as Unit })}
          options={(Object.keys(UNITS) as Unit[]).map((u) => ({ value: u, label: UNITS[u].short }))} />
      )}
      {scope.length > 0 && (
        <button className="btn" onClick={reset} disabled={!dirty} title="Reset filters to defaults"><RotateCcw size={12} /><span className="hidden sm:inline">Reset</span></button>
      )}
    </div>
  );
}
