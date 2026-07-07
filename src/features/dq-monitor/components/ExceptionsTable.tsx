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
    case "status":
      return row.status;
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
    case "suppressDate":
      return row.suppressDate;
    case "assignTo":
      return row.assignTo;
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
  // When provided (RULE_GROUP.FLAG_STATUS_VISIBLE=true path), the
  // Exceptions grid renders a STATUS column as the first column in
  // view-exception mode. Each cell is a <select> bound to row.status;
  // picking a new value fires onStatusChange(exceptionId, newStatus).
  statusOptions?: string[];
  onStatusChange?: (exceptionId: number, status: string) => void;
  // When true (RULE_GROUP.FLAG_COMMENTS_VISIBLE=true path), the Exceptions
  // grid renders an editable COMMENTS column as the LAST column in
  // view-exception mode. Committing an edit (blur or Enter) fires
  // onCommentsChange(exceptionId, newComments).
  showCommentsColumn?: boolean;
  onCommentsChange?: (exceptionId: number, comments: string) => void;
  // When true (RULE_GROUP.FLAG_SUPPRESS_DATE=true path), the grid renders
  // an editable SUPPRESS_DATE column (native <input type="date">) just
  // before the COMMENTS column in view-exception mode. Committing a value
  // fires onSuppressDateChange(exceptionId, newIsoDate) — empty string
  // clears the cell.
  showSuppressDateColumn?: boolean;
  onSuppressDateChange?: (exceptionId: number, suppressDate: string) => void;
  // When true (RULE_GROUP.FLAG_ASSIGN_TO_VISIBLE=true path), the grid
  // renders an editable ASSIGN TO column just after SUPPRESS_DATE (and
  // before COMMENTS) in view-exception mode. Options come from the
  // same DM_USER list the Assets grid uses. Committing fires
  // onAssignToChange(exceptionId, newAssignee); empty string clears
  // the assignment.
  showAssignToColumn?: boolean;
  assignToOptions?: string[];
  onAssignToChange?: (exceptionId: number, assignTo: string) => void;
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
  statusOptions,
  onStatusChange,
  showCommentsColumn: showCommentsColumnProp = false,
  onCommentsChange,
  showSuppressDateColumn: showSuppressDateColumnProp = false,
  onSuppressDateChange,
  showAssignToColumn: showAssignToColumnProp = false,
  assignToOptions,
  onAssignToChange,
}: ExceptionsTableProps) {
  const showStatusColumn =
    showResultDataColumns && Array.isArray(statusOptions);
  const showCommentsColumn = showResultDataColumns && showCommentsColumnProp;
  const showSuppressDateColumn =
    showResultDataColumns && showSuppressDateColumnProp;
  const showAssignToColumn =
    showResultDataColumns && showAssignToColumnProp;
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
  // Default the COMMENTS column wider than a normal RESULT_DATA column so
  // the free-text edit box has room to breathe on first render.
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    comments: 320,
    suppressDate: 160,
    assignTo: 180,
  });
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

  // Custom in-app alert replacement so the message doesn't come with a
  // browser-injected "localhost:3000 says" prefix. Set to a non-empty
  // string to show the modal; the OK button clears it. Declared here
  // (above the early return below) so React hook order stays consistent.
  const [alertMessage, setAlertMessage] = useState<string>("");
  const alertOkRef = useRef<HTMLButtonElement | null>(null);
  // Focus the OK button when the dialog opens (replaces autoFocus, which
  // eslint-jsx-a11y flags), and dismiss on Escape via a document-level
  // listener so the backdrop element itself stays purely presentational.
  useEffect(() => {
    if (!alertMessage) return;
    alertOkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAlertMessage("");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [alertMessage]);

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
              <>
                {showStatusColumn && !isHidden("status") && (
                  <SortableTh
                    colKey="status"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.status}
                    onStartResize={startResize}
                    {...thMenuProps("status")}
                  >
                    Status
                  </SortableTh>
                )}
                {showSuppressDateColumn && !isHidden("suppressDate") && (
                  <SortableTh
                    colKey="suppressDate"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.suppressDate}
                    onStartResize={startResize}
                    {...thMenuProps("suppressDate")}
                  >
                    Suppress Date
                  </SortableTh>
                )}
                {showAssignToColumn && !isHidden("assignTo") && (
                  <SortableTh
                    colKey="assignTo"
                    sort={sort}
                    onSort={toggleSort}
                    width={colWidths.assignTo}
                    onStartResize={startResize}
                    {...thMenuProps("assignTo")}
                  >
                    Assign To
                  </SortableTh>
                )}
                {extraKeys.map((k) => {
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
                })}
                {showCommentsColumn && !isHidden("comments") && (
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
            const isComplete = row.state === "Complete";
            const cls = [
              "dq-table-row",
              isComplete ? "dq-table-row-complete" : "dq-table-row-even",
            ].join(" ");
            return (
              <tr key={`${row.ruleName}-${index}`} className={cls}>
                {showResultDataColumns
                  ? (
                    <>
                      {showStatusColumn && !isHidden("status") && (
                        <td className={tdPinnedClass("status").trim()}>
                          <select
                            className="dq-row-status-select"
                            value={row.status}
                            onChange={(e) => {
                              const next = e.target.value;
                              // Guard: can't move a row into "Suppress"
                              // without a Suppress Date. Alert and keep
                              // the select on its previous value — the
                              // parent state is untouched because we
                              // never call onStatusChange.
                              if (
                                next === "Suppress" &&
                                !row.suppressDate
                              ) {
                                setAlertMessage(
                                  "Please enter a Suppress Date before setting the status to Suppress."
                                );
                                return;
                              }
                              onStatusChange?.(row.exceptionId, next);
                            }}
                          >
                            {(statusOptions ?? []).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                            {row.status &&
                              !(statusOptions ?? []).includes(row.status) && (
                                <option value={row.status}>{row.status}</option>
                              )}
                          </select>
                        </td>
                      )}
                      {showSuppressDateColumn &&
                        !isHidden("suppressDate") && (
                          <td
                            className={
                              (
                                "dq-td-suppress-date" +
                                tdPinnedClass("suppressDate")
                              ).trim()
                            }
                          >
                            <SuppressDateCell
                              initialValue={row.suppressDate}
                              onCommit={(next) => {
                                if (next !== row.suppressDate) {
                                  onSuppressDateChange?.(
                                    row.exceptionId,
                                    next
                                  );
                                }
                              }}
                            />
                          </td>
                        )}
                      {showAssignToColumn && !isHidden("assignTo") && (
                        <td className={tdPinnedClass("assignTo").trim()}>
                          <select
                            className="dq-assign-select"
                            value={row.assignTo}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next !== row.assignTo) {
                                onAssignToChange?.(row.exceptionId, next);
                              }
                            }}
                          >
                            <option value="">Unassigned</option>
                            {(assignToOptions ?? []).map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                            {row.assignTo &&
                              !(assignToOptions ?? []).includes(
                                row.assignTo
                              ) && (
                                <option value={row.assignTo}>
                                  {row.assignTo}
                                </option>
                              )}
                          </select>
                        </td>
                      )}
                      {extraKeys.map((k) => {
                        const colKey = `rd:${k}`;
                        if (isHidden(colKey)) return null;
                        const w = colWidths[colKey];
                        const tdClass =
                          ("dq-td-rd" + tdPinnedClass(colKey)).trim();
                        // Wrap content in a block-level div: TDs in
                        // table-layout:auto ignore max-width when sizing
                        // columns, but a plain <div> respects it. Default
                        // (no user resize) is single-line nowrap so every
                        // column opens wide enough to show its value on
                        // one line — the container scrolls horizontally if
                        // the total exceeds the viewport. Only when the
                        // user drags the resize handle narrower do we flip
                        // on wrap so the shrunk width can be honored.
                        const innerClass =
                          "dq-td-rd-inner" +
                          (w ? " dq-td-rd-inner-wrap" : "");
                        return (
                          <td key={k} className={tdClass}>
                            <div
                              className={innerClass}
                              style={w ? { maxWidth: w } : undefined}
                            >
                              {formatCell(row.resultData?.[k])}
                            </div>
                          </td>
                        );
                      })}
                      {showCommentsColumn && !isHidden("comments") && (
                        <td
                          className={
                            ("dq-td-comments" + tdPinnedClass("comments")).trim()
                          }
                        >
                          <div
                            className="dq-td-comments-inner"
                            style={
                              colWidths.comments
                                ? { maxWidth: colWidths.comments }
                                : undefined
                            }
                          >
                            <CommentsCell
                              initialValue={row.comments}
                              onCommit={(next) => {
                                if (next !== row.comments) {
                                  onCommentsChange?.(row.exceptionId, next);
                                }
                              }}
                            />
                          </div>
                        </td>
                      )}
                    </>
                  )
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
                        <td
                          className={tdPinnedClass("comments").trim()}
                          title={row.comments}
                        >
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
      {alertMessage && (
        <div className="dq-alert-overlay">
          <div
            className="dq-alert-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dq-alert-dialog-msg"
          >
            <div id="dq-alert-dialog-msg" className="dq-alert-dialog-msg">
              {alertMessage}
            </div>
            <div className="dq-alert-dialog-actions">
              <button
                ref={alertOkRef}
                type="button"
                className="dq-alert-dialog-ok"
                onClick={() => setAlertMessage("")}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Per-row COMMENTS cell. Keeps a local draft so keystrokes don't hit the
// backend on every character; commits on blur (or Enter) via onCommit,
// which the parent forwards to updateExceptionComments only if the value
// actually changed.
function CommentsCell({
  initialValue,
  onCommit,
}: {
  initialValue: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string>(initialValue);
  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);
  return (
    <input
      type="text"
      className="dq-row-comments-input"
      value={draft}
      maxLength={2048}
      title={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// Per-row SUPPRESS_DATE cell. A controlled <input type="date"> whose value
// was bound directly to row.suppressDate reverted every user edit — React
// re-rendered before the backend refetch completed, so the calendar's
// pick / typed segments never stuck. Keeping a local draft lets the picker
// commit immediately; onCommit fires onChange (calendar picked a valid
// full date) and onBlur (typed value finished). Range-limited to
// [today, today + 2 years] — the native `min`/`max` attributes gray out
// out-of-range dates in the picker, and the commit guard rejects anything
// that slips through typing.
function SuppressDateCell({
  initialValue,
  onCommit,
}: {
  initialValue: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string>(initialValue);
  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);
  // Recomputed per render — cheap, and stays correct if the user leaves
  // the page open across midnight.
  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const minDate = iso(today);
  const capDate = new Date(today);
  capDate.setFullYear(capDate.getFullYear() + 2);
  const maxDate = iso(capDate);
  // Empty ("clear the cell") is always allowed; otherwise the ISO string
  // compares lexicographically because it's zero-padded YYYY-MM-DD.
  const withinRange = (v: string) => v === "" || (v >= minDate && v <= maxDate);
  return (
    <input
      type="date"
      className="dq-row-suppress-date-input"
      value={draft}
      min={minDate}
      max={maxDate}
      onChange={(e) => {
        // Always accept the browser's proposed value into the draft — the
        // segmented date editor emits intermediate states while the user
        // types, and rejecting them here made typing look broken. The
        // real-vs-fake range check happens once on blur.
        const next = e.target.value;
        setDraft(next);
        if (withinRange(next) && next !== initialValue) onCommit(next);
      }}
      onBlur={() => {
        if (!withinRange(draft)) {
          setDraft(initialValue);
          return;
        }
        if (draft !== initialValue) onCommit(draft);
      }}
    />
  );
}
