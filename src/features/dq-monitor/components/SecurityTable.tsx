import React from "react";
import type { SecurityRow } from "./types";

type SecurityTableProps = {
  data: SecurityRow[];
  selectedRow: number | null;
  onRowSelect: (index: number) => void;
};

function getPriorityClass(priority: string): string {
  switch (priority.toLowerCase()) {
    case "high":
      return "dq-badge dq-badge-red";
    case "medium":
      return "dq-badge dq-badge-yellow";
    case "low":
      return "dq-badge dq-badge-green";
    default:
      return "dq-badge dq-badge-gray";
  }
}

export default function SecurityTable({
  data,
  selectedRow,
  onRowSelect,
}: SecurityTableProps) {
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
            <th>Aladdin ID</th>
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
          {data.map((row, index) => (
            <tr
              key={`${row.aladdinId}-${index}`}
              onClick={() => onRowSelect(index)}
              className={[
                "dq-table-row",
                selectedRow === index
                  ? "dq-table-row-selected"
                  : index % 2 === 0
                  ? "dq-table-row-even"
                  : "dq-table-row-odd",
              ].join(" ")}
            >
              <td>{row.dateTime}</td>
              <td>
                <span className={getPriorityClass(row.priority)}>{row.priority}</span>
              </td>
              <td>{row.severity}</td>
              <td>{row.type}</td>
              <td>{row.assignTo}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}