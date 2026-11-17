import { useEffect, useState } from "react";
import type {
  Company, Coverage, IndexData, Insight, KpiDef, Meta, Prices, Sector, UniverseInsight, UniverseRow, ValidationCheck,
} from "./types";

/**
 * Static data API. Everything is pre-computed by the Python pipeline and served as JSON
 * from /data. Responses are memoised for the session so the browser never re-downloads
 * the same file while navigating.
 */
const cache = new Map<string, Promise<unknown>>();

export function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`/data/${path}`, { cache: "default" }).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export const api = {
  meta: () => load<Meta>("meta.json"),
  universe: () => load<UniverseRow[]>("universe.json"),
  index: () => load<IndexData>("index.json"),
  sectors: () => load<Sector[]>("sectors.json"),
  kpiDictionary: () => load<KpiDef[]>("kpi_dictionary.json"),
  insights: () => load<{ companies: Insight[]; universe: UniverseInsight[] }>("insights.json"),
  coverage: () => load<Coverage[]>("coverage.json"),
  validation: () => load<ValidationCheck[]>("validation.json"),
  company: (s: string) => load<Company>(`companies/${encodeURIComponent(s)}.json`),
  prices: (s: string) => load<Prices>(`prices/${encodeURIComponent(s)}.json`),
};

export interface Async<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, set] = useState<Async<T>>({ data: undefined, error: undefined, loading: true });
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => live && set({ data, error: undefined, loading: false }),
      (error) => live && set({ data: undefined, error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const useMeta = () => useAsync(api.meta, []);
export const useUniverse = () => useAsync(api.universe, []);
export const useKpiDict = () => useAsync(api.kpiDictionary, []);
export const useSectors = () => useAsync(api.sectors, []);
export const useCompany = (s: string) => useAsync(() => api.company(s), [s]);
export const usePrices = (s: string) => useAsync(() => api.prices(s), [s]);

export function useMany<T>(keys: string[], fn: (k: string) => Promise<T>): Async<Record<string, T>> {
  return useAsync(async () => {
    const entries = await Promise.all(keys.map(async (k) => [k, await fn(k)] as const));
    return Object.fromEntries(entries);
  }, [keys.join("|")]);
}
