import type { Num, Prices } from "./types";
import { resolveRange, type RangePreset } from "./store";

export function rangeIndices(p: Prices, from: string, to: string): [number, number] {
  let i = 0;
  while (i < p.d.length && p.d[i] < from) i++;
  let j = p.d.length - 1;
  while (j > 0 && p.d[j] > to) j--;
  return [Math.min(i, j), j];
}

export function rangeFor(p: Prices | undefined, preset: RangePreset, from: string | null, to: string | null): [string, string] | null {
  if (!p || !p.d.length) return null;
  return resolveRange(preset, p.d[p.d.length - 1], p.d[0], from, to);
}

export function sma(values: Num[], n: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null) { sum += v; count++; }
    if (i >= n) {
      const old = values[i - n];
      if (old !== null) { sum -= old; count--; }
    }
    if (i >= n - 1 && count === n) out[i] = sum / n;
  }
  return out;
}

/** Rebase a series to 100 at its first non-null value inside [i, j]. */
export function rebase(values: Num[], i: number, j: number): Num[] {
  let base: number | null = null;
  const out: Num[] = [];
  for (let k = i; k <= j; k++) {
    const v = values[k];
    if (base === null && v !== null && v > 0) base = v;
    out.push(v === null || base === null ? null : (v / base) * 100);
  }
  return out;
}

export function periodReturn(values: Num[], i: number, j: number): Num {
  let a: number | null = null, b: number | null = null;
  for (let k = i; k <= j; k++) if (values[k] !== null && values[k]! > 0) { a = values[k]; break; }
  for (let k = j; k >= i; k--) if (values[k] !== null && values[k]! > 0) { b = values[k]; break; }
  return a && b ? b / a - 1 : null;
}

export function annualisedVol(values: Num[], i: number, j: number): Num {
  const r: number[] = [];
  for (let k = i + 1; k <= j; k++) {
    const a = values[k - 1], b = values[k];
    if (a && b && a > 0 && b > 0) r.push(Math.log(b / a));
  }
  if (r.length < 20) return null;
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v * 252);
}

export function maxDrawdown(values: Num[], i: number, j: number): Num {
  let peak = -Infinity, mdd = 0, seen = false;
  for (let k = i; k <= j; k++) {
    const v = values[k];
    if (v === null || v <= 0) continue;
    seen = true;
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return seen ? mdd : null;
}

/** Downsample long daily series for rendering (keeps first/last, every k-th point). */
export function thin<T>(arr: T[], max = 2500): T[] {
  if (arr.length <= max) return arr;
  const k = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % k === 0 || i === arr.length - 1);
}
