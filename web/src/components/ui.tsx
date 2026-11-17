import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { arrow, isNum, pct, reason as reasonText, toneClass } from "../lib/format";
import type { Num } from "../lib/types";

export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ");
}

export function Segmented<T extends string>({
  value, options, onChange, size = "sm", label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} aria-pressed={o.value === value}
          className={size === "md" ? "!px-3 !py-1.5 !text-xs" : undefined} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value, options, onChange, label, className,
}: {
  value: T;
  options: { value: T; label: string; group?: string }[];
  onChange: (v: T) => void;
  label?: string;
  className?: string;
}) {
  const groups = Array.from(new Set(options.map((o) => o.group ?? "")));
  return (
    <label className={cx("relative inline-flex items-center", className)}>
      {label && <span className="sr-only">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}
        className="input appearance-none pr-7 cursor-pointer">
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ) : (
            options.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
          ),
        )}
      </select>
      <span className="pointer-events-none absolute right-2 text-ink3 text-[9px]">▼</span>
    </label>
  );
}

export function Delta({ v, dp = 2, className }: { v: Num | undefined; dp?: number; className?: string }) {
  return (
    <span className={cx("num", toneClass(v), className)}>
      {isNum(v) ? <><span className="text-[0.7em] mr-0.5">{arrow(v)}</span>{pct(v, dp, true)}</> : "—"}
    </span>
  );
}

export function NA({ code, short = false }: { code?: string; short?: boolean }) {
  return (
    <span className="text-ink3 cursor-help border-b border-dotted border-ink3/40" title={reasonText(code)}>
      {short ? "—" : "n/a"}
    </span>
  );
}

export function InfoTip({ text, className }: { text: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cx("relative inline-flex", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="More information" className="text-ink3 hover:text-ink" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        <Info size={13} />
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-ink2 shadow-pop animate-fade normal-case tracking-normal font-normal">
          {text}
        </span>
      )}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide = true }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-fade" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" className={cx("card shadow-pop animate-rise flex max-h-[92vh] w-full flex-col bg-surface", wide ? "max-w-6xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-sm font-medium">{title}</div>
          <button className="btn !p-1.5" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div className="overflow-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function ErrorState({ error }: { error?: Error }) {
  return (
    <div className="card p-6 text-sm text-down">
      Could not load data{error ? `: ${error.message}` : ""}. Refresh the page; if it persists the dataset may be rebuilding.
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right, desc }: { eyebrow?: string; title: ReactNode; right?: ReactNode; desc?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="font-display text-[28px] leading-none tracking-tight text-ink">{title}</h2>
        {desc && <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ink2">{desc}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, info }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; info?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow flex items-center gap-1">{label}{info && <InfoTip text={info} />}</div>
      <div className={cx("num mt-1 truncate text-lg font-medium text-ink", tone)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-2xs text-ink3">{sub}</div>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "positive" | "negative" | "neutral" | "accent"; children: ReactNode }) {
  const cls = {
    positive: "border-up/30 bg-up/10 text-up",
    negative: "border-down/30 bg-down/10 text-down",
    neutral: "border-line bg-raised text-ink2",
    accent: "border-accent/30 bg-accent/10 text-accent",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium", cls)}>{children}</span>;
}

/** Close a popover on outside click. */
export function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);
  return ref;
}

export function Sparkline({ values, width = 84, height = 24, color }: { values: (number | null)[]; width?: number; height?: number; color?: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter(([, v]) => v !== null && Number.isFinite(v)) as [number, number][];
  if (pts.length < 2) return <span className="text-ink3 text-2xs">—</span>;
  const ys = pts.map((p) => p[1]);
  const min = Math.min(...ys), max = Math.max(...ys);
  const sx = (i: number) => (i / Math.max(values.length - 1, 1)) * (width - 4) + 2;
  const sy = (v: number) => (max === min ? height / 2 : height - 3 - ((v - min) / (max - min)) * (height - 6));
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const c = color ?? (last[1] >= pts[0][1] ? "rgb(var(--up))" : "rgb(var(--down))");
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last[0])} cy={sy(last[1])} r={2.2} fill={c} />
    </svg>
  );
}
