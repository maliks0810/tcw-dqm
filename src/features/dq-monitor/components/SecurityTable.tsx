import React, { useEffect, useMemo, useState } from "react";
import type { SecurityRow } from "./types";
import ColumnFilterHeader, { useColumnFilter } from "./ColumnFilter";

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

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [visibleRows, onVisibleRowsChange]);

  return (
    <div className="dq-table-container">
      <table className="dq-table">
        <thead>
          <tr>
            <th>Actions</th>
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
                label="Severity"
                allValues={allSeverities}
                filter={severityFilter}
                onChange={setSeverityFilter}
                isOpen={openFilterId === "severity"}
                onToggle={(open) =>
                  setOpenFilterId(open ? "severity" : null)
                }
              />
            </th>
            <th>Type</th>
            <th>Assign To</th>
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
                label="FIGI"
                allValues={allFigis}
                filter={figiFilter}
                onChange={setFigiFilter}
                isOpen={openFilterId === "figi"}
                onToggle={(open) => setOpenFilterId(open ? "figi" : null)}
              />
            </th>
            <th>Security Description</th>
            <th>Trader</th>
            <th>Trading Team</th>
            <th>Exception Count</th>
            <th>BBG Last Refresh</th>
            <th>Trigger BBG</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row, index) => {
            if (assetIdFilter && !assetIdFilter.has(row.aladdinId)) return null;
            if (figiFilter && !figiFilter.has(row.figi ?? "")) return null;
            if (priorityFilter && !priorityFilter.has(row.priority)) return null;
            if (severityFilter && !severityFilter.has(row.severity)) return null;

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
                    : row.priority === "High"
                    ? "dq-table-row-high"
                    : index % 2 === 0
                    ? "dq-table-row-even"
                    : "dq-table-row-odd",
                  isBlinking ? "dq-table-row-blinking" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td>
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
                <td>{row.dateTime}</td>
                <td>{row.priority}</td>
                <td>{row.severity}</td>
                <td>{row.type}</td>
                <td>
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
                <td>{row.aladdinId}</td>
                <td>{row.figi}</td>
                <td>{row.securityDescription}</td>
                <td>{row.trader}</td>
                <td>{row.tradingTeam}</td>
                <td>{row.exceptionCount}</td>
                <td>{row.bbgLastRefresh}</td>
                <td>
                  <input type="checkbox" checked={row.triggerBbg} readOnly />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
