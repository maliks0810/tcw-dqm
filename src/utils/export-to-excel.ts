import type { SecurityRow } from "../features/dq-monitor/components/types";

function toHeader(key: string): string {
  // camelCase / snake_case -> "Title Case"
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCsv(csv: string, filename: string) {
  // BOM so Excel detects UTF-8 and renders accents correctly
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRowsToExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  headerOverrides?: Partial<Record<keyof T & string, string>>
) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]) as Array<keyof T & string>;
  const headerLine = keys
    .map((k) => escapeCsv(headerOverrides?.[k] ?? toHeader(k)))
    .join(",");
  const bodyLines = rows.map((row) =>
    keys.map((k) => escapeCsv(row[k])).join(",")
  );
  const csv = [headerLine, ...bodyLines].join("\r\n");
  downloadCsv(csv, filename);
}

const ASSET_HEADER_OVERRIDES: Partial<Record<keyof SecurityRow, string>> = {
  aladdinId: "Asset Id",
  figi: "FIGI",
  bbgLastRefresh: "BBG Last Refresh",
  triggerBbg: "Trigger BBG",
};

export function exportAssetsToExcel(rows: SecurityRow[], filename?: string) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  exportRowsToExcel(
    rows as unknown as Array<Record<string, unknown>>,
    filename ?? `assets-${stamp}.csv`,
    ASSET_HEADER_OVERRIDES as Record<string, string>
  );
}
