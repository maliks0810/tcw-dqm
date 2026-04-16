import React, { useState } from "react";
import Header from "../components/Header";
import SecurityTable from "../components/SecurityTable";
import ExceptionsTable from "../components/ExceptionsTable";
import type { SecurityRow } from "../components/types";
import "../styles/dq-monitor.css";

const sampleData: SecurityRow[] = [
  {
    dateTime: "3/18/26 12:59",
    priority: "High",
    severity: "Trading",
    type: "Security Setup",
    assignTo: "Jake Rigney",
    aladdinId: "46620JAA9",
    figi: "BBG00G6M2LZ2",
    securityDescription: "HENDR 2017-1A",
    trader: "Colman Slain",
    tradingTeam: "ABS",
    exceptionCount: 7,
    bbgLastRefresh: "10:55 AM",
    triggerBbg: false,
    exceptions: [
      {
        dateTime: "10:55 AM",
        priority: "Trading",
        ruleName: "BBG Difference",
        issue: "Security Group Difference",
        aladdin: "CMBS/SENIOR",
        vendor: "CMBS/SUB",
        action: "Update Aladdin",
        comments: "",
      },
      {
        dateTime: "10:55 AM",
        priority: "Trading",
        ruleName: "BBG Difference",
        issue: "Ticker Difference",
        aladdin: "PROG_22-SFR1-H",
        vendor: "PROG_22SFR1H",
        action: "Update Aladdin",
        comments: "",
      },
      {
        dateTime: "10:55 AM",
        priority: "Trading",
        ruleName: "BBG Difference",
        issue: "Maturity Date Difference",
        aladdin: "2/18/41",
        vendor: "2/17/41",
        action: "Update Aladdin",
        comments: "",
      },
      {
        dateTime: "10:55 AM",
        priority: "Trading",
        ruleName: "BBG Difference",
        issue: "REMIC TYPE Difference",
        aladdin: "None",
        vendor: "Y",
        action: "Update Aladdin",
        comments: "",
      },
      {
        dateTime: "10:55 AM",
        priority: "Trading",
        ruleName: "Null Review",
        issue: "SEC12D1-4",
        aladdin: "Null",
        vendor: "Null",
        action: "Update Aladdin",
        comments: "Review Prospectus",
      },
      {
        dateTime: "10:55 AM",
        priority: "Trading",
        ruleName: "Quality Rule",
        issue: "Seniority vs Security Group",
        aladdin: "Senior",
        vendor: "Senior",
        action: "Pending",
        comments: "",
      },
      {
        dateTime: "10:55 AM",
        priority: "Trading",
        ruleName: "CMBS STATE",
        issue: "CMBS STATE does not add up to 100%",
        aladdin: "",
        vendor: "90",
        action: "Update SDMA",
        comments: "",
      },
    ],
  },
];

export default function DqMonitorPage() {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const selectedExceptions =
    selectedRow !== null ? sampleData[selectedRow].exceptions : [];

  return (
    <div className="dq-page">
      <Header />

      <section className="dq-section">
        <h2 className="dq-section-title">Security Exceptions</h2>
        <SecurityTable
          data={sampleData}
          selectedRow={selectedRow}
          onRowSelect={setSelectedRow}
        />
      </section>

      <section className="dq-section">
        <h2 className="dq-section-title">Exceptions</h2>

        {selectedRow !== null && (
          <div className="dq-section-subtitle">
            {sampleData[selectedRow].securityDescription} —{" "}
            {sampleData[selectedRow].aladdinId} ({selectedExceptions.length} exceptions)
          </div>
        )}

        <ExceptionsTable data={selectedExceptions} />
      </section>
    </div>
  );
}