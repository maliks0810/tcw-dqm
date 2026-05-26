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
};

const UNASSIGNED_LABEL = "— Unassigned —";

export default function SecurityTable({
  data,
  selectedRow,
  onRowSelect,
  assigneeOptions,
  onAssignToChange,
  blinkingAladdinId,
  onVisibleRowsChange,
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

  const [assetIdFilter, setAssetIdFilter] = useColumnFilter(allAssetIds);
  const [figiFilter, setFigiFilter] = useColumnFilter(allFigis);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  const visibleRows = useMemo(
    () =>
      data.filter((row) => {
        if (assetIdFilter && !assetIdFilter.has(row.aladdinId)) return false;
        if (figiFilter && !figiFilter.has(row.figi ?? "")) return false;
        return true;
      }),
    [data, assetIdFilter, figiFilter]
  );

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [visibleRows, onVisibleRowsChange]);

  return (
    <div className="dq-table-container">
      <table className="dq-table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Priority</th>
            <th>Severity</th>
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
