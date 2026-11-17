import type { EChartsOption } from "echarts";

/** Read the live design tokens so charts follow the light/dark theme. */
export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const rgb = (n: string) => `rgb(${cs.getPropertyValue(`--${n}`).trim().split(" ").join(",")})`;
  const rgba = (n: string, a: number) => `rgba(${cs.getPropertyValue(`--${n}`).trim().split(" ").join(",")},${a})`;
  const v = (n: string) => cs.getPropertyValue(`--${n}`).trim();
  return {
    ink: rgb("ink"),
    ink2: rgb("ink-2"),
    ink3: rgb("ink-3"),
    line: rgb("line"),
    grid: rgb("grid"),
    surface: rgb("surface"),
    raised: rgb("raised"),
    accent: rgb("accent"),
    accentA: (a: number) => rgba("accent", a),
    up: rgb("up"),
    down: rgb("down"),
    upA: (a: number) => rgba("up", a),
    downA: (a: number) => rgba("down", a),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`s${i}`)),
    divNeg: v("div-neg"),
    divMid: v("div-mid"),
    divPos: v("div-pos"),
    dark: document.documentElement.getAttribute("data-theme") === "dark",
  };
}
export type Tokens = ReturnType<typeof tokens>;

export const FONT = '"Geist", system-ui, sans-serif';
export const MONO = '"Geist Mono", ui-monospace, monospace';

export function base(t: Tokens): EChartsOption {
  return {
    backgroundColor: "transparent",
    color: t.series,
    textStyle: { fontFamily: FONT, color: t.ink2, fontSize: 11 },
    animationDuration: 450,
    animationEasing: "cubicOut",
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.line,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.ink, fontFamily: FONT, fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:0 12px 32px -12px rgba(0,0,0,.35);",
      confine: true,
    },
  };
}

/** Legend — only for charts with ≥ 2 series (a single series is named by the title). */
export function legend(t: Tokens, extra: Record<string, unknown> = {}) {
  return {
    type: "scroll" as const,
    textStyle: { color: t.ink2, fontSize: 11 },
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    top: 0,
    left: 0,
    inactiveColor: t.ink3,
    pageIconColor: t.ink2,
    pageTextStyle: { color: t.ink3 },
    ...extra,
  };
}

export function valueAxis(t: Tokens, extra: Record<string, unknown> = {}) {
  return {
    type: "value" as const,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    axisLabel: { color: t.ink3, fontFamily: MONO, fontSize: 10 },
    ...extra,
  };
}

export function categoryAxis(t: Tokens, data?: unknown[], extra: Record<string, unknown> = {}) {
  return {
    type: "category" as const,
    data,
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    axisLabel: { color: t.ink3, fontSize: 10 },
    ...extra,
  };
}

export function timeAxis(t: Tokens, extra: Record<string, unknown> = {}) {
  return {
    type: "time" as const,
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: t.ink3, fontSize: 10, hideOverlap: true },
    ...extra,
  };
}

/** Diverging colour for a return/value, symmetric around zero, clamped at ±cap. */
export function divergingColor(t: Tokens, v: number | null | undefined, cap = 0.1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return t.raised;
  const x = Math.max(-1, Math.min(1, v / cap));
  const mix = (a: string, b: string, k: number) => {
    const pa = hex(a), pb = hex(b);
    const c = pa.map((ch, i) => Math.round(ch + (pb[i] - ch) * k));
    return `rgb(${c.join(",")})`;
  };
  return x >= 0 ? mix(t.divMid, t.divPos, Math.pow(x, 0.8)) : mix(t.divMid, t.divNeg, Math.pow(-x, 0.8));
}

/**
 * Hidden visualMap for cartesian heatmaps: colours by data dimension 3 (a score clamped to
 * [-1, 1]). Cells with no value or no "better" direction get score 0 → the neutral grey midpoint.
 */
export const NA_SCORE = 0;
export function heatVisual(t: Tokens) {
  return {
    show: false, dimension: 3, min: -1, max: 1,
    inRange: { color: [t.divNeg, t.divMid, t.divPos] },
  };
}
export const clampScore = (x: number | null | undefined) =>
  x === null || x === undefined || !Number.isFinite(x) ? NA_SCORE : Math.max(-1, Math.min(1, x));

function hex(h: string): number[] {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export function textOn(bg: string): string {
  const m = bg.match(/\d+/g);
  if (!m) return "#fff";
  const [r, g, b] = m.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#111" : "#fff";
}

/** Compact numeric label for dense heatmap cells. */
export function cellLabel(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (unit === "pct") return `${(v * 100).toFixed(Math.abs(v) >= 1 ? 0 : 1)}`;
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (a >= 100) return v.toFixed(0);
  return v.toFixed(a >= 10 ? 1 : 2);
}
