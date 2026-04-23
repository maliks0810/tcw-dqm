import React, { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import SecurityTable from "../components/SecurityTable";
import ExceptionsTable from "../components/ExceptionsTable";
import type { ExceptionRow, SecurityRow } from "../components/types";
import { fetchAssets } from "../services/get-assets";
import { fetchSecurityExceptions } from "../services/get-security-exceptions";
import "../styles/dq-monitor.css";

export default function DqMonitorPage() {
  const [assets, setAssets] = useState<SecurityRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchAssets(controller.signal)
      .then((rows) => {
        setAssets(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const selectedAladdinId =
    selectedRow !== null ? assets[selectedRow]?.aladdinId ?? "" : "";

  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of assets) {
      if (a.assignTo) names.add(a.assignTo);
    }
    return Array.from(names).sort((x, y) => x.localeCompare(y));
  }, [assets]);

  const handleAssignToChange = (index: number, value: string) => {
    setAssets((prev) => {
      if (!prev[index] || prev[index].assignTo === value) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], assignTo: value };
      return next;
    });
  };

  useEffect(() => {
    if (!selectedAladdinId) {
      setExceptions([]);
      setExceptionsError(null);
      setExceptionsLoading(false);
      return;
    }
    const controller = new AbortController();
    setExceptionsLoading(true);
    setExceptionsError(null);
    fetchSecurityExceptions(selectedAladdinId, controller.signal)
      .then((rows) => {
        setExceptions(rows);
        setExceptionsLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
        setExceptionsError(e instanceof Error ? e.message : String(e));
        setExceptionsLoading(false);
      });
    return () => controller.abort();
  }, [selectedAladdinId]);

  return (
    <div className="dq-page">
      <Header />

      <section className="dq-section">
        <h2 className="dq-section-title">Assets</h2>
        {loading && <div className="dq-section-subtitle">Loading assets…</div>}
        {error && (
          <div className="dq-section-subtitle" style={{ color: "crimson" }}>
            Failed to load assets: {error}
          </div>
        )}
        {!loading && !error && (
          <SecurityTable
            data={assets}
            selectedRow={selectedRow}
            onRowSelect={setSelectedRow}
            assigneeOptions={assigneeOptions}
            onAssignToChange={handleAssignToChange}
          />
        )}
      </section>

      <section className="dq-section">
        <h2 className="dq-section-title">Exceptions</h2>

        {selectedRow !== null && assets[selectedRow] && (
          <div className="dq-section-subtitle dq-asset-title">
            {assets[selectedRow].securityDescription} —{" "}
            {assets[selectedRow].aladdinId}
            {exceptionsLoading
              ? " (loading…)"
              : ` (${exceptions.length} exceptions)`}
          </div>
        )}

        {exceptionsError && (
          <div className="dq-section-subtitle" style={{ color: "crimson" }}>
            Failed to load exceptions: {exceptionsError}
          </div>
        )}

        <ExceptionsTable data={exceptions} />
      </section>
    </div>
  );
}
