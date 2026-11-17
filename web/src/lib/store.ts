import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";
export type Unit = "cr" | "lcr" | "bn" | "mn";
export type Basis = "annual" | "quarterly";
export type RangePreset = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "10Y" | "MAX" | "CUSTOM";

export interface Settings {
  theme: Theme;
  unit: Unit;
  basis: Basis;
  sectors: string[];          // empty = all sectors
  range: RangePreset;
  from: string | null;        // custom range (ISO)
  to: string | null;
  fy: string;                 // "latest" or e.g. "FY2025"
  compare: string[];
  recent: string[];
  set: (p: Partial<Omit<Settings, "set" | "reset" | "toggleSector" | "addCompare" | "removeCompare" | "pushRecent">>) => void;
  toggleSector: (s: string) => void;
  addCompare: (s: string) => void;
  removeCompare: (s: string) => void;
  pushRecent: (s: string) => void;
  reset: () => void;
}

const DEFAULTS = {
  unit: "cr" as Unit,
  basis: "annual" as Basis,
  sectors: [] as string[],
  range: "1Y" as RangePreset,
  from: null,
  to: null,
  fy: "latest",
};

export const MAX_COMPARE = 6;

export const useSettings = create<Settings>()(
  persist(
    (set, get) => ({
      theme: "dark",
      ...DEFAULTS,
      compare: ["RELIANCE", "HDFCBANK", "TCS", "BHARTIARTL"],
      recent: [],
      set: (p) => set(p),
      toggleSector: (s) => {
        const cur = get().sectors;
        set({ sectors: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] });
      },
      addCompare: (s) => {
        const cur = get().compare;
        if (cur.includes(s) || cur.length >= MAX_COMPARE) return;
        set({ compare: [...cur, s] });
      },
      removeCompare: (s) => set({ compare: get().compare.filter((x) => x !== s) }),
      pushRecent: (s) => set({ recent: [s, ...get().recent.filter((x) => x !== s)].slice(0, 6) }),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: "artha-settings", version: 1 },
  ),
);

export interface Condition { metric: string; op: ">" | "<" | "between"; a: number | null; b: number | null }
export interface ScreenerState {
  cols: string[];
  sort: string;
  dir: "asc" | "desc";
  q: string;
  conds: Condition[];
  pageSize: number;
  set: (p: Partial<Omit<ScreenerState, "set">>) => void;
}
export const DEFAULT_COLS = ["market_cap", "ret_1D", "ret_1Y", "pe_now", "pb_now", "roe", "net_margin", "revenue_growth", "debt_to_equity", "div_yield_now", "vol_1Y"];
export const useScreener = create<ScreenerState>()(
  persist(
    (set) => ({ cols: DEFAULT_COLS, sort: "market_cap", dir: "desc", q: "", conds: [], pageSize: 25, set: (p) => set(p) }),
    { name: "artha-screener", version: 1 },
  ),
);

/** Resolve a range preset into [fromISO, toISO] relative to the latest date in the data. */
export function resolveRange(preset: RangePreset, last: string, first: string, from?: string | null, to?: string | null): [string, string] {
  if (preset === "CUSTOM" && from && to) return [from, to];
  const end = new Date(last + "T00:00:00Z");
  const d = new Date(end);
  switch (preset) {
    case "1M": d.setUTCMonth(d.getUTCMonth() - 1); break;
    case "3M": d.setUTCMonth(d.getUTCMonth() - 3); break;
    case "6M": d.setUTCMonth(d.getUTCMonth() - 6); break;
    case "YTD": d.setUTCMonth(0, 1); d.setUTCDate(0); break;
    case "1Y": d.setUTCFullYear(d.getUTCFullYear() - 1); break;
    case "3Y": d.setUTCFullYear(d.getUTCFullYear() - 3); break;
    case "5Y": d.setUTCFullYear(d.getUTCFullYear() - 5); break;
    case "10Y": d.setUTCFullYear(d.getUTCFullYear() - 10); break;
    default: return [first, last];
  }
  const f = d.toISOString().slice(0, 10);
  return [f < first ? first : f, last];
}
