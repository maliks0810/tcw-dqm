import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecurityRow } from "./types";
import ColumnFilterHeader, { useColumnFilter } from "./ColumnFilter";
import SortableTh, {
  compareValues,
  type SortState,
} from "./SortableTh";

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

  // Per-column width overrides driven by the right-edge drag handle.
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

  // ⋮ column-menu state: open-column + hidden set + single pinned column.
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

  const thMenuProps = (key: string) => ({
    menuOpen: openMenuColKey === key,
    onMenuToggle: (open: boolean) => setOpenMenuColKey(open ? key : null),
    onSortDir: (dir: "asc" | "desc") => setSortDir(key, dir),
    onHide: () => hideCol(key),
    pinned: isPinned(key),
    onTogglePin: () => togglePinCol(key),
  });
  const tdPinnedClass = (key: string) => (isPinned(key) ? " dq-td-pinned" : "");

  const commonThProps = (key: string) => ({
    colKey: key,
    sort,
    onSort: toggleSort,
    width: colWidths[key],
    onStartResize: startResize,
    ...thMenuProps(key),
  });

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
            {!isHidden("actions") && (
              <SortableTh {...commonThProps("actions")}>Actions</SortableTh>
            )}
            {!isHidden("dateTime") && (
              <SortableTh {...commonThProps("dateTime")}>Date/Time</SortableTh>
            )}
            {!isHidden("priority") && (
              <SortableTh {...commonThProps("priority")}>
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
            {!isHidden("severity") && (
              <SortableTh {...commonThProps("severity")}>
                <ColumnFilterHeader
                  label="Severity"
                  allValues={allSeverities}
                  filter={severityFilter}
                  onChange={setSeverityFilter}
                  isOpen={openFilterId === "severity"}
                  onToggle={(open) =>
                    setOpenFilterId(open ? "severity" : null)
                  }
                />
              </SortableTh>
            )}
            {!isHidden("type") && (
              <SortableTh {...commonThProps("type")}>Type</SortableTh>
            )}
            {!isHidden("assignTo") && (
              <SortableTh {...commonThProps("assignTo")}>Assign To</SortableTh>
            )}
            {!isHidden("assetId") && (
              <SortableTh {...commonThProps("assetId")}>
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
            {!isHidden("figi") && (
              <SortableTh {...commonThProps("figi")}>
                <ColumnFilterHeader
                  label="FIGI"
                  allValues={allFigis}
                  filter={figiFilter}
                  onChange={setFigiFilter}
                  isOpen={openFilterId === "figi"}
                  onToggle={(open) => setOpenFilterId(open ? "figi" : null)}
                />
              </SortableTh>
            )}
            {!isHidden("securityDescription") && (
              <SortableTh {...commonThProps("securityDescription")}>
                Security Description
              </SortableTh>
            )}
            {!isHidden("trader") && (
              <SortableTh {...commonThProps("trader")}>Trader</SortableTh>
            )}
            {!isHidden("tradingTeam") && (
              <SortableTh {...commonThProps("tradingTeam")}>
                Trading Team
              </SortableTh>
            )}
            {!isHidden("exceptionCount") && (
              <SortableTh {...commonThProps("exceptionCount")}>
                Exception Count
              </SortableTh>
            )}
            {!isHidden("bbgLastRefresh") && (
              <SortableTh {...commonThProps("bbgLastRefresh")}>
                BBG Last Refresh
              </SortableTh>
            )}
            {!isHidden("triggerBbg") && (
              <SortableTh {...commonThProps("triggerBbg")}>
                Trigger BBG
              </SortableTh>
            )}
          </tr>
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
                {!isHidden("actions") && (
                  <td className={tdPinnedClass("actions").trim()}>
                    {row.type === "Security Setup" && onAction && (
                      <ActionSelect
                        assetId={row.aladdinId}
                        idBbGlobal={row.figi ?? ""}
                        shown={actionByAsset?.[row.aladdinId] ?? ""}
                        setShown={
                          onActionShownChange ?? (() => undefined)
                        }
                        onAction={onAction}
                      />
                    )}
                  </td>
                )}
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
                {!isHidden("severity") && (
                  <td className={tdPinnedClass("severity").trim()}>
                    {row.severity}
                  </td>
                )}
                {!isHidden("type") && (
                  <td className={tdPinnedClass("type").trim()}>{row.type}</td>
                )}
                {!isHidden("assignTo") && (
                  <td className={tdPinnedClass("assignTo").trim()}>
                    <select
                      className="dq-assign-select"
                      value={currentAssignee}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onAssignToChange(index, e.target.value)}
                    >
                      <option value="">{UNASSIGNED_LABEL}</option>
                      {options.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                {!isHidden("assetId") && (
                  <td className={tdPinnedClass("assetId").trim()}>
                    {row.aladdinId}
                  </td>
                )}
                {!isHidden("figi") && (
                  <td className={tdPinnedClass("figi").trim()}>{row.figi}</td>
                )}
                {!isHidden("securityDescription") && (
                  <td className={tdPinnedClass("securityDescription").trim()}>
                    {row.securityDescription}
                  </td>
                )}
                {!isHidden("trader") && (
                  <td className={tdPinnedClass("trader").trim()}>
                    {row.trader}
                  </td>
                )}
                {!isHidden("tradingTeam") && (
                  <td className={tdPinnedClass("tradingTeam").trim()}>
                    {row.tradingTeam}
                  </td>
                )}
                {!isHidden("exceptionCount") && (
                  <td className={tdPinnedClass("exceptionCount").trim()}>
                    {row.exceptionCount}
                  </td>
                )}
                {!isHidden("bbgLastRefresh") && (
                  <td className={tdPinnedClass("bbgLastRefresh").trim()}>
                    {row.bbgLastRefresh}
                  </td>
                )}
                {!isHidden("triggerBbg") && (
                  <td className={tdPinnedClass("triggerBbg").trim()}>
                    <input type="checkbox" checked={row.triggerBbg} readOnly />
                  </td>
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
