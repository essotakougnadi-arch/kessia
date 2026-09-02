// ============================================================
// KESSIA — Export CSV côté client (§7)
// Génère un CSV (séparateur « ; », compatible Excel FR) et
// déclenche un téléchargement dans le navigateur.
// ============================================================

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0) return '';
  const keys = headers ?? Object.keys(rows[0]);
  const head = keys.map(cell).join(';');
  const body = rows.map((r) => keys.map((k) => cell(r[k])).join(';')).join('\n');
  return `﻿${head}\n${body}`;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, headers?: string[]): void {
  const blob = new Blob([toCsv(rows, headers)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
