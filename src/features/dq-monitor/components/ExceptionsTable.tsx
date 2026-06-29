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
    // Render the full union of keys from every row's RESULT_DATA. Order
    // mirrors the JSON: Set preserves insertion order, so each key lands
    // wherever it first appears in any row's RESULT_DATA — which matches
    // the original key order from the SQL row when rows share a shape.
    const set = new Set<string>();
    for (const row of data) {
      if (!row.resultData) continue;
      for (const k of Object.keys(row.resultData)) {
        set.add(k);
      }
    }
    return Array.from(set);
  }, [data, showResultDataColumns]);

  // Column filters mirror the SecurityTable shape: dropdown of distinct
  // values, multi-select with search, applies in-memory.
  const allRuleNames = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.ruleName).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [data]
  );
  const allPriorities = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.priority).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [data]
  );
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
  const [ruleNameFilter, setRuleNameFilter] = useColumnFilter(allRuleNames);
  const [priorityFilter, setPriorityFilter] = useColumnFilter(allPriorities);
  const [assetIdFilter, setAssetIdFilter] = useColumnFilter(allAssetIds);
  const [idBbGlobalFilter, setIdBbGlobalFilter] = useColumnFilter(allIdBbGlobals);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  // Per-RESULT_DATA-key filters for view-exception mode. One Set<string> per
  // key; null/missing means no filter on that column. Stored in a single
  // Record keyed by the JSON key so we can support an arbitrary, dynamic
  // column list without breaking hooks rules.
  const [resultDataFilters, setResultDataFilters] = useState<
    Record<string, Set<string> | null>
  >({});

  // Distinct values per RESULT_DATA key, formatted through the same cell
  // formatter the table uses so the filter strings match the rendered ones
  // (objects → JSON, null → "", numbers → String(n), etc.).
  const valuesByKey = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const k of extraKeys) {
      const set = new Set<string>();
      for (const row of data) {
        const v = formatCell(row.resultData?.[k]);
        if (v === "") continue;
        set.add(v);
      }
      m[k] = Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    return m;
  }, [data, extraKeys]);

  // Prune any RESULT_DATA filters whose remembered values no longer appear
  // in the data (or whose column disappeared entirely) — same pattern as
  // useColumnFilter does for the static columns.
  useEffect(() => {
    setResultDataFilters((prev) => {
      let changed = false;
      const next: Record<string, Set<string> | null> = {};
      for (const [k, cur] of Object.entries(prev)) {
        if (!cur || !valuesByKey[k]) {
          changed = true;
          continue;
        }
        const cleaned = new Set<string>();
        cur.forEach((v) => {
          if (valuesByKey[k].includes(v)) cleaned.add(v);
        });
        if (cleaned.size === 0) {
          changed = true;
          continue;
        }
        if (cleaned.size === cur.size) {
          next[k] = cur;
        } else {
          next[k] = cleaned;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [valuesByKey]);

  const setKeyFilter = (key: string, filter: Set<string> | null) => {
    setResultDataFilters((prev) => {
      if (filter === null || filter.size === 0) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: filter };
    });
  };

  const visibleRows = useMemo(
    () =>
      data.filter((row) => {
        if (ruleNameFilter && !ruleNameFilter.has(row.ruleName)) return false;
        if (priorityFilter && !priorityFilter.has(row.priority)) return false;
        if (assetIdFilter && !assetIdFilter.has(row.aladdin)) return false;
        if (idBbGlobalFilter && !idBbGlobalFilter.has(row.idBbGlobal ?? ""))
          return false;
        for (const [k, f] of Object.entries(resultDataFilters)) {
          if (!f) continue;
          if (!f.has(formatCell(row.resultData?.[k]))) return false;
        }
        return true;
      }),
    [
      data,
      ruleNameFilter,
      priorityFilter,
      assetIdFilter,
      idBbGlobalFilter,
      resultDataFilters,
    ]
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
            {showResultDataColumns ? (
              extraKeys.map((k) => (
                <th key={k}>
                  <ColumnFilterHeader
                    label={k}
                    allValues={valuesByKey[k] ?? []}
                    filter={resultDataFilters[k] ?? null}
                    onChange={(next) => setKeyFilter(k, next)}
                    isOpen={openFilterId === `rd:${k}`}
                    onToggle={(open) =>
                      setOpenFilterId(open ? `rd:${k}` : null)
                    }
                  />
                </th>
              ))
            ) : (
              <>
                <th>Date/Time</th>
                <th>
                  <ColumnFilterHeader
                    label="Priority"
                    allValues={allPriorities}
                    filter={priorityFilter}
                    onChange={setPriorityFilter}
                    isOpen={openFilterId === "priority"}
                    onToggle={(open) =>
                      setOpenFilterId(open ? "priority" : null)
                    }
                  />
                </th>
                <th>
                  <ColumnFilterHeader
                    label="Rule Name"
                    allValues={allRuleNames}
                    filter={ruleNameFilter}
                    onChange={setRuleNameFilter}
                    isOpen={openFilterId === "ruleName"}
                    onToggle={(open) =>
                      setOpenFilterId(open ? "ruleName" : null)
                    }
                  />
                </th>
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
              </>
            )}
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
                {showResultDataColumns ? (
                  extraKeys.map((k) => (
                    <td key={k}>{formatCell(row.resultData?.[k])}</td>
                  ))
                ) : (
                  <>
                    <td>{row.dateTime}</td>
                    <td>{row.priority}</td>
                    <td>{row.ruleName}</td>
                    <td>{row.issue}</td>
                    <td>{row.aladdin}</td>
                    <td>{row.idBbGlobal}</td>
                    <td>{row.vendor}</td>
                    <td>
                      <span className={getActionClass(row.action)}>
                        {row.action}
                      </span>
                    </td>
                    <td>{row.comments}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
