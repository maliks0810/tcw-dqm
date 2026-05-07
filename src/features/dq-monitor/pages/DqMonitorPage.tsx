import React, { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import SecurityTable from "../components/SecurityTable";
import ExceptionsTable from "../components/ExceptionsTable";
import type { ExceptionRow, SecurityRow } from "../components/types";
import { fetchAssets } from "../services/get-assets";
import { fetchSecurityExceptions } from "../services/get-security-exceptions";
import { subscribeToEvents } from "../services/stream-events";
import { exportAssetsToExcel } from "../../../utils/export-to-excel";
import "../styles/dq-monitor.css";

export default function DqMonitorPage() {
  const [assets, setAssets] = useState<SecurityRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [lastEvent, setLastEvent] = useState<{
    aladdinId: string;
    ruleId: string;
    receivedAt: string;
  } | null>(null);
  const [blinkingAladdinId, setBlinkingAladdinId] = useState<string | null>(
    null
  );

  const [severity, setSeverity] = useState<string>("Trading");
  const [dqmType, setDqmType] = useState<string>("Security Setup");
  const [priority, setPriority] = useState<string>("High");
  const [assignToFilter, setAssignToFilter] = useState<string>("Paul Cohen");
  const [viewMode, setViewMode] = useState<"security" | "group" | "rule">(
    "security"
  );
  const [viewByGroup, setViewByGroup] = useState<string>("All");
  const [viewByRule, setViewByRule] = useState<string>("All");

  const originalTitleRef = useRef<string>(
    typeof document !== "undefined" ? document.title : ""
  );
  const titleBlinkRef = useRef<number | null>(null);

  const stopTitleBlink = () => {
    if (titleBlinkRef.current != null) {
      window.clearInterval(titleBlinkRef.current);
      titleBlinkRef.current = null;
    }
    document.title = originalTitleRef.current;
  };

  const startTitleBlink = () => {
    if (titleBlinkRef.current != null) return;
    let alt = false;
    titleBlinkRef.current = window.setInterval(() => {
      document.title = alt ? originalTitleRef.current : "🔔 New exception";
      alt = !alt;
    }, 800);
  };

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) stopTitleBlink();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", stopTitleBlink);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", stopTitleBlink);
      stopTitleBlink();
    };
  }, []);

  const selectedAladdinId =
    selectedRow !== null ? assets[selectedRow]?.aladdinId ?? "" : "";

  const selectedAladdinRef = useRef<string>("");
  useEffect(() => {
    selectedAladdinRef.current = selectedAladdinId;
  }, [selectedAladdinId]);

  useEffect(() => {
    return subscribeToEvents((event) => {
      if (event.type === "security_exception.inserted") {
        const payload = (event.payload ?? {}) as {
          aladdin_id?: string;
          rule_id?: string | number;
        };
        const aladdinId = payload.aladdin_id ?? "";
        const ruleId =
          payload.rule_id != null ? String(payload.rule_id) : "";
        setLastEvent({
          aladdinId,
          ruleId,
          receivedAt: new Date().toLocaleTimeString(),
        });
        if (aladdinId) setBlinkingAladdinId(aladdinId);
        if (document.hidden) startTitleBlink();
        setRefreshTick((n) => n + 1);
      }
    });
  }, []);

  const handleRowSelect = (index: number) => {
    setSelectedRow(index);
    const clicked = assets[index]?.aladdinId;
    if (clicked && clicked === blinkingAladdinId) {
      setBlinkingAladdinId(null);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchAssets(controller.signal)
      .then((rows) => {
        setAssets(rows);
        const wantedAladdin = selectedAladdinRef.current;
        if (wantedAladdin) {
          const idx = rows.findIndex((r) => r.aladdinId === wantedAladdin);
          setSelectedRow(idx >= 0 ? idx : null);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

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
  }, [selectedAladdinId, refreshTick]);

  return (
    <div className="dq-page">
      <Header onExportClick={() => exportAssetsToExcel(assets)} />

      <div className="dq-body">
        <aside className="dq-sidebar">
          <h3 className="dq-sidebar-title">DQM Type</h3>
          <select
            className="dq-sidebar-select"
            value={dqmType}
            onChange={(e) => setDqmType(e.target.value)}
          >
            <option value="Security Setup">Security Setup</option>
            <option value="SOD">SOD</option>
            <option value="EOD">EOD</option>
          </select>

          <h3 className="dq-sidebar-title">Severity</h3>
          <select
            className="dq-sidebar-select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="Trading">Trading</option>
            <option value="Compliance">Compliance</option>
            <option value="Settlements">Settlements</option>
            <option value="Reporting">Reporting</option>
          </select>

          <h3 className="dq-sidebar-title">Priority</h3>
          <select
            className="dq-sidebar-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <h3 className="dq-sidebar-title">Assign To</h3>
          <select
            className="dq-sidebar-select"
            value={assignToFilter}
            onChange={(e) => setAssignToFilter(e.target.value)}
          >
            <option value="Paul Cohen">Paul Cohen</option>
            <option value="Jake Rigney">Jake Rigney</option>
            <option value="Anush Safaryan">Anush Safaryan</option>
            <option value="Jimmy Fu">Jimmy Fu</option>
            <option value="Natasha Cabrera">Natasha Cabrera</option>
          </select>

          <button
            className="dq-sidebar-button"
            type="button"
            onClick={() => setViewMode("group")}
          >
            View by Group
          </button>

          <select
            className="dq-sidebar-select"
            value={viewByGroup}
            onChange={(e) => setViewByGroup(e.target.value)}
          >
            <option value="All">All</option>
            <option value="Bloomberg Compare">Bloomberg Compare</option>
            <option value="Miscellaneos">Miscellaneos</option>
          </select>

          <button
            className="dq-sidebar-button"
            type="button"
            onClick={() => setViewMode("rule")}
          >
            View by Rule
          </button>

          <select
            className="dq-sidebar-select"
            value={viewByRule}
            onChange={(e) => setViewByRule(e.target.value)}
          >
            <option value="All">All</option>
            <option value="Rule_Registration">Rule_Registration</option>
          </select>

          <button
            className="dq-sidebar-button"
            type="button"
            onClick={() => setViewMode("security")}
          >
            View by Security
          </button>
        </aside>

        <div className="dq-main">
          {viewMode === "security" && (
            <section className="dq-section">
              <h2 className="dq-section-title">Assets</h2>
              {loading && (
                <div className="dq-section-subtitle">Loading assets…</div>
              )}
              {error && (
                <div
                  className="dq-section-subtitle"
                  style={{ color: "crimson" }}
                >
                  Failed to load assets: {error}
                </div>
              )}
              {!loading && !error && (
                <SecurityTable
                  data={assets}
                  selectedRow={selectedRow}
                  onRowSelect={handleRowSelect}
                  assigneeOptions={assigneeOptions}
                  onAssignToChange={handleAssignToChange}
                  blinkingAladdinId={blinkingAladdinId}
                />
              )}
            </section>
          )}

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
      </div>

      <div className="dq-status-bar">
        {lastEvent
          ? `Aladdin_id = ${lastEvent.aladdinId}, RuleId = ${lastEvent.ruleId}, Received at ${lastEvent.receivedAt}`
          : "Idle"}
      </div>
    </div>
  );
}
