"use client";

type Props = {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  label?: string;
};

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Download CSV (UTF-8 BOM, separador ;) — útil no Excel BR. */
export function ExportCsvButton({
  filename,
  headers,
  rows,
  label = "CSV",
}: Props) {
  function download() {
    const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(";"));
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn btn-outline" onClick={download} disabled={rows.length === 0}>
      {label}
    </button>
  );
}
