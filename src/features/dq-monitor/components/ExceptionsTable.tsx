import React from "react";
import type { ExceptionRow } from "./types";

type ExceptionsTableProps = {
  data: ExceptionRow[];
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

export default function ExceptionsTable({ data }: ExceptionsTableProps) {
  if (data.length === 0) {
    return (
      <div className="dq-empty-state">
        Select a security from the table above to view exceptions
      </div>
    );
  }

  return (
    <div className="dq-table-container">
      <table className="dq-table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Priority</th>
            <th>Rule Name</th>
            <th>Issue</th>
            <th>Aladdin</th>
            <th>Vendor</th>
            <th>Action</th>
            <th>Comments</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row, index) => (
            <tr key={`${row.ruleName}-${index}`} className="dq-table-row dq-table-row-even">
              <td>{row.dateTime}</td>
              <td>{row.priority}</td>
              <td>{row.ruleName}</td>
              <td>{row.issue}</td>
              <td>{row.aladdin}</td>
              <td>{row.vendor}</td>
              <td>
                <span className={getActionClass(row.action)}>{row.action}</span>
              </td>
              <td>{row.comments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}