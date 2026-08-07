import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExceptionRow } from "./types";
import ColumnFilterHeader, { useColumnFilter } from "./ColumnFilter";
import SortableTh, {
  compareValues,
  type SortState,
} from "./SortableTh";
import {
  loadColumnLayout,
  usePersistedColumnLayout,
} from "./useColumnLayoutStorage";

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
    case "openDate":
      return row.openDate;
    case "closeDate":
      return row.closeDate;
    default:
      return "";
  }
}

type ExceptionsTableProps = {
  data: ExceptionRow[];
  showResultDataColumns?: boolean;
  onVisibleRowsChange?: (rows: ExceptionRow[]) => void;
  statusOptions?: string[];
  // status may be accompanied by comments + suppressDate the operator
  // typed but hasn't committed via the per-cell endpoints yet. The
  // callback must forward both to updateExceptionStatus so the backend
  // SP can apply them atomically alongside the STATUS_ID update.
  // Empty string on either extra means "leave alone".
  onStatusChange?: (
    exceptionId: number,
    status: string,
    comments: string,
    suppressDate: string
  ) => void;
  showCommentsColumn?: boolean;
  onCommentsChange?: (exceptionId: number, comments: string) => void;
  showSuppressDateColumn?: boolean;
  onSuppressDateChange?: (exceptionId: number, suppressDate: string) => void;
  showAssignToColumn?: boolean;
  assignToOptions?: string[];
  onAssignToChange?: (exceptionId: number, assignTo: string) => void;
  // RESULT_DATA keys the parent wants surfaced first in the RD section
  // of canonicalKeys (right after Comments, before the rest of the
  // RD columns). Used e.g. in view-by-group mode to keep RULE_NAME +
  // ALADDIN_ID left of the other rd:* columns so a mixed-catalog view
  // reads coherently. Order preserved as passed. Unknown keys (not
  // present in any row's RESULT_DATA) are ignored. Undefined / empty
  // → the RD section keeps its natural projection order.
  priorityRdKeys?: string[];
  // When true, every editable cell (STATUS + SUPPRESS DATE + ASSIGN TO
  // + COMMENTS) renders in a locked, non-interactive form. Used when
  // the parent has picked a historical Exceptions Date — the grid is
  // showing EXCEPTION_HIST, and mutating older-day rows would be
  // confusing / unsupported by the backend. Callbacks are still
  // wired but never fire while readOnly is on.
  readOnly?: boolean;
  // When true, appends OPEN_DATE + CLOSE_DATE columns at the far
  // right of the grid (after every rd:* column). Used only for
  // Security-Master-family rule groups; other groups don't surface
  // the lifecycle dates.
  showLifecycleColumns?: boolean;
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

// Formats an ISO date (YYYY-MM-DD, or a full RFC3339 timestamp) as
// MM/DD/YYYY for grid display. Empty / malformed input returns "" so
// blank cells stay blank instead of showing "//".
function formatMdyDate(s: string): string {
  if (!s) return "";
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
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

// localStorage key for this grid's persistent column layout (order,
// pinned set, hidden set, per-column widths). Bump the vN suffix to
// invalidate every browser's cached blob when the schema drifts.
// v8 bump: openDate + closeDate are now treated as "trailing statics"
// via TRAILING_COLUMN_KEYS — pinStaticsToCanonicalOrder always shoves
// them to the tail regardless of persisted or drag-reordered position,
// mirroring how STATIC_COLUMN_KEYS pins Status/SuppressDate/AssignTo/
// Comments to the head. Invalidates any v7 layout that might have
// slotted them mid-grid.
const STORAGE_KEY = "dqm.exceptionsTable.layout.v8";

// Keys that live in the fixed "left of the RESULT_DATA columns" section
// of the Exceptions grid. Their canonical position is Status → Suppress
// Date → Assign To → Comments; any deviation in a persisted layout is
// normalized away by pinStaticsToCanonicalOrder every time we hydrate
// or reconcile columnOrder.
const STATIC_COLUMN_KEYS = new Set([
  "status",
  "suppressDate",
  "assignTo",
  "comments",
]);

// Lifecycle-date columns are conceptually "trailing statics" — they
// belong at the far right of the grid whenever present, so drag-
// reorder or a stale persisted layout can't slot them mid-grid.
const TRAILING_COLUMN_KEYS = new Set(["openDate", "closeDate"]);

// Rewrites `order` so that whichever static columns appear in it are
// emitted first (in the exact position they hold in `canonical`), the
// non-static/non-trailing keys retain their prior order in the middle,
// and any trailing keys land at the tail (also in `canonical` order).
// This lets users freely drag RESULT_DATA columns around while
// preventing a stale persisted state from ever shoving Comments to the
// leading column or Open/Close Date into the middle.
function pinStaticsToCanonicalOrder(
  order: string[],
  canonical: string[]
): string[] {
  const canonicalStatics = canonical.filter((k) => STATIC_COLUMN_KEYS.has(k));
  const canonicalTrailing = canonical.filter((k) =>
    TRAILING_COLUMN_KEYS.has(k)
  );
  const seen = new Set<string>();
  const middle: string[] = [];
  for (const k of order) {
    if (
      STATIC_COLUMN_KEYS.has(k) ||
      TRAILING_COLUMN_KEYS.has(k) ||
      seen.has(k)
    ) {
      continue;
    }
    seen.add(k);
    middle.push(k);
  }
  return [...canonicalStatics, ...middle, ...canonicalTrailing];
}

// Seed widths for the three widget-cell columns so their content has
// room to breathe on a fresh install (before any user resize / persist).
const INITIAL_WIDTHS: Record<string, number> = {
  comments: 320,
  suppressDate: 160,
  assignTo: 180,
};

// Fallback widths used only to compute the sticky-left offsets of pinned
// columns when the user hasn't resized (or pinned) that column yet. The
// INITIAL_WIDTHS seeds live in state; everything else falls back here.
const DEFAULT_WIDTHS: Record<string, number> = {
  status: 140,
  suppressDate: 160,
  assignTo: 180,
  comments: 320,
  dateTime: 140,
  priority: 100,
  ruleName: 200,
  issue: 320,
  aladdin: 140,
  idBbGlobal: 140,
  openDate: 120,
  closeDate: 120,
  vendor: 120,
  action: 120,
};

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
  priorityRdKeys,
  readOnly = false,
  showLifecycleColumns = false,
}: ExceptionsTableProps) {
  const showStatusColumn =
    showResultDataColumns && Array.isArray(statusOptions);
  const showCommentsColumn = showResultDataColumns && showCommentsColumnProp;
  const showSuppressDateColumn =
    showResultDataColumns && showSuppressDateColumnProp;
  const showAssignToColumn =
    showResultDataColumns && showAssignToColumnProp;

  // RESULT_DATA column order. The first row with a RESULT_DATA blob
  // fixes the order — that's the order the stored procedure projected
  // its columns in, and every subsequent row is expected to carry the
  // same schema. Any keys that only appear in later rows (schema drift
  // or partial rows) are appended at the tail so nothing is dropped.
  // Result: the grid's rd:* columns line up with the JSON order the
  // backend emitted, not an accretion-order union across the row set.
  const extraKeys = useMemo(() => {
    if (!showResultDataColumns) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const row of data) {
      if (!row.resultData) continue;
      for (const k of Object.keys(row.resultData)) {
        if (seen.has(k)) continue;
        seen.add(k);
        order.push(k);
      }
    }
    return order;
  }, [data, showResultDataColumns]);

  // Column filters mirror the SecurityTable shape: distinct values,
  // multi-select w/ search, applied in-memory.
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
  // Assign To rows can legitimately be blank (an unassigned exception),
  // and blank is a common thing to filter on. Fold empties into a
  // visible "Unassigned" sentinel here and translate the same way when
  // applying the filter so the checkbox label matches the row value.
  const ASSIGN_TO_UNASSIGNED = "Unassigned";
  const assignToKey = (v: string) =>
    v && v.trim() !== "" ? v : ASSIGN_TO_UNASSIGNED;
  const allAssignTos = useMemo(
    () =>
      Array.from(new Set(data.map((r) => assignToKey(r.assignTo)))).sort(
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
  const [assignToFilter, setAssignToFilter] = useColumnFilter(allAssignTos);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  // Per-RESULT_DATA-key filters keyed by the JSON key.
  const [resultDataFilters, setResultDataFilters] = useState<
    Record<string, Set<string> | null>
  >({});

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
        if (assignToFilter && !assignToFilter.has(assignToKey(row.assignTo)))
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
      assignToFilter,
      resultDataFilters,
    ]
  );

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

  // ⋮ overflow + hidden set + multi-pin set. Only one column menu is
  // ever open at a time. Hidden/pinned sets hydrate from localStorage so
  // the user's layout survives a page reload.
  const [openMenuColKey, setOpenMenuColKey] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(loadColumnLayout(STORAGE_KEY)?.hidden ?? [])
  );
  const [pinnedCols, setPinnedCols] = useState<Set<string>>(
    () => new Set(loadColumnLayout(STORAGE_KEY)?.pinned ?? [])
  );
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
  const showAllCols = useCallback(() => setHiddenCols(new Set()), []);

  // Per-column width overrides. Missing key ⇒ natural width; when a value
  // is set it's applied as width/minWidth/maxWidth so the browser can't
  // squeeze around it. Seed the three column-widget defaults so their
  // widgets look reasonable on first render, then overlay any persisted
  // user widths on top.
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => ({
    ...INITIAL_WIDTHS,
    ...(loadColumnLayout(STORAGE_KEY)?.widths ?? {}),
  }));
  const resizingRef = useRef<{
    key: string;
    startX: number;
    startW: number;
  } | null>(null);
  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startW = th ? th.getBoundingClientRect().width : 100;
    resizingRef.current = { key, startX: e.clientX, startW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);
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

  // ref map so pin can snapshot the column's rendered width when it
  // toggles ON (used by the sticky-left math for columns pinned after it).
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const togglePinCol = useCallback((key: string) => {
    setPinnedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      next.add(key);
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

  // Canonical column list for the current mode (view-security vs
  // view-exception with flag-gated columns + dynamic extraKeys).
  const canonicalKeys = useMemo<string[]>(() => {
    if (!showResultDataColumns) {
      return [
        "dateTime",
        "priority",
        "ruleName",
        "issue",
        "aladdin",
        "idBbGlobal",
        "vendor",
        "action",
        "comments",
      ];
    }
    // Canonical order in view-exception mode: Status → Suppress Date →
    // Assign To → Comments → (priority RD keys, if any) → (rest of the
    // RESULT_DATA JSON columns). Priority keys are hoisted so a
    // group-mode view can pin e.g. RULE_NAME + ALADDIN_ID immediately
    // after Comments while leaving every other RD column in projection
    // order. Unknown priority keys (not in extraKeys) are silently
    // ignored so callers can hand a superset without breaking layouts
    // for catalogs that don't expose those keys.
    const keys: string[] = [];
    if (showStatusColumn) keys.push("status");
    if (showSuppressDateColumn) keys.push("suppressDate");
    if (showAssignToColumn) keys.push("assignTo");
    if (showCommentsColumn) keys.push("comments");
    const priority = (priorityRdKeys ?? []).filter((k) =>
      extraKeys.includes(k)
    );
    const prioritySet = new Set(priority);
    for (const k of priority) keys.push(`rd:${k}`);
    for (const k of extraKeys) {
      if (prioritySet.has(k)) continue;
      keys.push(`rd:${k}`);
    }
    // Lifecycle dates (OPEN_DATE / CLOSE_DATE) land at the far right,
    // after every RESULT_DATA column, when the parent opts in via
    // showLifecycleColumns (Security-Master-family rule groups only).
    if (showLifecycleColumns) {
      keys.push("openDate");
      keys.push("closeDate");
    }
    return keys;
  }, [
    showResultDataColumns,
    showStatusColumn,
    showSuppressDateColumn,
    showAssignToColumn,
    extraKeys,
    showCommentsColumn,
    priorityRdKeys,
    showLifecycleColumns,
  ]);

  // Drag-reordered column order. Starts from any persisted layout if the
  // schema still matches, else falls back to the canonical order for the
  // current mode. Either way the sync effect below reconciles with
  // canonical (drops unknown keys, appends missing ones) so we can't get
  // stuck on stale state from a previous mode. The persisted layout is
  // passed through pinStaticsToCanonicalOrder so a prior session that
  // dragged e.g. Comments to column 0 doesn't survive a reload — statics
  // always start in canonical order at every hydrate.
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const persisted = loadColumnLayout(STORAGE_KEY)?.columnOrder;
    return pinStaticsToCanonicalOrder(persisted ?? canonicalKeys, canonicalKeys);
  });

  // Mount-time snapshot of columnOrder. Used both to compute
  // "reordered THIS SESSION" (so the Reset button doesn't appear
  // just because a persisted layout differs from canonical), and as
  // the target when the user clicks Reset. Frozen — no updates after
  // first render.
  const [initialColumnOrder] = useState<string[]>(() => {
    const persisted = loadColumnLayout(STORAGE_KEY)?.columnOrder;
    return pinStaticsToCanonicalOrder(persisted ?? canonicalKeys, canonicalKeys);
  });

  // True after the user drops a column onto another in the current
  // session. Cleared by Reset. Persistence layer never touches it, so
  // a fresh page load always starts false — the Reset chip stays
  // hidden until the user actively drags.
  const [hasReordered, setHasReordered] = useState<boolean>(false);

  // Full reset: strip every user override (hidden, pinned, resized,
  // reordered) back to the session's baseline. Column order is
  // restored to the mount-time snapshot, reconciled against the current
  // canonical (so keys that appeared since mount stay visible, appended
  // at the tail).
  const resetColumns = useCallback(() => {
    setHiddenCols(new Set());
    setPinnedCols(new Set());
    setColWidths({ ...INITIAL_WIDTHS });
    const set = new Set(canonicalKeys);
    const kept = initialColumnOrder.filter((k) => set.has(k));
    const missing = canonicalKeys.filter((k) => !kept.includes(k));
    setColumnOrder([...kept, ...missing]);
    setHasReordered(false);
  }, [canonicalKeys, initialColumnOrder]);
  useEffect(() => {
    setColumnOrder((prev) => {
      const set = new Set(canonicalKeys);
      const kept = prev.filter((k) => set.has(k));
      const missing = canonicalKeys.filter((k) => !kept.includes(k));
      // pinStaticsToCanonicalOrder guarantees the four static columns
      // stay in canonical order at the front regardless of how
      // extraKeys arriving async might have shuffled prev.
      const next = pinStaticsToCanonicalOrder([...kept, ...missing], canonicalKeys);
      if (
        next.length === prev.length &&
        next.every((k, i) => k === prev[i])
      ) {
        return prev;
      }
      return next;
    });
  }, [canonicalKeys]);

  // Cumulative sticky-left offset per pinned column, so multiple pins
  // stack side-by-side at the left edge without overlap.
  const pinnedOffsets = useMemo(() => {
    const off: Record<string, number> = {};
    let acc = 0;
    for (const key of columnOrder) {
      if (hiddenCols.has(key)) continue;
      if (pinnedCols.has(key)) {
        off[key] = acc;
        acc += colWidths[key] ?? DEFAULT_WIDTHS[key] ?? 150;
      }
    }
    return off;
  }, [columnOrder, hiddenCols, pinnedCols, colWidths]);

  // Drag-to-reorder: dragged key stashed in ref, drop swaps positions
  // inside columnOrder. Drop-target key drives the outline glow.
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
      // Any explicit drop is honored — statics and RESULT_DATA columns
      // alike. Non-drag paths (hydrate, reconciler) still enforce the
      // canonical static order via pinStaticsToCanonicalOrder, so a
      // user-initiated reorder only lives for the current session:
      // next page load falls back to the canonical default.
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

  // Persist the layout on every relevant state change. Runs as a plain
  // effect so the first render (already hydrated) writes back an
  // identical blob — cheap no-op.
  usePersistedColumnLayout(
    STORAGE_KEY,
    columnOrder,
    pinnedCols,
    hiddenCols,
    colWidths
  );

  const sortedRows = useMemo(() => {
    if (!sort) return visibleRows;
    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;
    return [...visibleRows].sort((a, b) => {
      return compareValues(getSortValue(a, key), getSortValue(b, key)) * factor;
    });
  }, [visibleRows, sort]);

  // Custom in-app alert replacement so the message doesn't come with a
  // browser-injected "localhost:3000 says" prefix. Declared above the
  // early return below so hook order stays consistent.
  const [alertMessage, setAlertMessage] = useState<string>("");
  const alertOkRef = useRef<HTMLButtonElement | null>(null);
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

  const tdPinnedStyle = (key: string): React.CSSProperties | undefined =>
    isPinned(key) ? { left: pinnedOffsets[key] ?? 0 } : undefined;
  const tdPinnedClass = (key: string) => (isPinned(key) ? " dq-td-pinned" : "");

  // Header renderer per key. rd:* keys share one path that reads
  // valuesByKey + resultDataFilters.
  const renderHeader = (key: string): React.ReactNode => {
    if (key.startsWith("rd:")) {
      const k = key.slice(3);
      return (
        <SortableTh key={key} {...commonThProps(key)}>
          <ColumnFilterHeader
            label={k}
            allValues={valuesByKey[k] ?? []}
            filter={resultDataFilters[k] ?? null}
            onChange={(next) => setKeyFilter(k, next)}
            isOpen={openFilterId === key}
            onToggle={(open) => setOpenFilterId(open ? key : null)}
          />
        </SortableTh>
      );
    }
    switch (key) {
      case "status":
        return (
          <SortableTh key={key} {...commonThProps("status")}>
            Status
          </SortableTh>
        );
      case "suppressDate":
        return (
          <SortableTh key={key} {...commonThProps("suppressDate")}>
            Suppress Date
          </SortableTh>
        );
      case "assignTo":
        return (
          <SortableTh key={key} {...commonThProps("assignTo")}>
            <ColumnFilterHeader
              label="Assign To"
              allValues={allAssignTos}
              filter={assignToFilter}
              onChange={setAssignToFilter}
              isOpen={openFilterId === "assignTo"}
              onToggle={(open) => setOpenFilterId(open ? "assignTo" : null)}
            />
          </SortableTh>
        );
      case "comments":
        return (
          <SortableTh key={key} {...commonThProps("comments")}>
            Comments
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
      case "ruleName":
        return (
          <SortableTh key={key} {...commonThProps("ruleName")}>
            <ColumnFilterHeader
              label="Rule Name"
              allValues={allRuleNames}
              filter={ruleNameFilter}
              onChange={setRuleNameFilter}
              isOpen={openFilterId === "ruleName"}
              onToggle={(open) => setOpenFilterId(open ? "ruleName" : null)}
            />
          </SortableTh>
        );
      case "issue":
        return (
          <SortableTh key={key} {...commonThProps("issue")}>
            Issue
          </SortableTh>
        );
      case "aladdin":
        return (
          <SortableTh key={key} {...commonThProps("aladdin")}>
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
      case "idBbGlobal":
        return (
          <SortableTh key={key} {...commonThProps("idBbGlobal")}>
            <ColumnFilterHeader
              label="ID BB Global"
              allValues={allIdBbGlobals}
              filter={idBbGlobalFilter}
              onChange={setIdBbGlobalFilter}
              isOpen={openFilterId === "idBbGlobal"}
              onToggle={(open) => setOpenFilterId(open ? "idBbGlobal" : null)}
            />
          </SortableTh>
        );
      case "vendor":
        return (
          <SortableTh key={key} {...commonThProps("vendor")}>
            Vendor
          </SortableTh>
        );
      case "action":
        return (
          <SortableTh key={key} {...commonThProps("action")}>
            Action
          </SortableTh>
        );
      case "openDate":
        return (
          <SortableTh key={key} {...commonThProps("openDate")}>
            Open Date
          </SortableTh>
        );
      case "closeDate":
        return (
          <SortableTh key={key} {...commonThProps("closeDate")}>
            Close Date
          </SortableTh>
        );
      default:
        return null;
    }
  };

  // Body cell renderer per key + row.
  const renderCell = (key: string, row: ExceptionRow): React.ReactNode => {
    if (key.startsWith("rd:")) {
      const k = key.slice(3);
      const w = colWidths[key];
      const tdCls = ("dq-td-rd" + tdPinnedClass(key)).trim();
      const innerCls =
        "dq-td-rd-inner" + (w ? " dq-td-rd-inner-wrap" : "");
      return (
        <td key={key} className={tdCls} style={tdPinnedStyle(key)}>
          <div
            className={innerCls}
            style={w ? { maxWidth: w } : undefined}
          >
            {formatCell(row.resultData?.[k])}
          </div>
        </td>
      );
    }
    switch (key) {
      case "status":
        return (
          <td
            key={key}
            className={tdPinnedClass("status").trim()}
            style={tdPinnedStyle("status")}
          >
            <select
              className="dq-row-status-select"
              value={row.status}
              disabled={readOnly}
              onChange={(e) => {
                const next = e.target.value;
                // Read the sibling COMMENTS + SUPPRESS_DATE input
                // values from the same <tr> once. Their cells hold
                // draft state locally and only commit to the parent
                // via async round-trips, so row.comments /
                // row.suppressDate can lag behind what the operator
                // just typed. Reading the live DOM lets a freshly-
                // typed-but-not-yet-blurred value both (a) satisfy the
                // client-side guards below and (b) get bundled into
                // the status-change request so the backend applies
                // all three columns atomically inside SP_UPDATE_
                // EXCEPTION_STATUS — no race between the per-cell
                // commit and the status change.
                const trigger = e.currentTarget as HTMLElement;
                const tr = trigger.closest("tr");
                const commentInput = tr?.querySelector<HTMLInputElement>(
                  ".dq-row-comments-input"
                );
                const dateInput = tr?.querySelector<HTMLInputElement>(
                  ".dq-row-suppress-date-input"
                );
                const effectiveComments =
                  commentInput?.value ?? row.comments ?? "";
                const effectiveSuppress =
                  dateInput?.value ?? row.suppressDate ?? "";
                // Guard: can't move a row into "Suppress" without a
                // Suppress Date. Alert if the DOM value is blank too.
                if (next === "Suppress" && !effectiveSuppress) {
                  setAlertMessage(
                    "Please enter a Suppress Date before setting the status to Suppress."
                  );
                  return;
                }
                // Guard: any transition away from "New" (Accept /
                // Override / Hold / Suppress / Research / Challenge /
                // …) must carry a comment. Blank / null / whitespace-
                // only comments all fail. Server-side SP enforces the
                // same rule as a safety net.
                if (next !== "New" && effectiveComments.trim() === "") {
                  setAlertMessage(
                    "Please enter a comment before changing the status."
                  );
                  return;
                }
                onStatusChange?.(
                  row.exceptionId,
                  next,
                  effectiveComments,
                  effectiveSuppress
                );
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
        );
      case "suppressDate":
        return (
          <td
            key={key}
            className={
              ("dq-td-suppress-date" + tdPinnedClass("suppressDate")).trim()
            }
            style={tdPinnedStyle("suppressDate")}
          >
            <SuppressDateCell
              initialValue={row.suppressDate}
              readOnly={readOnly}
              onCommit={(next) => {
                if (next !== row.suppressDate) {
                  onSuppressDateChange?.(row.exceptionId, next);
                }
              }}
            />
          </td>
        );
      case "assignTo":
        return (
          <td
            key={key}
            className={tdPinnedClass("assignTo").trim()}
            style={tdPinnedStyle("assignTo")}
          >
            <select
              className="dq-assign-select"
              value={row.assignTo}
              disabled={readOnly}
              onChange={(e) => {
                const next = e.target.value;
                if (next !== row.assignTo) {
                  onAssignToChange?.(row.exceptionId, next);
                }
              }}
            >
              <option value="">Unassigned</option>
              {(assignToOptions ?? [])
                // Backend getDMUsers returns a literal "Unassigned"
                // DM_USER row alongside the real assignees. We already
                // render an empty-value "Unassigned" entry above, so
                // drop the backend duplicate to keep the dropdown from
                // showing two "Unassigned" rows.
                .filter((name) => name.trim().toLowerCase() !== "unassigned")
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              {row.assignTo &&
                !(assignToOptions ?? []).includes(row.assignTo) && (
                  <option value={row.assignTo}>{row.assignTo}</option>
                )}
            </select>
          </td>
        );
      case "comments":
        // In view-exception mode COMMENTS is the editable widget; in
        // view-security mode it collapses to a title-only text cell.
        if (showResultDataColumns) {
          return (
            <td
              key={key}
              className={
                ("dq-td-comments" + tdPinnedClass("comments")).trim()
              }
              style={tdPinnedStyle("comments")}
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
                  readOnly={readOnly}
                  onCommit={(next) => {
                    // Non-New rows require a non-blank comment (mirrors
                    // the per-row status-change guard above and the
                    // server-side SP_UPDATE_EXCEPTION_STATUS rule).
                    // Return false so CommentsCell reverts its local
                    // draft to the last committed value.
                    if (
                      row.status !== "New" &&
                      next.trim() === ""
                    ) {
                      setAlertMessage(
                        "Please enter a comment before changing the status."
                      );
                      return false;
                    }
                    if (next !== row.comments) {
                      onCommentsChange?.(row.exceptionId, next);
                    }
                    return true;
                  }}
                />
              </div>
            </td>
          );
        }
        return (
          <td
            key={key}
            className={tdPinnedClass("comments").trim()}
            style={tdPinnedStyle("comments")}
            title={row.comments}
          >
            {row.comments}
          </td>
        );
      case "dateTime":
        return (
          <td
            key={key}
            className={tdPinnedClass("dateTime").trim()}
            style={tdPinnedStyle("dateTime")}
          >
            {row.dateTime}
          </td>
        );
      case "priority":
        return (
          <td
            key={key}
            className={tdPinnedClass("priority").trim()}
            style={tdPinnedStyle("priority")}
          >
            {row.priority}
          </td>
        );
      case "ruleName":
        return (
          <td
            key={key}
            className={tdPinnedClass("ruleName").trim()}
            style={tdPinnedStyle("ruleName")}
          >
            {row.ruleName}
          </td>
        );
      case "issue":
        return (
          <td
            key={key}
            className={tdPinnedClass("issue").trim()}
            style={tdPinnedStyle("issue")}
          >
            {row.issue}
          </td>
        );
      case "aladdin":
        return (
          <td
            key={key}
            className={tdPinnedClass("aladdin").trim()}
            style={tdPinnedStyle("aladdin")}
          >
            {row.aladdin}
          </td>
        );
      case "idBbGlobal":
        return (
          <td
            key={key}
            className={tdPinnedClass("idBbGlobal").trim()}
            style={tdPinnedStyle("idBbGlobal")}
          >
            {row.idBbGlobal}
          </td>
        );
      case "vendor":
        return (
          <td
            key={key}
            className={tdPinnedClass("vendor").trim()}
            style={tdPinnedStyle("vendor")}
          >
            {row.vendor}
          </td>
        );
      case "action":
        return (
          <td
            key={key}
            className={tdPinnedClass("action").trim()}
            style={tdPinnedStyle("action")}
          >
            <span className={getActionClass(row.action)}>{row.action}</span>
          </td>
        );
      case "openDate":
        return (
          <td
            key={key}
            className={tdPinnedClass("openDate").trim()}
            style={tdPinnedStyle("openDate")}
          >
            {formatMdyDate(row.openDate)}
          </td>
        );
      case "closeDate":
        return (
          <td
            key={key}
            className={tdPinnedClass("closeDate").trim()}
            style={tdPinnedStyle("closeDate")}
          >
            {formatMdyDate(row.closeDate)}
          </td>
        );
      default:
        return null;
    }
  };

  const visibleKeys = columnOrder.filter((k) => !isHidden(k));

  // "Reset column order" appears only when the user has dragged a
  // column in the current session. Hide + pin + resize each have their
  // own in-grid affordance (Show all / Unpin / drag the resize handle),
  // and a persisted layout from a previous session is treated as the
  // baseline — not as an override waiting to be reset.
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
            {sortedRows.map((row, index) => {
              // Every row uses the default even-row background — the
              // green "complete" swatch (Accept / Override / Suppress /
              // STATE=Complete) has been retired at user request;
              // status is now conveyed only through the STATUS dropdown
              // value, not row color.
              const cls = "dq-table-row dq-table-row-even";
              return (
                <tr key={`${row.ruleName}-${index}`} className={cls}>
                  {visibleKeys.map((k) => renderCell(k, row))}
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
  readOnly = false,
}: {
  initialValue: string;
  // Returning false explicitly tells CommentsCell to reject the draft
  // and revert to `initialValue`. Any other return (true / undefined)
  // is treated as accepted. Used by the parent to enforce
  // "non-blank comment required on non-New status" without hoisting
  // the draft state.
  onCommit: (next: string) => boolean | void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<string>(initialValue);
  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);
  const commit = () => {
    if (readOnly) return;
    const result = onCommit(draft);
    if (result === false) {
      setDraft(initialValue);
    }
  };
  return (
    <input
      type="text"
      className="dq-row-comments-input"
      value={draft}
      maxLength={2048}
      title={draft}
      readOnly={readOnly}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// Per-row SUPPRESS_DATE cell. Controlled <input type="date"> whose value
// was previously bound directly to row.suppressDate reverted every user
// edit — React re-rendered before the backend refetch completed, so
// picker/typed segments never stuck. Keeping a local draft lets the
// picker commit immediately; onCommit fires on change (calendar picked a
// valid full date) and blur (typed value finished). Range-limited to
// [today, today + 2 years] — the native min/max attributes gray out
// out-of-range dates in the picker, and the commit guard rejects
// anything that slips through typing.
function SuppressDateCell({
  initialValue,
  onCommit,
  readOnly = false,
}: {
  initialValue: string;
  onCommit: (next: string) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<string>(initialValue);
  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);
  // Compute min/max in UTC to match the backend. SP_EXPIRE_SUPPRESS_
  // DATES compares SUPPRESS_DATE < CURRENT_DATE in UTC on every
  // GetExceptions call — computing min in local time would let a
  // late-evening operator pick a date that UTC already considers
  // yesterday, and the row would flip back to New on the next grid
  // refresh. Using UTC lines the picker's floor up with the SP.
  const iso = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const minDate = iso(today);
  const capDate = new Date(today);
  capDate.setUTCFullYear(capDate.getUTCFullYear() + 2);
  const maxDate = iso(capDate);
  const withinRange = (v: string) => v === "" || (v >= minDate && v <= maxDate);
  return (
    <input
      type="date"
      className={
        "dq-row-suppress-date-input" +
        (draft === "" ? " dq-row-suppress-date-input-empty" : "")
      }
      value={draft}
      min={minDate}
      max={maxDate}
      disabled={readOnly}
      onChange={(e) => {
        if (readOnly) return;
        const next = e.target.value;
        setDraft(next);
        if (withinRange(next) && next !== initialValue) onCommit(next);
      }}
      onBlur={() => {
        if (readOnly) return;
        if (!withinRange(draft)) {
          setDraft(initialValue);
          return;
        }
        if (draft !== initialValue) onCommit(draft);
      }}
    />
  );
}
