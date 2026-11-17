import type { Condition } from "./store";
import type { Metric } from "./metrics";
import { filterBySector } from "./metrics";
import { isNum } from "./format";
import type { UniverseRow } from "./types";

/** Apply the screener's filters exactly as the table does — shared by the table and the filtered Excel export. */
export function applyScreen(rows: UniverseRow[], opts: { sectors: string[]; q: string; conds: Condition[]; sort: string; dir: "asc" | "desc"; fy: string }, metrics: Metric[]) {
  const M = (id: string) => metrics.find((m) => m.id === id);
  let out = filterBySector(rows, opts.sectors);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    out = out.filter((r) => `${r.symbol} ${r.name} ${r.sector} ${r.industry ?? ""}`.toLowerCase().includes(q));
  }
  for (const c of opts.conds) {
    const m = M(c.metric);
    if (!m || (c.a === null && c.b === null)) continue;
    // Condition values are entered in display units (% for pct, ₹ Cr for money)
    const scale = m.unit === "pct" ? 0.01 : m.unit === "inr" ? 1e7 : 1;
    const a = c.a === null ? null : c.a * scale, b = c.b === null ? null : c.b * scale;
    out = out.filter((r) => {
      const v = m.get(r, opts.fy);
      if (!isNum(v)) return false;
      if (c.op === ">") return a === null || v > a;
      if (c.op === "<") return a === null || v < a;
      return (a === null || v >= a) && (b === null || v <= b);
    });
  }
  const sm = M(opts.sort);
  if (sm) {
    out = [...out].sort((x, y) => {
      const a = sm.get(x, opts.fy), b = sm.get(y, opts.fy);
      if (!isNum(a) && !isNum(b)) return 0;
      if (!isNum(a)) return 1; // unavailable values always sort last
      if (!isNum(b)) return -1;
      return opts.dir === "asc" ? a - b : b - a;
    });
  } else if (opts.sort === "symbol") {
    out = [...out].sort((x, y) => (opts.dir === "asc" ? 1 : -1) * x.symbol.localeCompare(y.symbol));
  }
  return out;
}

export function describeScreen(opts: { sectors: string[]; q: string; conds: Condition[]; sort: string; dir: string; fy: string }, metrics: Metric[]): string[] {
  const M = (id: string) => metrics.find((m) => m.id === id);
  const unit = (m?: Metric) => (m?.unit === "pct" ? "%" : m?.unit === "inr" ? " ₹ Cr" : m?.unit === "x" ? "×" : "");
  return [
    `Sectors :: ${opts.sectors.length ? opts.sectors.join(", ") : "All"}`,
    `Text search :: ${opts.q || "(none)"}`,
    `Conditions :: ${opts.conds.length ? opts.conds.map((c) => { const m = M(c.metric); return `${m?.label ?? c.metric} ${c.op === "between" ? `between ${c.a ?? "−∞"} and ${c.b ?? "+∞"}` : `${c.op} ${c.a}`}${unit(m)}`; }).join("; ") : "(none)"}`,
    `Fiscal year :: ${opts.fy === "latest" ? "Latest reported FY per company" : opts.fy}`,
    `Sort :: ${M(opts.sort)?.label ?? opts.sort} (${opts.dir})`,
  ];
}
