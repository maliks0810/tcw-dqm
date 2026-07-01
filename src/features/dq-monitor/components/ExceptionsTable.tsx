import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExceptionRow } from "./types";
import ColumnFilterHeader, { useColumnFilter } from "./ColumnFilter";
import SortableTh, {
  compareValues,
  type SortState,
} from "./SortableTh";

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
  const setSortDir = useCallback((key: string, dir: "asc" | "desc") => {
    setSort({ key, dir });
  }, []);

  // Column ⋮ overflow menus: only one open at a time. Also hidden-cols
  // state so users can hide individual columns and restore them via the
  // small chip that appears at the top of the grid when count > 0. Only
  // one column can be pinned at a time; pinning sticks it to the left
  // edge as the grid scrolls horizontally.
  const [openMenuColKey, setOpenMenuColKey] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [pinnedCol, setPinnedCol] = useState<string | null>(null);
  const isHidden = useCallback(
    (key: string) => hiddenCols.has(key),
    [hiddenCols]
  );
  const isPinned = useCallback(
    (key: string) => pinnedCol === key,
    [pinnedCol]
  );
  const hideCol = useCallback((key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  const togglePinCol = useCallback((key: string) => {
    setPinnedCol((prev) => (prev === key ? null : key));
  }, []);
  const showAllCols = useCallback(() => setHiddenCols(new Set()), []);

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

  // Bundle the ⋮ menu wiring for every SortableTh so the JSX stays flat.
  const thMenuProps = (key: string) => ({
    menuOpen: openMenuColKey === key,
    onMenuToggle: (open: boolean) => setOpenMenuColKey(open ? key : null),
    onSortDir: (dir: "asc" | "desc") => setSortDir(key, dir),
    onHide: () => hideCol(key),
    pinned: isPinned(key),
    onTogglePin: () => togglePinCol(key),
  });
  const tdPinnedClass = (key: string) => (isPinned(key) ? " dq-td-pinned" : "");

  return (
    <div className="dq-exceptions-wrap">
      {hiddenCols.size > 0 && (
        <div className="dq-hidden-cols-bar">
          <span>
            {hiddenCols.size} column{hiddenCols.size === 1 ? "" : "s"} hidden
          </span>
          <button
            type="button"
            className="dq-hidden-cols-restore"
            onClick={showAllCols}
          >
            Show all
          </button>
        </div>
      )}
      <div className="dq-table-container">
      <table className="dq-table">
        <thead>
          <tr>
            {showResultDataColumns ? (
              extraKeys.map((k) => {
                const colKey = `rd:${k}`;
                if (isHidden(colKey)) return null;
                return (
                  <SortableTh
                    key={k}
                    colKey={colKey}
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths[colKey]}
                    onStartResize={startResize}
                    {...thMenuProps(colKey)}
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
                {!isHidden("dateTime") && (
                  <SortableTh
                    colKey="dateTime"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.dateTime}
                    onStartResize={startResize}
                    {...thMenuProps("dateTime")}
                  >
                    Date/Time
                  </SortableTh>
                )}
                {!isHidden("priority") && (
                  <SortableTh
                    colKey="priority"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.priority}
                    onStartResize={startResize}
                    {...thMenuProps("priority")}
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
                )}
                {!isHidden("ruleName") && (
                  <SortableTh
                    colKey="ruleName"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.ruleName}
                    onStartResize={startResize}
                    {...thMenuProps("ruleName")}
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
                )}
                {!isHidden("issue") && (
                  <SortableTh
                    colKey="issue"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.issue}
                    onStartResize={startResize}
                    {...thMenuProps("issue")}
                  >
                    Issue
                  </SortableTh>
                )}
                {!isHidden("aladdin") && (
                  <SortableTh
                    colKey="aladdin"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.aladdin}
                    onStartResize={startResize}
                    {...thMenuProps("aladdin")}
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
                )}
                {!isHidden("idBbGlobal") && (
                  <SortableTh
                    colKey="idBbGlobal"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.idBbGlobal}
                    onStartResize={startResize}
                    {...thMenuProps("idBbGlobal")}
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
                )}
                {!isHidden("vendor") && (
                  <SortableTh
                    colKey="vendor"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.vendor}
                    onStartResize={startResize}
                    {...thMenuProps("vendor")}
                  >
                    Vendor
                  </SortableTh>
                )}
                {!isHidden("action") && (
                  <SortableTh
                    colKey="action"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.action}
                    onStartResize={startResize}
                    {...thMenuProps("action")}
                  >
                    Action
                  </SortableTh>
                )}
                {!isHidden("comments") && (
                  <SortableTh
                    colKey="comments"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.comments}
                    onStartResize={startResize}
                    {...thMenuProps("comments")}
                  >
                    Comments
                  </SortableTh>
                )}
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
                {showResultDataColumns
                  ? extraKeys.map((k) => {
                      const colKey = `rd:${k}`;
                      if (isHidden(colKey)) return null;
                      return (
                        <td key={k} className={tdPinnedClass(colKey).trim()}>
                          {formatCell(row.resultData?.[k])}
                        </td>
                      );
                    })
                  : (
                    <>
                      {!isHidden("dateTime") && (
                        <td className={tdPinnedClass("dateTime").trim()}>
                          {row.dateTime}
                        </td>
                      )}
                      {!isHidden("priority") && (
                        <td className={tdPinnedClass("priority").trim()}>
                          {row.priority}
                        </td>
                      )}
                      {!isHidden("ruleName") && (
                        <td className={tdPinnedClass("ruleName").trim()}>
                          {row.ruleName}
                        </td>
                      )}
                      {!isHidden("issue") && (
                        <td className={tdPinnedClass("issue").trim()}>
                          {row.issue}
                        </td>
                      )}
                      {!isHidden("aladdin") && (
                        <td className={tdPinnedClass("aladdin").trim()}>
                          {row.aladdin}
                        </td>
                      )}
                      {!isHidden("idBbGlobal") && (
                        <td className={tdPinnedClass("idBbGlobal").trim()}>
                          {row.idBbGlobal}
                        </td>
                      )}
                      {!isHidden("vendor") && (
                        <td className={tdPinnedClass("vendor").trim()}>
                          {row.vendor}
                        </td>
                      )}
                      {!isHidden("action") && (
                        <td className={tdPinnedClass("action").trim()}>
                          <span className={getActionClass(row.action)}>
                            {row.action}
                          </span>
                        </td>
                      )}
                      {!isHidden("comments") && (
                        <td className={tdPinnedClass("comments").trim()}>
                          {row.comments}
                        </td>
                      )}
                    </>
                  )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
