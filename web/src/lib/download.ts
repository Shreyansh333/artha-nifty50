const BOM = String.fromCharCode(0xfeff); // lets Excel detect UTF-8

export type Cell = string | number | null | undefined;

export function toCSV(headers: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCSV(filename: string, headers: string[], rows: Cell[][]) {
  // BOM so Excel opens UTF-8 (₹, —) correctly
  saveBlob(new Blob([BOM + toCSV(headers, rows)], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadDataURL(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const stamp = () => new Date().toISOString().slice(0, 10);
