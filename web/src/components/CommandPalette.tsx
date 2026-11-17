import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, GitCompare, Search } from "lucide-react";
import { useUniverse } from "../lib/data";
import { useSettings, MAX_COMPARE } from "../lib/store";
import { Delta, Modal, cx } from "./ui";
import { price, shortName } from "../lib/format";
import type { UniverseRow } from "../lib/types";

function score(r: UniverseRow, q: string): number {
  if (!q) return 1;
  const s = r.symbol.toLowerCase(), n = r.name.toLowerCase(), sec = r.sector.toLowerCase();
  if (s === q) return 100;
  if (s.startsWith(q)) return 80;
  if (n.startsWith(q)) return 70;
  if (n.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (s.includes(q) || n.includes(q)) return 40;
  if (sec.includes(q) || (r.industry ?? "").toLowerCase().includes(q)) return 20;
  // subsequence match on name (e.g. "hdb" → HDFC Bank)
  let i = 0;
  for (const ch of n) if (ch === q[i]) i++;
  return i === q.length ? 10 : 0;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useUniverse();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { recent, compare, addCompare } = useSettings();

  const results = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    if (!query) {
      const rec = recent.map((s) => data.find((r) => r.symbol === s)).filter(Boolean) as UniverseRow[];
      const rest = [...data].sort((a, b) => (b.valuation.market_cap ?? 0) - (a.valuation.market_cap ?? 0)).filter((r) => !recent.includes(r.symbol));
      return [...rec, ...rest].slice(0, 50);
    }
    return data.map((r) => [r, score(r, query)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([r]) => r).slice(0, 50);
  }, [data, q, recent]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => setIdx(0), [q]);

  const go = (r: UniverseRow) => {
    nav(`/company/${encodeURIComponent(r.symbol)}`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide={false} title={<span className="flex items-center gap-2"><Search size={14} /> Find a NIFTY 50 company</span>}>
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol, company, sector…  (e.g. INFY, bank, steel)"
        className="input w-full !py-2.5 !text-sm"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" && results[idx]) go(results[idx]);
        }} />
      <div className="mt-3 max-h-[52vh] overflow-auto" role="listbox">
        {!q && recent.length > 0 && <div className="eyebrow px-2 pb-1">Recent · then by market cap</div>}
        {results.map((r, i) => {
          const inCmp = compare.includes(r.symbol);
          return (
            <div key={r.symbol} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)}
              className={cx("group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2", i === idx && "bg-raised")} onClick={() => go(r)}>
              <div className="w-24 shrink-0 font-mono text-xs font-semibold text-ink">{r.symbol}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-ink">{shortName(r.name)}</div>
                <div className="truncate text-2xs text-ink3">{r.sector}</div>
              </div>
              <div className="text-right">
                <div className="num text-xs">{price(r.snapshot.price)}</div>
                <Delta v={r.returns["1D"]} className="text-2xs" />
              </div>
              <button className={cx("btn !p-1", inCmp && "!text-accent")} title={inCmp ? "In comparison" : compare.length >= MAX_COMPARE ? `Comparison full (max ${MAX_COMPARE})` : "Add to comparison"}
                disabled={!inCmp && compare.length >= MAX_COMPARE}
                onClick={(e) => { e.stopPropagation(); addCompare(r.symbol); }}>
                <GitCompare size={12} />
              </button>
              {i === idx && <CornerDownLeft size={12} className="text-ink3" />}
            </div>
          );
        })}
        {data && results.length === 0 && <div className="p-6 text-center text-xs text-ink3">No constituent matches “{q}”.</div>}
      </div>
    </Modal>
  );
}
