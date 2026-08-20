import type {
  ExceptionRow,
  SecurityRow,
} from "../features/dq-monitor/components/types";

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

// Filename timestamp in the operator's LOCAL time — toISOString() is
// UTC and stamps an evening-EDT export with tomorrow's date.
function localStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

// Columns the assets CSV carries, in output order. An explicit
// allowlist rather than an omit-list: exportRowsToExcel derives its
// columns from Object.keys, so a new grid-internal field on
// SecurityRow (alongside exceptions / allComplete / dateTimeIso)
// would silently leak into the CSV under an omit-list, but is
// inert here until someone adds it on purpose.
const ASSET_EXPORT_KEYS: Array<keyof SecurityRow> = [
  "dateTime",
  "priority",
  "assignTo",
  "aladdinId",
  "figi",
  "exceptionCount",
  "securityDescription",
  "trader",
  "tradingTeam",
  "bbgLastRefresh",
  "triggerBbg",
];

export function exportAssetsToExcel(rows: SecurityRow[], filename?: string) {
  const flat = rows.map((r) => {
    const rec: Record<string, unknown> = {};
    for (const k of ASSET_EXPORT_KEYS) rec[k] = r[k];
    return rec;
  });
  exportRowsToExcel(
    flat,
    filename ?? `assets-${localStamp()}.csv`,
    ASSET_HEADER_OVERRIDES as Record<string, string>
  );
}

const EXCEPTION_COVERED_BY_CORE = new Set<string>([
  "ASSET_ID",
  "ALADDIN_ID",
  "ID_BB_GLOBAL",
  "RULE_NAME",
  "ISSUE_DESCRIPTION",
]);

const EXCEPTION_HEADER_OVERRIDES: Record<string, string> = {
  dateTime: "Date/Time",
  ruleName: "Rule Name",
  aladdin: "Asset Id",
  idBbGlobal: "ID BB Global",
};

// Resolve one exception row's value for a grid column key. Mirrors the
// switch in ExceptionsTable's renderCell / getSortValue — anything the
// grid can show, the export can read. rd:* keys look up the raw JSON
// key inside resultData.
function valueForKey(row: ExceptionRow, key: string): unknown {
  if (key.startsWith("rd:")) {
    return row.resultData?.[key.slice(3)] ?? "";
  }
  switch (key) {
    case "status":
      return row.status;
    case "suppressDate":
      return row.suppressDate;
    case "assignTo":
      return row.assignTo;
    case "comments":
      return row.comments;
    case "dateTime":
      return row.dateTime;
    case "priority":
      return row.priority;
    case "ruleName":
      return row.ruleName;
    case "issue":
      return row.issue;
    case "aladdin":
      return row.aladdin;
    case "idBbGlobal":
      return row.idBbGlobal;
    case "vendor":
      return row.vendor;
    case "action":
      return row.action;
    case "openDate":
      return row.openDate;
    case "closeDate":
      return row.closeDate;
    case "state":
      return row.state;
    default:
      return "";
  }
}

// Flattens the visible exception rows into CSV-friendly records. Column
// selection + order:
//   - columns (preferred, passed by DqMonitorPage): the exact left-to-right
//     order and header labels the operator currently sees in the grid,
//     including any drag-reorders / hide-shows / rd:* trailing columns.
//   - fallback (no columns): a hardcoded static-grid layout followed by
//     an alphabetically-sorted union of RESULT_DATA keys — the historic
//     behaviour, kept so pre-integration callers don't break.
export function exportExceptionsToExcel(
  rows: ExceptionRow[],
  filename?: string,
  columns?: { key: string; label: string }[]
) {
  if (rows.length === 0) return;

  const stamp = localStamp();

  if (columns && columns.length > 0) {
    // Ordered path: one CSV column per grid column, in the grid's
    // current order, with the grid's own header labels.
    const flat = rows.map((r) => {
      const rec: Record<string, unknown> = {};
      for (const c of columns) {
        rec[c.key] = valueForKey(r, c.key);
      }
      return rec;
    });
    const headerOverrides: Record<string, string> = {};
    for (const c of columns) headerOverrides[c.key] = c.label;
    exportRowsToExcel(
      flat,
      filename ?? `exceptions-${stamp}.csv`,
      headerOverrides
    );
    return;
  }

  // Legacy fallback — kept intact so callers that don't yet pass the
  // grid layout still export something sensible.
  const extraKeys = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      if (!r.resultData) return acc;
      for (const k of Object.keys(r.resultData)) {
        if (!EXCEPTION_COVERED_BY_CORE.has(k.toUpperCase())) acc.add(k);
      }
      return acc;
    }, new Set<string>())
  ).sort();

  const flat = rows.map((r) => {
    const base: Record<string, unknown> = {
      dateTime: r.dateTime,
      priority: r.priority,
      ruleName: r.ruleName,
      issue: r.issue,
      aladdin: r.aladdin,
      idBbGlobal: r.idBbGlobal,
      vendor: r.vendor,
      action: r.action,
      comments: r.comments,
      state: r.state,
    };
    for (const k of extraKeys) {
      base[k] = r.resultData?.[k] ?? "";
    }
    return base;
  });

  exportRowsToExcel(
    flat,
    filename ?? `exceptions-${stamp}.csv`,
    EXCEPTION_HEADER_OVERRIDES
  );
}
