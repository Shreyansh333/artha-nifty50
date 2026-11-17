import type { Unit } from "./store";
import type { Num } from "./types";

export const DASH = "—";

export const UNITS: Record<Unit, { div: number; label: string; short: string }> = {
  cr: { div: 1e7, label: "₹ Crore", short: "₹ Cr" },
  lcr: { div: 1e12, label: "₹ Lakh Crore", short: "₹ L Cr" },
  bn: { div: 1e9, label: "₹ Billion", short: "₹ Bn" },
  mn: { div: 1e6, label: "₹ Million", short: "₹ Mn" },
};

const inLocale = (v: number, dp: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Money in INR (absolute) → selected unit, Indian digit grouping. */
export function money(v: Num | undefined, unit: Unit, opts: { dp?: number; suffix?: boolean } = {}): string {
  if (!isNum(v)) return DASH;
  const u = UNITS[unit];
  const x = v / u.div;
  const dp = opts.dp ?? (Math.abs(x) >= 1000 ? 0 : Math.abs(x) >= 10 ? 1 : 2);
  return `${inLocale(x, dp)}${opts.suffix === false ? "" : ` ${u.short.replace("₹ ", "")}`}`;
}

export function moneyRaw(v: Num | undefined, unit: Unit): number | null {
  return isNum(v) ? v / UNITS[unit].div : null;
}

export function price(v: Num | undefined, dp = 2): string {
  return isNum(v) ? `₹${inLocale(v, dp)}` : DASH;
}

export function pct(v: Num | undefined, dp = 1, signed = false): string {
  if (!isNum(v)) return DASH;
  const s = (v * 100).toFixed(dp);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}

export function mult(v: Num | undefined, dp = 1): string {
  return isNum(v) ? `${v.toFixed(dp)}×` : DASH;
}

export function num(v: Num | undefined, dp = 0): string {
  return isNum(v) ? inLocale(v, dp) : DASH;
}

export function compact(v: Num | undefined): string {
  if (!isNum(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(a >= 1e9 ? 0 : 1)} Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

/** Format a value by KPI unit. */
export function byUnit(v: Num | undefined, unit: string, money_unit: Unit = "cr"): string {
  switch (unit) {
    case "pct": return pct(v);
    case "x": return mult(v, 2);
    case "days": return isNum(v) ? `${v.toFixed(0)} d` : DASH;
    case "inr": return money(v, money_unit);
    case "inr_ps": return price(v);
    case "n": return num(v);
    default: return isNum(v) ? v.toFixed(2) : DASH;
  }
}

export function toneClass(v: Num | undefined): string {
  if (!isNum(v) || v === 0) return "text-ink2";
  return v > 0 ? "text-up" : "text-down";
}

export function arrow(v: Num | undefined): string {
  if (!isNum(v) || v === 0) return "";
  return v > 0 ? "▲" : "▼";
}

export const REASONS: Record<string, string> = {
  na_financial: "Not applicable to banks / lenders / insurers",
  nonpositive_denominator: "Denominator ≤ 0 — ratio not meaningful",
  negative_base: "Prior-year base ≤ 0 — growth not meaningful",
  negative_earnings: "Loss-making period — multiple undefined",
  no_prior_period: "No consecutive prior fiscal year available",
  cogs_not_reported: "Cost of revenue not reported — gross margin would be a 100% artefact",
};

export function reason(code: string | undefined): string {
  if (!code) return "Unavailable";
  if (code.startsWith("missing:")) return `Source field unavailable: ${code.slice(8)}`;
  return REASONS[code] ?? code;
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return DASH;
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

export function ago(iso: string | undefined | null): string {
  if (!iso) return DASH;
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const shortName = (n: string) =>
  n.replace(/ (Limited|Ltd\.?)$/i, "").replace(/ and /g, " & ").replace(/Special Economic Zone/i, "SEZ");
