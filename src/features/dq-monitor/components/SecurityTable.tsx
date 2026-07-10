import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecurityRow } from "./types";
import ColumnFilterHeader, { useColumnFilter } from "./ColumnFilter";
import SortableTh, {
  compareValues,
  type SortState,
} from "./SortableTh";
import {
  loadColumnLayout,
  usePersistedColumnLayout,
} from "./useColumnLayoutStorage";

// localStorage key for this grid's persistent column layout (order,
// pinned set, hidden set, per-column widths). Bump the vN suffix to
// invalidate every browser's cached blob when the schema drifts.
const SEC_STORAGE_KEY = "dqm.securityTable.layout.v1";

// Pulls a sort key value from a SecurityRow. Non-sortable widgets
// (Actions dropdown, Assign To dropdown, Trigger BBG checkbox) collapse
// to a stable proxy so clicking the header still cycles asc/desc without
// throwing the row order into disorder.
function getSecuritySortValue(row: SecurityRow, key: string): string {
  switch (key) {
    case "actions":
      return "";
    case "dateTime":
      return row.dateTime;
    case "priority":
      return row.priority;
    case "severity":
      return row.severity;
    case "type":
      return row.type;
    case "assignTo":
      return row.assignTo ?? "";
    case "assetId":
      return row.aladdinId;
    case "figi":
      return row.figi ?? "";
    case "securityDescription":
      return row.securityDescription;
    case "trader":
      return row.trader;
    case "tradingTeam":
      return row.tradingTeam;
    case "exceptionCount":
      return String(row.exceptionCount);
    case "bbgLastRefresh":
      return row.bbgLastRefresh;
    case "triggerBbg":
      return row.triggerBbg ? "1" : "0";
    default:
      return "";
  }
}

// Canonical column order for the security grid. The user's live
// columnOrder state starts as a copy of this and gets mutated by drag-
// reorder — any new key introduced later gets appended to preserve
// existing arrangement.
const SEC_COL_KEYS: string[] = [
  "actions",
  "dateTime",
  "priority",
  "severity",
  "type",
  "assignTo",
  "assetId",
  "figi",
  "securityDescription",
  "trader",
  "tradingTeam",
  "exceptionCount",
  "bbgLastRefresh",
  "triggerBbg",
];

// Fallback per-column pixel width used only when computing sticky-left
// offsets for pinned columns and the column has no explicit colWidth
// entry yet (i.e. user never resized or pinned it before).
const SEC_DEFAULT_WIDTHS: Record<string, number> = {
  actions: 120,
  dateTime: 140,
  priority: 100,
  severity: 100,
  type: 140,
  assignTo: 160,
  assetId: 120,
  figi: 140,
  securityDescription: 240,
  trader: 140,
  tradingTeam: 140,
  exceptionCount: 120,
  bbgLastRefresh: 160,
  triggerBbg: 120,
};

type SecurityTableProps = {
  data: SecurityRow[];
  selectedRow: number | null;
  onRowSelect: (index: number) => void;
  assigneeOptions: string[];
  onAssignToChange: (index: number, value: string) => void;
  blinkingAladdinId?: string | null;
  onVisibleRowsChange?: (rows: SecurityRow[]) => void;
  onAction?: (
    action: "runRules" | "loadTdc" | "loadAnalytics" | "notifyTod",
    assetId: string,
    idBbGlobal: string
  ) => void;
  actionByAsset?: Record<string, ActionValue>;
  onActionShownChange?: (assetId: string, value: ActionValue) => void;
};

const UNASSIGNED_LABEL = "— Unassigned —";

export type ActionValue =
  | ""
  | "runRules"
  | "loadTdc"
  | "loadAnalytics"
  | "notifyTod";

const ACTION_LABELS: Record<ActionValue, string> = {
  "": "None",
  runRules: "Run Rules",
  loadTdc: "Load TDC",
  loadAnalytics: "Load Analytics",
  notifyTod: "Notify TOD",
};

function ActionSelect({
  assetId,
  idBbGlobal,
  shown,
  setShown,
  onAction,
}: {
  assetId: string;
  idBbGlobal: string;
  shown: ActionValue;
  setShown: (assetId: string, value: ActionValue) => void;
  onAction: (
    action: "runRules" | "loadTdc" | "loadAnalytics" | "notifyTod",
    assetId: string,
    idBbGlobal: string
  ) => void;
}) {
  const [open, setOpen] = React.useState<boolean>(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (e: React.MouseEvent, action: ActionValue) => {
    e.stopPropagation();
    setShown(assetId, action);
    setOpen(false);
    if (action !== "") onAction(action, assetId, idBbGlobal);
  };

  return (
    <div className="dq-action-wrap" ref={wrapRef}>
      <button
        type="button"
        className="dq-run-rules-btn dq-action-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="dq-action-label">{ACTION_LABELS[shown]}</span>
        <span className="dq-action-arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="dq-action-popover" role="menu">
          {(["", "runRules", "loadTdc", "loadAnalytics", "notifyTod"] as ActionValue[]).map(
            (v) => (
              <button
                key={v}
                type="button"
                role="menuitem"
                className="dq-action-item"
                onClick={(e) => pick(e, v)}
              >
                {ACTION_LABELS[v]}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function SecurityTable({
  data,
  selectedRow,
  onRowSelect,
  assigneeOptions,
  onAssignToChange,
  blinkingAladdinId,
  onVisibleRowsChange,
  onAction,
  actionByAsset,
  onActionShownChange,
}: SecurityTableProps) {
  const allAssetIds = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.aladdinId).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [data]
  );

  const allFigis = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.figi).filter(Boolean))).sort(
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

  const allSeverities = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.severity).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [data]
  );

  const [assetIdFilter, setAssetIdFilter] = useColumnFilter(allAssetIds);
  const [figiFilter, setFigiFilter] = useColumnFilter(allFigis);
  const [priorityFilter, setPriorityFilter] = useColumnFilter(allPriorities);
  const [severityFilter, setSeverityFilter] = useColumnFilter(allSeverities);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  const visibleRows = useMemo(
    () =>
      data.filter((row) => {
        if (assetIdFilter && !assetIdFilter.has(row.aladdinId)) return false;
        if (figiFilter && !figiFilter.has(row.figi ?? "")) return false;
        if (priorityFilter && !priorityFilter.has(row.priority)) return false;
        if (severityFilter && !severityFilter.has(row.severity)) return false;
        return true;
      }),
    [data, assetIdFilter, figiFilter, priorityFilter, severityFilter]
  );

  // Click-to-sort (three-way asc → desc → off) + explicit dir set from
  // the ⋮ menu.
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

  // Per-column width overrides driven by the right-edge drag handle AND
  // by the pin action (which snapshots the column's current width so
  // multi-pin left-offset math has an authoritative width to sum).
  // Hydrated from localStorage so a resize survives page reloads.
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    () => loadColumnLayout(SEC_STORAGE_KEY)?.widths ?? {}
  );
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

  // ⋮ column-menu state: open-column + hidden set + multi-pin set +
  // user-driven columnOrder for drag-to-reorder. Hidden / pinned /
  // columnOrder all hydrate from localStorage so layout survives reload.
  const [openMenuColKey, setOpenMenuColKey] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(loadColumnLayout(SEC_STORAGE_KEY)?.hidden ?? [])
  );
  const [pinnedCols, setPinnedCols] = useState<Set<string>>(
    () => new Set(loadColumnLayout(SEC_STORAGE_KEY)?.pinned ?? [])
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const persisted = loadColumnLayout(SEC_STORAGE_KEY)?.columnOrder;
    if (!persisted) return SEC_COL_KEYS;
    // Reconcile against canonical: keep persisted keys that still exist,
    // append any new canonical keys at the tail.
    const set = new Set(SEC_COL_KEYS);
    const kept = persisted.filter((k) => set.has(k));
    const missing = SEC_COL_KEYS.filter((k) => !kept.includes(k));
    return [...kept, ...missing];
  });

  // Mount-time snapshot — used both to detect session-scoped reorders
  // (so a persisted layout from a previous session isn't treated as
  // an override) and as the target of the Reset action. Frozen after
  // first render.
  const [initialColumnOrder] = useState<string[]>(() => {
    const persisted = loadColumnLayout(SEC_STORAGE_KEY)?.columnOrder;
    if (!persisted) return SEC_COL_KEYS;
    const set = new Set(SEC_COL_KEYS);
    const kept = persisted.filter((k) => set.has(k));
    const missing = SEC_COL_KEYS.filter((k) => !kept.includes(k));
    return [...kept, ...missing];
  });

  // True after any successful drag-drop in this session. Cleared by
  // Reset. Persistence never touches it, so a fresh page load always
  // starts false.
  const [hasReordered, setHasReordered] = useState<boolean>(false);
  // ref map so pin can snapshot the column's rendered width when it
  // toggles ON (used by the sticky-left offset math for other pinned
  // columns to its right).
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  const isHidden = useCallback(
    (key: string) => hiddenCols.has(key),
    [hiddenCols]
  );
  const isPinned = useCallback(
    (key: string) => pinnedCols.has(key),
    [pinnedCols]
  );
  const hideCol = useCallback((key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  const togglePinCol = useCallback((key: string) => {
    setPinnedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      next.add(key);
      // Snapshot the current rendered width if we don't already have
      // one, so the pinned-offset accumulator has a real number for the
      // columns pinned after this one.
      const th = thRefs.current[key];
      if (th) {
        setColWidths((prevW) =>
          prevW[key] != null
            ? prevW
            : { ...prevW, [key]: th.getBoundingClientRect().width }
        );
      }
      return next;
    });
  }, []);
  const showAllCols = useCallback(() => setHiddenCols(new Set()), []);
  // Full reset: strip session-scoped overrides (hidden, pinned, resized,
  // reordered) back to the mount-time snapshot. The persist effect
  // re-serializes the fresh state immediately after.
  const resetColumns = useCallback(() => {
    setHiddenCols(new Set());
    setPinnedCols(new Set());
    setColWidths({});
    setColumnOrder(initialColumnOrder);
    setHasReordered(false);
  }, [initialColumnOrder]);

  // Persist the layout on every relevant state change.
  usePersistedColumnLayout(
    SEC_STORAGE_KEY,
    columnOrder,
    pinnedCols,
    hiddenCols,
    colWidths
  );

  const sortedRows = useMemo(() => {
    if (!sort) return visibleRows;
    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;
    return [...visibleRows].sort(
      (a, b) =>
        compareValues(getSecuritySortValue(a, key), getSecuritySortValue(b, key)) *
        factor
    );
  }, [visibleRows, sort]);

  useEffect(() => {
    onVisibleRowsChange?.(sortedRows);
  }, [sortedRows, onVisibleRowsChange]);

  // Drag-to-reorder: dragged key stashed in ref, drop swaps positions
  // inside columnOrder. Also drives the drop-target outline via state.
  const dragKeyRef = useRef<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const onDragStart = useCallback(
    (colKey: string, e: React.DragEvent<HTMLTableCellElement>) => {
      dragKeyRef.current = colKey;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", colKey);
    },
    []
  );
  const onDragOver = useCallback(
    (colKey: string, e: React.DragEvent<HTMLTableCellElement>) => {
      if (!dragKeyRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTargetKey !== colKey) setDropTargetKey(colKey);
    },
    [dropTargetKey]
  );
  const onDrop = useCallback(
    (colKey: string, e: React.DragEvent<HTMLTableCellElement>) => {
      e.preventDefault();
      const fromKey = dragKeyRef.current;
      dragKeyRef.current = null;
      setDropTargetKey(null);
      if (!fromKey || fromKey === colKey) return;
      setHasReordered(true);
      setColumnOrder((prev) => {
        const from = prev.indexOf(fromKey);
        const to = prev.indexOf(colKey);
        if (from < 0 || to < 0) return prev;
        const next = prev.slice();
        next.splice(from, 1);
        next.splice(to, 0, fromKey);
        return next;
      });
    },
    []
  );
  const onDragEnd = useCallback(() => {
    dragKeyRef.current = null;
    setDropTargetKey(null);
  }, []);

  // Cumulative sticky-left offset for each pinned column, computed in
  // display order so pinned columns stack side-by-side without overlap.
  const pinnedOffsets = useMemo(() => {
    const off: Record<string, number> = {};
    let acc = 0;
    for (const key of columnOrder) {
      if (hiddenCols.has(key)) continue;
      if (pinnedCols.has(key)) {
        off[key] = acc;
        acc += colWidths[key] ?? SEC_DEFAULT_WIDTHS[key] ?? 120;
      }
    }
    return off;
  }, [columnOrder, hiddenCols, pinnedCols, colWidths]);

  const commonThProps = (key: string) => ({
    colKey: key,
    sort,
    onSort: toggleSort,
    width: colWidths[key],
    onStartResize: startResize,
    menuOpen: openMenuColKey === key,
    onMenuToggle: (open: boolean) => setOpenMenuColKey(open ? key : null),
    onSortDir: (dir: "asc" | "desc") => setSortDir(key, dir),
    onHide: () => hideCol(key),
    pinned: isPinned(key),
    onTogglePin: () => togglePinCol(key),
    pinnedLeft: pinnedOffsets[key],
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    isDropTarget: dropTargetKey === key,
    thRef: (el: HTMLTableCellElement | null) => {
      thRefs.current[key] = el;
    },
  });

  // Per-column TD style: same sticky-left offset as its header when
  // pinned; otherwise no positional overrides.
  const tdStyle = (key: string): React.CSSProperties | undefined =>
    isPinned(key) ? { left: pinnedOffsets[key] ?? 0 } : undefined;
  const tdClass = (key: string) =>
    isPinned(key) ? "dq-td-pinned" : "";

  // Header renderer per key. Filter-bearing columns get the
  // ColumnFilterHeader child; everything else is a plain label.
  const renderHeader = (key: string): React.ReactNode => {
    switch (key) {
      case "actions":
        return (
          <SortableTh key={key} {...commonThProps("actions")}>
            Actions
          </SortableTh>
        );
      case "dateTime":
        return (
          <SortableTh key={key} {...commonThProps("dateTime")}>
            Date/Time
          </SortableTh>
        );
      case "priority":
        return (
          <SortableTh key={key} {...commonThProps("priority")}>
            <ColumnFilterHeader
              label="Priority"
              allValues={allPriorities}
              filter={priorityFilter}
              onChange={setPriorityFilter}
              isOpen={openFilterId === "priority"}
              onToggle={(open) => setOpenFilterId(open ? "priority" : null)}
            />
          </SortableTh>
        );
      case "severity":
        return (
          <SortableTh key={key} {...commonThProps("severity")}>
            <ColumnFilterHeader
              label="Severity"
              allValues={allSeverities}
              filter={severityFilter}
              onChange={setSeverityFilter}
              isOpen={openFilterId === "severity"}
              onToggle={(open) => setOpenFilterId(open ? "severity" : null)}
            />
          </SortableTh>
        );
      case "type":
        return (
          <SortableTh key={key} {...commonThProps("type")}>
            Type
          </SortableTh>
        );
      case "assignTo":
        return (
          <SortableTh key={key} {...commonThProps("assignTo")}>
            Assign To
          </SortableTh>
        );
      case "assetId":
        return (
          <SortableTh key={key} {...commonThProps("assetId")}>
            <ColumnFilterHeader
              label="Asset Id"
              allValues={allAssetIds}
              filter={assetIdFilter}
              onChange={setAssetIdFilter}
              isOpen={openFilterId === "assetId"}
              onToggle={(open) => setOpenFilterId(open ? "assetId" : null)}
            />
          </SortableTh>
        );
      case "figi":
        return (
          <SortableTh key={key} {...commonThProps("figi")}>
            <ColumnFilterHeader
              label="FIGI"
              allValues={allFigis}
              filter={figiFilter}
              onChange={setFigiFilter}
              isOpen={openFilterId === "figi"}
              onToggle={(open) => setOpenFilterId(open ? "figi" : null)}
            />
          </SortableTh>
        );
      case "securityDescription":
        return (
          <SortableTh key={key} {...commonThProps("securityDescription")}>
            Security Description
          </SortableTh>
        );
      case "trader":
        return (
          <SortableTh key={key} {...commonThProps("trader")}>
            Trader
          </SortableTh>
        );
      case "tradingTeam":
        return (
          <SortableTh key={key} {...commonThProps("tradingTeam")}>
            Trading Team
          </SortableTh>
        );
      case "exceptionCount":
        return (
          <SortableTh key={key} {...commonThProps("exceptionCount")}>
            Exception Count
          </SortableTh>
        );
      case "bbgLastRefresh":
        return (
          <SortableTh key={key} {...commonThProps("bbgLastRefresh")}>
            BBG Last Refresh
          </SortableTh>
        );
      case "triggerBbg":
        return (
          <SortableTh key={key} {...commonThProps("triggerBbg")}>
            Trigger BBG
          </SortableTh>
        );
      default:
        return null;
    }
  };

  // Body cell renderer per key + row.
  const renderCell = (
    key: string,
    row: SecurityRow,
    index: number,
    ctx: { currentAssignee: string; options: string[] }
  ): React.ReactNode => {
    switch (key) {
      case "actions":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.type === "Security Setup" && onAction && (
              <ActionSelect
                assetId={row.aladdinId}
                idBbGlobal={row.figi ?? ""}
                shown={actionByAsset?.[row.aladdinId] ?? ""}
                setShown={onActionShownChange ?? (() => undefined)}
                onAction={onAction}
              />
            )}
          </td>
        );
      case "dateTime":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.dateTime}
          </td>
        );
      case "priority":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.priority}
          </td>
        );
      case "severity":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.severity}
          </td>
        );
      case "type":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.type}
          </td>
        );
      case "assignTo":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            <select
              className="dq-assign-select"
              value={ctx.currentAssignee}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onAssignToChange(index, e.target.value)}
            >
              <option value="">{UNASSIGNED_LABEL}</option>
              {ctx.options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </td>
        );
      case "assetId":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.aladdinId}
          </td>
        );
      case "figi":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.figi}
          </td>
        );
      case "securityDescription":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.securityDescription}
          </td>
        );
      case "trader":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.trader}
          </td>
        );
      case "tradingTeam":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.tradingTeam}
          </td>
        );
      case "exceptionCount":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.exceptionCount}
          </td>
        );
      case "bbgLastRefresh":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            {row.bbgLastRefresh}
          </td>
        );
      case "triggerBbg":
        return (
          <td key={key} className={tdClass(key)} style={tdStyle(key)}>
            <input type="checkbox" checked={row.triggerBbg} readOnly />
          </td>
        );
      default:
        return null;
    }
  };

  // Only visible columns, in the user's current drag-reorder sequence.
  const visibleKeys = columnOrder.filter((k) => !isHidden(k));

  // "Reset column order" appears only when the user has dragged a
  // column in the current session. A persisted layout from a previous
  // session is treated as the baseline — not as an override waiting to
  // be reset.
  const showTopBar = hiddenCols.size > 0 || hasReordered;

  return (
    <div className="dq-exceptions-wrap">
      {showTopBar && (
        <div className="dq-hidden-cols-bar">
          <span>
            {hiddenCols.size > 0 && (
              <>
                {hiddenCols.size} column
                {hiddenCols.size === 1 ? "" : "s"} hidden
              </>
            )}
            {hiddenCols.size > 0 && hasReordered && ", "}
            {hasReordered && "columns reordered"}
          </span>
          {hiddenCols.size > 0 && (
            <button
              type="button"
              className="dq-hidden-cols-restore"
              onClick={showAllCols}
            >
              Show all
            </button>
          )}
          {hasReordered && (
            <button
              type="button"
              className="dq-hidden-cols-restore"
              onClick={resetColumns}
            >
              Reset column order
            </button>
          )}
        </div>
      )}
      <div className="dq-table-container">
        <table className="dq-table">
          <thead>
            <tr>{visibleKeys.map((k) => renderHeader(k))}</tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => {
              const index = data.indexOf(row);
              const currentAssignee = row.assignTo ?? "";
              const optionSet = new Set(assigneeOptions);
              if (currentAssignee) optionSet.add(currentAssignee);
              const options = Array.from(optionSet).sort((a, b) =>
                a.localeCompare(b)
              );
              const isBlinking =
                !!blinkingAladdinId && row.aladdinId === blinkingAladdinId;
              return (
                <tr
                  key={`${row.aladdinId}-${index}`}
                  onClick={() => onRowSelect(index)}
                  className={[
                    "dq-table-row",
                    selectedRow === index
                      ? "dq-table-row-selected"
                      : row.allComplete
                      ? "dq-table-row-complete"
                      : index % 2 === 0
                      ? "dq-table-row-even"
                      : "dq-table-row-odd",
                    isBlinking ? "dq-table-row-blinking" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {visibleKeys.map((k) =>
                    renderCell(k, row, index, { currentAssignee, options })
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
