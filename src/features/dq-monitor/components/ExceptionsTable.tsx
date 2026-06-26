import { useEffect, useMemo, useState } from "react";
import type { ExceptionRow } from "./types";
import ColumnFilterHeader, { useColumnFilter } from "./ColumnFilter";

type ExceptionsTableProps = {
  data: ExceptionRow[];
  showResultDataColumns?: boolean;
  // Fires whenever the in-memory column filters change the visible row set,
  // so the parent page can re-export only the rows the user actually sees.
  onVisibleRowsChange?: (rows: ExceptionRow[]) => void;
};

// RESULT_DATA keys whose values are already shown via the core columns above
// (Asset Id, ID BB Global, Rule Name, Issue). Matched case-insensitively after
// uppercasing. Anything else in RESULT_DATA becomes a dynamic trailing column.
const COVERED_BY_CORE_COLUMNS = new Set<string>([
  "ASSET_ID",
  "ALADDIN_ID",
  "ID_BB_GLOBAL",
  "RULE_ID",
  "RULE_NAME",
  "ISSUE_DESCRIPTION",
]);

function getActionClass(action: string): string {
  switch (action.toLowerCase()) {
    case "update aladdin":
      return "dq-badge dq-badge-blue";
    case "update sdma":
      return "dq-badge dq-badge-purple";
    case "pending":
      return "dq-badge dq-badge-yellow";
    default:
      return "dq-badge dq-badge-gray";
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

export default function ExceptionsTable({
  data,
  showResultDataColumns = true,
  onVisibleRowsChange,
}: ExceptionsTableProps) {
  // Union of all keys across every row's parsed RESULT_DATA, minus the ones
  // already shown via core columns. Stable alphabetical order so the column
  // layout doesn't shuffle as rows come and go.
  const extraKeys = useMemo(() => {
    if (!showResultDataColumns) return [];
    const set = new Set<string>();
    for (const row of data) {
      if (!row.resultData) continue;
      for (const k of Object.keys(row.resultData)) {
        if (!COVERED_BY_CORE_COLUMNS.has(k.toUpperCase())) {
          set.add(k);
        }
      }
    }
    return Array.from(set).sort();
  }, [data, showResultDataColumns]);

  // Asset Id + ID BB Global column filters mirror the SecurityTable shape:
  // dropdown of distinct values, multi-select with search, applies in-memory.
  const allAssetIds = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.aladdin).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [data]
  );
  const allIdBbGlobals = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.idBbGlobal).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [data]
  );
  const [assetIdFilter, setAssetIdFilter] = useColumnFilter(allAssetIds);
  const [idBbGlobalFilter, setIdBbGlobalFilter] = useColumnFilter(allIdBbGlobals);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  const visibleRows = useMemo(
    () =>
      data.filter((row) => {
        if (assetIdFilter && !assetIdFilter.has(row.aladdin)) return false;
        if (idBbGlobalFilter && !idBbGlobalFilter.has(row.idBbGlobal ?? ""))
          return false;
        return true;
      }),
    [data, assetIdFilter, idBbGlobalFilter]
  );

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [visibleRows, onVisibleRowsChange]);

  if (data.length === 0) {
    return (
      <div className="dq-empty-state">
        Select a security from the table above to view exceptions
      </div>
    );
  }

  return (
    <div className="dq-table-container">
      <table className="dq-table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Priority</th>
            <th>Rule Name</th>
            <th>Issue</th>
            <th>
              <ColumnFilterHeader
                label="Asset Id"
                allValues={allAssetIds}
                filter={assetIdFilter}
                onChange={setAssetIdFilter}
                isOpen={openFilterId === "assetId"}
                onToggle={(open) =>
                  setOpenFilterId(open ? "assetId" : null)
                }
              />
            </th>
            <th>
              <ColumnFilterHeader
                label="ID BB Global"
                allValues={allIdBbGlobals}
                filter={idBbGlobalFilter}
                onChange={setIdBbGlobalFilter}
                isOpen={openFilterId === "idBbGlobal"}
                onToggle={(open) =>
                  setOpenFilterId(open ? "idBbGlobal" : null)
                }
              />
            </th>
            <th>Vendor</th>
            <th>Action</th>
            <th>Comments</th>
            {extraKeys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {visibleRows.map((row, index) => {
            const isComplete = row.status === "Complete";
            const cls = [
              "dq-table-row",
              isComplete ? "dq-table-row-complete" : "dq-table-row-even",
            ].join(" ");
            return (
              <tr key={`${row.ruleName}-${index}`} className={cls}>
                <td>{row.dateTime}</td>
                <td>{row.priority}</td>
                <td>{row.ruleName}</td>
                <td>{row.issue}</td>
                <td>{row.aladdin}</td>
                <td>{row.idBbGlobal}</td>
                <td>{row.vendor}</td>
                <td>
                  <span className={getActionClass(row.action)}>{row.action}</span>
                </td>
                <td>{row.comments}</td>
                {extraKeys.map((k) => (
                  <td key={k}>{formatCell(row.resultData?.[k])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
