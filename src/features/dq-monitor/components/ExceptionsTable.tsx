import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExceptionRow } from "./types";
import ColumnFilterHeader, { useColumnFilter } from "./ColumnFilter";

type SortState = { key: string; dir: "asc" | "desc" } | null;

// Pulls the value used for sorting a column from a row. Static keys map
// to the corresponding ExceptionRow field; dynamic RESULT_DATA columns
// use the "rd:<jsonKey>" convention.
function getSortValue(row: ExceptionRow, key: string): string {
  if (key.startsWith("rd:")) {
    return formatCell(row.resultData?.[key.slice(3)]);
  }
  switch (key) {
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
      return row.idBbGlobal ?? "";
    case "vendor":
      return row.vendor;
    case "action":
      return row.action;
    case "comments":
      return row.comments;
    default:
      return "";
  }
}

// Ordering helper: empties sink to the bottom, both-numeric compares
// numerically, otherwise localeCompare for stable, locale-aware
// alphabetic order.
function compareValues(a: string, b: string): number {
  if (a === "" && b === "") return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  const an = Number(a);
  const bn = Number(b);
  if (
    Number.isFinite(an) &&
    Number.isFinite(bn) &&
    a.trim() !== "" &&
    b.trim() !== ""
  ) {
    if (an !== bn) return an - bn;
  }
  return a.localeCompare(b);
}

type SortableThProps = {
  colKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  width?: number;
  onStartResize: (key: string, e: React.MouseEvent) => void;
  children: React.ReactNode;
};

// Wraps a <th> with click-to-sort (three-way cycle: asc → desc → off),
// a compact ▲/▼ indicator when the column is the sort key, and a thin
// right-edge drag handle that resizes the column width. Any interactive
// child (e.g. ColumnFilterHeader's ▾ button) already stopPropagates its
// clicks so the sort handler doesn't fire on filter interactions.
function SortableTh({
  colKey,
  sort,
  onSort,
  width,
  onStartResize,
  children,
}: SortableThProps) {
  const active = sort?.key === colKey;
  const arrow = !active ? "" : sort!.dir === "asc" ? " ▲" : " ▼";
  const style = width
    ? { width, minWidth: width, maxWidth: width }
    : undefined;
  return (
    <th
      style={style}
      className={"dq-th-sortable" + (active ? " dq-th-sorted" : "")}
      onClick={() => onSort(colKey)}
    >
      <span className="dq-th-inner">
        {children}
        {arrow && <span className="dq-th-arrow">{arrow}</span>}
      </span>
      <span
        className="dq-col-resize-handle"
        onMouseDown={(e) => onStartResize(colKey, e)}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
}

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

  // Click-to-sort state and three-way toggle (asc → desc → off).
  const [sort, setSort] = useState<SortState>(null);
  const toggleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }, []);

  // Per-column width overrides driven by the right-edge drag handle.
  // Missing key ⇒ natural width; the value is applied as inline width,
  // minWidth, and maxWidth so the browser can't grow/shrink around it.
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{
    key: string;
    startX: number;
    startW: number;
  } | null>(null);
  const startResize = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const th = (e.currentTarget as HTMLElement).closest("th");
      const startW = th ? th.getBoundingClientRect().width : 100;
      resizingRef.current = { key, startX: e.clientX, startW };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    []
  );
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startW } = resizingRef.current;
      const dx = e.clientX - startX;
      const next = Math.max(40, startW + dx);
      setColWidths((prev) => ({ ...prev, [key]: next }));
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const sortedRows = useMemo(() => {
    if (!sort) return visibleRows;
    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;
    return [...visibleRows].sort((a, b) => {
      return compareValues(getSortValue(a, key), getSortValue(b, key)) * factor;
    });
  }, [visibleRows, sort]);

  useEffect(() => {
    onVisibleRowsChange?.(sortedRows);
  }, [sortedRows, onVisibleRowsChange]);

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
              extraKeys.map((k) => {
                const colKey = `rd:${k}`;
                return (
                  <SortableTh
                    key={k}
                    colKey={colKey}
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths[colKey]}
                    onStartResize={startResize}
                  >
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
                  </SortableTh>
                );
              })
            ) : (
              <>
                <SortableTh
                  colKey="dateTime"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.dateTime}
                  onStartResize={startResize}
                >
                  Date/Time
                </SortableTh>
                <SortableTh
                  colKey="priority"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.priority}
                  onStartResize={startResize}
                >
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
                </SortableTh>
                <SortableTh
                  colKey="ruleName"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.ruleName}
                  onStartResize={startResize}
                >
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
                </SortableTh>
                <SortableTh
                  colKey="issue"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.issue}
                  onStartResize={startResize}
                >
                  Issue
                </SortableTh>
                <SortableTh
                  colKey="aladdin"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.aladdin}
                  onStartResize={startResize}
                >
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
                </SortableTh>
                <SortableTh
                  colKey="idBbGlobal"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.idBbGlobal}
                  onStartResize={startResize}
                >
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
                </SortableTh>
                <SortableTh
                  colKey="vendor"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.vendor}
                  onStartResize={startResize}
                >
                  Vendor
                </SortableTh>
                <SortableTh
                  colKey="action"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.action}
                  onStartResize={startResize}
                >
                  Action
                </SortableTh>
                <SortableTh
                  colKey="comments"
                  sort={sort}
                  onSort={toggleSort}
                  width={colWidths.comments}
                  onStartResize={startResize}
                >
                  Comments
                </SortableTh>
              </>
            )}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((row, index) => {
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
