import { create } from "zustand";

export interface LiveQuote {
  price: number | null;
  change: number | null;
  changePct: number | null;
  prevClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  trailingPE: number | null;
  marketState: string | null;
  time: number | null;
}

interface LiveState {
  quotes: Record<string, LiveQuote>;
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

export const useLive = create<LiveState>((set, get) => ({
  quotes: {},
  fetchedAt: null,
  loading: false,
  error: null,
  fetch: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const resp = await fetch("/api/quotes");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      set({ quotes: data.quotes ?? {}, fetchedAt: data.fetched_at, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },
}));

export function livePrice(sym: string): LiveQuote | undefined {
  return useLive.getState().quotes[sym];
}
