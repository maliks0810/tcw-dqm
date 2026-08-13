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
  // Returns void OR a Promise the caller can await. When a Promise
  // is returned, the child paints a wait cursor over the grid from
  // the moment the change fires until the Promise settles — so the
  // operator sees the async round-trip actually running instead of
  // an apparently-frozen grid.
  onStatusChange?: (
    exceptionId: number,
    status: string,
    comments: string,
    suppressDate: string
  ) => void | Promise<void>;
  showCommentsColumn?: boolean;
  onCommentsChange?: (exceptionId: number, comments: string) => void;
  showSuppressDateColumn?: boolean;
  onSuppressDateChange?: (exceptionId: number, suppressDate: string) => void;
  showAssignToColumn?: boolean;
  assignToOptions?: string[];
  // Returns void OR a Promise the caller can await. Same wait-cursor
  // and sticky-highlight treatment as onStatusChange: when a Promise
  // is returned, the child paints the wait cursor from the moment the
  // change fires until the Promise settles, and marks the row as the
  // last-changed row for a persistent hover swatch after the refetch.
  onAssignToChange?: (
    exceptionId: number,
    assignTo: string
  ) => void | Promise<void>;
  // When true, the Assign To column stays visible but the per-row
  // <select> collapses to a plain text cell — no dropdown, no
  // change event. Set by DqMonitorPage when the current operator's
  // DM role is anything other than DM_ADMIN. Independent of the
  // whole-grid `readOnly` prop (that one also freezes Status /
  // Comments / Suppress Date for historical-date views).
  assignToReadOnly?: boolean;
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
  // Fires whenever the visible column layout shifts — the user
  // drag-reorders (hasReordered flips), hides/shows a column, or
  // the underlying RD keys change with new data. Parent uses this
  // to (a) know when to surface the "Save Column Order" affordance
  // (hasReordered) and (b) grab the current display labels to
  // persist. Labels are the user-visible names ("Rule Name",
  // "Suppress Date", the raw JSON key for rd:* columns), not the
  // internal grid keys.
  onColumnLayoutChange?: (info: {
    hasReordered: boolean;
    visibleLabels: string[];
  }) => void;
  // Increment-only nonce the parent bumps when it wants the grid to
  // treat the current column layout as the new "committed" baseline
  // — flips hasReordered back to false so the Save Column Order
  // button retracts. Used by the post-save modal's OK handler.
  resetReorderSignal?: number;
  // Server-loaded column layout for the current (user, group,
  // catalog) scope. Passed as an ordered array of user-visible
  // labels — same encoding onColumnLayoutChange emits. Semantics:
  //   undefined — parent hasn't fetched yet; grid uses canonical
  //               default order.
  //   null      — fetch resolved to "no saved layout"; grid uses
  //               canonical default order (identical to undefined
  //               today, but retained so callers can express the
  //               distinction).
  //   string[]  — fetched layout to apply verbatim. Unknown labels
  //               are dropped (via keyForLabel + availableKeys); any
  //               canonical key not in the saved list is appended at
  //               the tail so a schema addition since the save
  //               doesn't hide new columns. hasReordered is reset to
  //               false — this array IS the committed baseline.
  preferredColumnOrder?: string[] | null;
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

// Internal-key → display-label map for every non-rd:* column the
// grid can render. Kept in sync with renderHeader's switch below.
// rd:* keys use their raw JSON key as the label — that's what the
// header actually shows via <ColumnFilterHeader label={k} />.
// Used by labelForKey when the parent asks for the current column
// layout as user-visible names (Save Column Order flow).
const KEY_LABELS: Record<string, string> = {
  status: "Status",
  suppressDate: "Suppress Date",
  assignTo: "Assign To",
  comments: "Comments",
  dateTime: "Date/Time",
  priority: "Priority",
  ruleName: "Rule Name",
  issue: "Issue",
  aladdin: "Asset Id",
  idBbGlobal: "ID BB Global",
  vendor: "Vendor",
  action: "Action",
  openDate: "Open Date",
  closeDate: "Close Date",
};

function labelForKey(key: string): string {
  if (key.startsWith("rd:")) return key.slice(3);
  return KEY_LABELS[key] ?? key;
}

// Inverse of labelForKey — translates a saved label back to an
// internal column key. Consults availableKeys so a stale saved label
// that no longer corresponds to any real column (e.g., a RESULT_DATA
// key from a different catalog) is dropped rather than silently
// creating a phantom column entry. Static labels map directly via
// KEY_LABELS; anything else is assumed to be a raw RESULT_DATA JSON
// key and returned as "rd:<label>" iff the grid actually carries it.
// Returns "" when the label can't be resolved to a live key.
const LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(KEY_LABELS).map(([k, v]) => [v, k])
);
function keyForLabel(label: string, availableKeys: Set<string>): string {
  const direct = LABEL_TO_KEY[label];
  if (direct && availableKeys.has(direct)) return direct;
  const rdKey = `rd:${label}`;
  if (availableKeys.has(rdKey)) return rdKey;
  return "";
}

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
  assignToReadOnly = false,
  priorityRdKeys,
  readOnly = false,
  showLifecycleColumns = false,
  onColumnLayoutChange,
  resetReorderSignal,
  preferredColumnOrder,
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

  // True after the user drops a column onto another in the current
  // session. Persistence layer never touches it, so
  // a fresh page load always starts false — the Reset chip stays
  // hidden until the user actively drags.
  const [hasReordered, setHasReordered] = useState<boolean>(false);

  // Parent bumps resetReorderSignal after a successful column-order
  // save (see the OK handler of the save modal in DqMonitorPage) —
  // treat the current layout as the new committed baseline and drop
  // the "dirty" flag so the Save Column Order button retracts.
  // Undefined signal is the initial mount value; the ref lets us
  // observe strict increments only.
  const lastResetReorderSignal = useRef<number | undefined>(
    resetReorderSignal
  );
  useEffect(() => {
    if (resetReorderSignal === lastResetReorderSignal.current) return;
    lastResetReorderSignal.current = resetReorderSignal;
    setHasReordered(false);
  }, [resetReorderSignal]);

  // Apply a server-loaded column layout when it arrives (or changes,
  // e.g., operator picked a different LHS scope). Translates the
  // saved labels back to internal keys via keyForLabel, drops labels
  // that don't correspond to any live column in the current
  // canonicalKeys, and appends any canonical keys the saved layout
  // didn't cover (schema-additions since the save) at the tail so
  // new columns never silently disappear. hasReordered is reset to
  // false — the loaded layout is the new committed baseline.
  //
  // Gated on preferredColumnOrder identity (via lastAppliedPreferred-
  // Ref), NOT on canonicalKeys — otherwise every data refresh
  // re-derives canonicalKeys and would re-clobber any in-session
  // drag with the server layout. The canonicalKeys-reconcile effect
  // above handles new keys appearing async by appending them at the
  // tail; this effect just seeds/re-seeds the layout when the parent
  // literally hands us a different preferredColumnOrder value.
  const lastAppliedPreferredRef = useRef<
    string[] | null | undefined
  >(undefined);
  useEffect(() => {
    if (preferredColumnOrder === lastAppliedPreferredRef.current) return;
    lastAppliedPreferredRef.current = preferredColumnOrder;

    // undefined = parent hasn't resolved a fetch for this scope yet
    // (still loading). Leave columnOrder alone — either the initial
    // hydrate value or the previously-applied preference stays put
    // until the fetch settles.
    if (preferredColumnOrder === undefined) return;

    // null = fetched and no saved layout for this scope. Reset to
    // canonical default with static pinning so switching from a
    // scope with a saved layout to a scope without one doesn't
    // leave the prior scope's order lingering on the grid.
    if (preferredColumnOrder === null) {
      setColumnOrder(
        pinStaticsToCanonicalOrder([...canonicalKeys], canonicalKeys)
      );
      setHasReordered(false);
      return;
    }

    // Empty array — treat as "no preference" (shouldn't happen since
    // the service returns null for empty strings, but defensively
    // handle it the same way).
    if (preferredColumnOrder.length === 0) {
      setColumnOrder(
        pinStaticsToCanonicalOrder([...canonicalKeys], canonicalKeys)
      );
      setHasReordered(false);
      return;
    }

    // Saved layout exists — apply it STRICTLY in the JSON order. No
    // static pinning; the operator's ordering wins verbatim. Any
    // canonical key the saved layout doesn't cover (schema addition
    // since the save) is appended at the tail so new columns never
    // vanish. hasReordered is reset — the loaded layout IS the new
    // committed baseline.
    const available = new Set(canonicalKeys);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const label of preferredColumnOrder) {
      const k = keyForLabel(label, available);
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
    for (const k of canonicalKeys) {
      if (!seen.has(k)) out.push(k);
    }
    setColumnOrder(out);
    setHasReordered(false);
  }, [preferredColumnOrder, canonicalKeys]);

  useEffect(() => {
    setColumnOrder((prev) => {
      const set = new Set(canonicalKeys);
      const kept = prev.filter((k) => set.has(k));
      const missing = canonicalKeys.filter((k) => !kept.includes(k));
      // Do NOT re-pin statics here — the operator (or a loaded
      // server preference) may have deliberately placed Status /
      // Suppress Date / Assign To / Comments / Open Date / Close
      // Date somewhere non-default, and the reconcile path must not
      // wipe that. Initial-hydrate below still passes through
      // pinStaticsToCanonicalOrder for the "no history" case; the
      // drag path already accepts any drop; and the save/load
      // round-trip persists whatever the operator committed. New
      // keys arriving async (extraKeys) just append at the tail.
      const next = [...kept, ...missing];
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

  // Per-row pending STATUS selection. The dropdown holds the operator's
  // pick locally until row-blur (focus leaves the <tr>), at which point
  // commitRowStatusChange runs the client-side validation guards and
  // fires onStatusChange bundled with the current comment + suppress
  // date. Deferring the guard means the operator can pick "Accept"
  // and *then* type a comment without the alert firing on the
  // selection itself — the alert only fires on tab-out / click-away
  // if the comment / suppress-date is still missing.
  const [pendingRowStatus, setPendingRowStatus] = useState<
    Record<number, string>
  >({});

  // Sticky highlight for the last row whose status was successfully
  // committed. Paints the row in the same swatch the mouse-hover
  // rule uses so the operator can see "which row did I just change?"
  // after the async refetch snaps the table back to its data. Cleared
  // when the operator hovers any other row (see <tr onMouseEnter>).
  const [lastChangedRowId, setLastChangedRowId] = useState<number | null>(
    null
  );

  // isCommittingRow goes true from the moment a valid per-row commit
  // (STATUS or ASSIGN TO) fires its callback until the returned
  // Promise settles. When true, the grid picks up a wait cursor via
  // .dq-table-committing so the async round-trip is visible to the
  // operator instead of an apparently-frozen grid. Void returns leave
  // isCommittingRow false — no observable in-flight window.
  const [isCommittingRow, setIsCommittingRow] = useState<boolean>(false);

  // Shared side-effect for any per-row commit (STATUS + ASSIGN TO).
  // Sets the sticky-highlight marker to this row so the operator can
  // spot it after the refetch, and tracks the returned Promise so
  // .dq-table-committing paints a wait cursor until the async chain
  // settles. Promise.resolve() normalizes void / Promise<void>.
  const trackRowCommit = useCallback(
    (rowId: number, maybePromise: void | Promise<void>) => {
      setLastChangedRowId(rowId);
      if (maybePromise) {
        setIsCommittingRow(true);
        Promise.resolve(maybePromise).finally(() => {
          setIsCommittingRow(false);
        });
      }
    },
    []
  );

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

  // Notify parent when the visible column layout shifts — parent
  // uses this to gate the Save Column Order button (hasReordered)
  // and to grab the current display labels for persistence. Fires
  // on every columnOrder / hiddenCols / hasReordered change and
  // once on mount so the parent sees the initial layout.
  useEffect(() => {
    if (!onColumnLayoutChange) return;
    const labels = columnOrder
      .filter((k) => !hiddenCols.has(k))
      .map(labelForKey);
    onColumnLayoutChange({ hasReordered, visibleLabels: labels });
  }, [columnOrder, hiddenCols, hasReordered, onColumnLayoutChange]);

  // Commit a row's pending status change when focus leaves the <tr>.
  // Runs the same validation the old inline-onChange guards ran, but
  // deferred to row-blur so operators can pick a status and *then*
  // enter a comment / suppress date in the same row without the alert
  // firing on the selection itself. On failure, alerts and reverts
  // the dropdown by clearing the pending entry. On success, fires
  // onStatusChange bundled with the sibling comment + suppress date
  // (read from the DOM so a freshly-typed-but-not-yet-blurred value
  // still counts). Row-blur is detected via <tr onBlur> with a
  // relatedTarget check — tabbing between cells inside the same row
  // is not a commit.
  const commitRowStatusChange = useCallback(
    (row: ExceptionRow, trEl: HTMLElement) => {
      const next = pendingRowStatus[row.exceptionId];
      if (next == null || next === row.status) return;

      const commentInput = trEl.querySelector<HTMLInputElement>(
        ".dq-row-comments-input"
      );
      const dateInput = trEl.querySelector<HTMLInputElement>(
        ".dq-row-suppress-date-input"
      );
      const effectiveComments =
        commentInput?.value ?? row.comments ?? "";
      const effectiveSuppress =
        dateInput?.value ?? row.suppressDate ?? "";

      if (next === "Suppress" && !effectiveSuppress) {
        setAlertMessage(
          "Please enter a Suppress Date before setting the status to Suppress."
        );
        setPendingRowStatus((prev) => {
          const copy = { ...prev };
          delete copy[row.exceptionId];
          return copy;
        });
        return;
      }
      if (next !== "New" && effectiveComments.trim() === "") {
        setAlertMessage(
          "Please enter a comment before changing the status."
        );
        setPendingRowStatus((prev) => {
          const copy = { ...prev };
          delete copy[row.exceptionId];
          return copy;
        });
        return;
      }

      const maybePromise = onStatusChange?.(
        row.exceptionId,
        next,
        effectiveComments,
        effectiveSuppress
      );
      setPendingRowStatus((prev) => {
        const copy = { ...prev };
        delete copy[row.exceptionId];
        return copy;
      });
      trackRowCommit(row.exceptionId, maybePromise ?? undefined);
    },
    [pendingRowStatus, onStatusChange, trackRowCommit]
  );

  // Early-commit variant fired when a supporting field (Comments,
  // Suppress Date) blurs WHILE focus stays inside the row. Silent —
  // no alerts on failed validation; the intent is "commit as soon as
  // enough data is present, else defer to row-blur which handles the
  // alert path." sourceField gates the trigger on the just-blurred
  // field being populated (per user requirement: only commit on
  // Comments-blur when comments non-blank; only on SuppressDate-blur
  // when date populated).
  const tryCommitRowStatusChange = useCallback(
    (
      row: ExceptionRow,
      trEl: HTMLElement,
      sourceField: "comments" | "suppressDate"
    ) => {
      const next = pendingRowStatus[row.exceptionId];
      if (next == null || next === row.status) return;

      const commentInput = trEl.querySelector<HTMLInputElement>(
        ".dq-row-comments-input"
      );
      const dateInput = trEl.querySelector<HTMLInputElement>(
        ".dq-row-suppress-date-input"
      );
      const effectiveComments =
        commentInput?.value ?? row.comments ?? "";
      const effectiveSuppress =
        dateInput?.value ?? row.suppressDate ?? "";

      // Source-field readiness — required by the user's spec.
      if (sourceField === "comments" && effectiveComments.trim() === "") {
        return;
      }
      if (sourceField === "suppressDate" && !effectiveSuppress) {
        return;
      }

      // Full validation, silent: don't alert here — row-blur runs
      // commitRowStatusChange which surfaces the alert if the row
      // never becomes valid.
      if (next === "Suppress" && !effectiveSuppress) return;
      if (next !== "New" && effectiveComments.trim() === "") return;

      const maybePromise = onStatusChange?.(
        row.exceptionId,
        next,
        effectiveComments,
        effectiveSuppress
      );
      setPendingRowStatus((prev) => {
        const copy = { ...prev };
        delete copy[row.exceptionId];
        return copy;
      });
      trackRowCommit(row.exceptionId, maybePromise ?? undefined);
    },
    [pendingRowStatus, onStatusChange, trackRowCommit]
  );

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
              value={pendingRowStatus[row.exceptionId] ?? row.status}
              disabled={readOnly}
              onChange={(e) => {
                // Deferred commit: hold the pick in pendingRowStatus
                // and let commitRowStatusChange fire (with validation
                // + comment/suppress-date bundling) when focus leaves
                // the row. See the pendingRowStatus / <tr onBlur>
                // wiring for the full flow.
                const next = e.target.value;
                setPendingRowStatus((prev) => ({
                  ...prev,
                  [row.exceptionId]: next,
                }));
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
                // If a status pick is pending, the row-level
                // tryCommitRowStatusChange (fired on this same blur
                // via <tr onBlur>) will bundle the new suppress date
                // into a single SP_UPDATE_EXCEPTION_STATUS PATCH.
                // Skip the standalone SP_UPDATE_EXCEPTION_SUPPRESS_
                // DATE round-trip here to avoid a doubled backend
                // call for the same field-blur.
                if (pendingRowStatus[row.exceptionId] != null) return;
                if (next !== row.suppressDate) {
                  onSuppressDateChange?.(row.exceptionId, next);
                }
              }}
            />
          </td>
        );
      case "assignTo":
        // assignToReadOnly (non-admin operator) or the whole-grid
        // readOnly (historical date view) collapse the dropdown to
        // a plain text cell. Empty string renders as "Unassigned"
        // for parity with the widget's empty option label.
        if (assignToReadOnly || readOnly) {
          return (
            <td
              key={key}
              className={tdPinnedClass("assignTo").trim()}
              style={tdPinnedStyle("assignTo")}
            >
              {row.assignTo || "Unassigned"}
            </td>
          );
        }
        return (
          <td
            key={key}
            className={tdPinnedClass("assignTo").trim()}
            style={tdPinnedStyle("assignTo")}
          >
            <select
              className="dq-assign-select"
              value={row.assignTo}
              onChange={(e) => {
                const next = e.target.value;
                if (next !== row.assignTo) {
                  // Same treatment as commitRowStatusChange:
                  // trackRowCommit marks the row as last-changed
                  // (sticky hover) AND, if the callback returns a
                  // Promise, paints a wait cursor over the grid
                  // until settlement.
                  const maybePromise = onAssignToChange?.(
                    row.exceptionId,
                    next
                  );
                  trackRowCommit(row.exceptionId, maybePromise ?? undefined);
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
                    // If a status pick is pending, the row-level
                    // tryCommitRowStatusChange (fired on this same
                    // blur via <tr onBlur>) will bundle the new
                    // comment into a single SP_UPDATE_EXCEPTION_
                    // STATUS PATCH. Skip the standalone SP_UPDATE_
                    // EXCEPTION_COMMENTS round-trip to avoid a
                    // doubled backend call. The status-commit path
                    // is the sole enforcer of "non-New status
                    // requires comment" — CommentsCell no longer
                    // second-guesses blank edits, so blanking a
                    // comment on a row whose committed status is
                    // non-New goes through unchallenged (matches
                    // user expectation: editing a comment on a New
                    // row must never alert).
                    if (pendingRowStatus[row.exceptionId] != null) {
                      return true;
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

  // Top bar surfaces only the "N columns hidden" chip + Show all
  // affordance. The reordered-state indicator + Reset button were
  // removed at user request — operators can freely drag statics and
  // rd:* columns to any position (default canonical order applies
  // only on a fresh session with no saved USER_PREFERENCES row),
  // and the header Save Column Order button already surfaces the
  // "you have uncommitted drags" state.
  const showTopBar = hiddenCols.size > 0;

  return (
    <div className="dq-exceptions-wrap">
      {showTopBar && (
        <div className="dq-hidden-cols-bar">
          <span>
            {hiddenCols.size} column
            {hiddenCols.size === 1 ? "" : "s"} hidden
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
      <div
        className={
          "dq-table-container" +
          (isCommittingRow ? " dq-table-committing" : "")
        }
      >
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
              const isLastChanged = row.exceptionId === lastChangedRowId;
              const cls =
                "dq-table-row dq-table-row-even" +
                (isLastChanged ? " dq-table-row-just-changed" : "");
              return (
                <tr
                  key={`${row.ruleName}-${index}`}
                  className={cls}
                  onMouseEnter={() => {
                    // Clear the sticky highlight the moment the
                    // operator moves the mouse to a different row —
                    // the highlight has done its job (told the eye
                    // where the just-committed change lives) and
                    // shouldn't shadow-track hovers after that.
                    if (
                      lastChangedRowId !== null &&
                      lastChangedRowId !== row.exceptionId
                    ) {
                      setLastChangedRowId(null);
                    }
                  }}
                  onBlur={(e) => {
                    // React's synthetic onBlur bubbles from any child
                    // field. Two commit paths depending on where focus
                    // lands next:
                    //   1. Focus leaves the row entirely → run the
                    //      full commit (alerts on failed validation).
                    //   2. Focus stays in the row AND the just-blurred
                    //      field is Comments or Suppress Date → run
                    //      the silent early-commit (fires only when
                    //      the source field is populated and full
                    //      validation passes). Lets the operator tab
                    //      status → comment → next cell and see the
                    //      status commit AT the comment-blur boundary
                    //      instead of waiting for the row-blur.
                    const tr = e.currentTarget;
                    const nextFocus = e.relatedTarget as Node | null;
                    const leftRow =
                      !nextFocus || !tr.contains(nextFocus);
                    if (leftRow) {
                      commitRowStatusChange(row, tr);
                      return;
                    }
                    const source = e.target as HTMLElement;
                    if (
                      source &&
                      source.classList &&
                      source.classList.contains("dq-row-comments-input")
                    ) {
                      tryCommitRowStatusChange(row, tr, "comments");
                    } else if (
                      source &&
                      source.classList &&
                      source.classList.contains(
                        "dq-row-suppress-date-input"
                      )
                    ) {
                      tryCommitRowStatusChange(row, tr, "suppressDate");
                    }
                  }}
                >
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
