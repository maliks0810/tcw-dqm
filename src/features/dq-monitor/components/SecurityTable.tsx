import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SecurityRow } from "./types";

type SecurityTableProps = {
  data: SecurityRow[];
  selectedRow: number | null;
  onRowSelect: (index: number) => void;
  assigneeOptions: string[];
  onAssignToChange: (index: number, value: string) => void;
  blinkingAladdinId?: string | null;
};

const UNASSIGNED_LABEL = "— Unassigned —";

export default function SecurityTable({
  data,
  selectedRow,
  onRowSelect,
  assigneeOptions,
  onAssignToChange,
  blinkingAladdinId,
}: SecurityTableProps) {
  const allAssetIds = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.aladdinId).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [data]
  );

  const [assetIdFilter, setAssetIdFilter] = useState<Set<string> | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [draftSelection, setDraftSelection] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAssetIdFilter((current) => {
      if (current === null) return current;
      const cleaned = new Set<string>();
      current.forEach((id) => {
        if (allAssetIds.includes(id)) cleaned.add(id);
      });
      if (cleaned.size === 0) return null;
      if (cleaned.size === current.size) return current;
      return cleaned;
    });
  }, [allAssetIds]);

  useEffect(() => {
    if (!filterOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [filterOpen]);

  const openFilter = () => {
    setDraftSelection(new Set(assetIdFilter ?? allAssetIds));
    setFilterSearch("");
    setFilterOpen(true);
  };

  const visibleAssetIds = useMemo(() => {
    if (!filterSearch) return allAssetIds;
    const needle = filterSearch.toLowerCase();
    return allAssetIds.filter((id) => id.toLowerCase().includes(needle));
  }, [allAssetIds, filterSearch]);

  const allChecked =
    visibleAssetIds.length > 0 &&
    visibleAssetIds.every((id) => draftSelection.has(id));

  const toggleAll = () => {
    setDraftSelection((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const id of visibleAssetIds) next.delete(id);
      } else {
        for (const id of visibleAssetIds) next.add(id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setDraftSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyFilter = () => {
    if (draftSelection.size === 0 || draftSelection.size === allAssetIds.length) {
      setAssetIdFilter(null);
    } else {
      setAssetIdFilter(new Set(draftSelection));
    }
    setFilterOpen(false);
  };

  const clearFilter = () => {
    setAssetIdFilter(null);
    setDraftSelection(new Set(allAssetIds));
    setFilterOpen(false);
  };

  const filterActive = assetIdFilter !== null;

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
              <div className="dq-col-filter-wrap">
                <span>Asset Id</span>
                <button
                  type="button"
                  className={
                    "dq-col-filter-btn" +
                    (filterActive ? " dq-col-filter-btn-active" : "")
                  }
                  title={filterActive ? "Filter applied" : "Filter"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (filterOpen) setFilterOpen(false);
                    else openFilter();
                  }}
                >
                  ▾
                </button>
                {filterOpen && (
                  <div
                    ref={filterRef}
                    className="dq-col-filter-popover"
                    role="presentation"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      className="dq-col-filter-search"
                      type="text"
                      placeholder="Search…"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                    <label className="dq-col-filter-row dq-col-filter-row-all">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleAll}
                      />
                      (Select All)
                    </label>
                    <div className="dq-col-filter-list">
                      {visibleAssetIds.map((id) => (
                        <label key={id} className="dq-col-filter-row">
                          <input
                            type="checkbox"
                            checked={draftSelection.has(id)}
                            onChange={() => toggleOne(id)}
                          />
                          {id}
                        </label>
                      ))}
                      {visibleAssetIds.length === 0 && (
                        <div className="dq-col-filter-empty">No matches</div>
                      )}
                    </div>
                    <div className="dq-col-filter-actions">
                      <button type="button" onClick={clearFilter}>
                        Clear
                      </button>
                      <button
                        type="button"
                        className="dq-col-filter-apply"
                        onClick={applyFilter}
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </th>
            <th>FIGI</th>
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
