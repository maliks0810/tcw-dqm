import React, { useEffect, useRef, useState } from "react";
import Header from "../components/Header";
import SecurityTable from "../components/SecurityTable";
import ExceptionsTable from "../components/ExceptionsTable";
import type { ExceptionRow, SecurityRow } from "../components/types";
import { fetchAssets } from "../services/get-assets";
import { fetchSecurityExceptions } from "../services/get-security-exceptions";
import { fetchExceptionTypes } from "../services/get-exception-types";
import { fetchSeverityTypes } from "../services/get-severity-type";
import { fetchPriorityTypes } from "../services/get-priority-type";
import { fetchExceptionStatus } from "../services/get-exception-status";
import { fetchDMUsers } from "../services/get-dm-users";
import { fetchRuleGroups } from "../services/get-rule-groups";
import { fetchRuleTypes } from "../services/get-rule-types";
import { fetchRules } from "../services/get-rules";
import { subscribeToEvents } from "../services/stream-events";
import { exportAssetsToExcel } from "../../../utils/export-to-excel";
import "../styles/dq-monitor.css";

export default function DqMonitorPage() {
  const [assets, setAssets] = useState<SecurityRow[]>([]);
  const [visibleAssets, setVisibleAssets] = useState<SecurityRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [lastEvent, setLastEvent] = useState<{
    aladdinId: string;
    count: number;
    receivedAt: string;
  } | null>(null);
  const [blinkingAladdinId, setBlinkingAladdinId] = useState<string | null>(
    null
  );

  const [severity, setSeverity] = useState<string>("All");
  const [severityOptions, setSeverityOptions] = useState<string[]>([]);
  const [dqmType, setDqmType] = useState<string>("Security Setup");
  const [exceptionTypes, setExceptionTypes] = useState<string[]>([]);
  const [priority, setPriority] = useState<string>("All");
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [assignToFilter, setAssignToFilter] = useState<string>("All");
  const [dmUserOptions, setDmUserOptions] = useState<string[]>([]);
  const [exceptionStatus, setExceptionStatus] = useState<string>("All");
  const [exceptionStatusOptions, setExceptionStatusOptions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<
    "security" | "group" | "ruleType" | "rule"
  >("security");
  const [viewByGroup, setViewByGroup] = useState<string>("All");
  const [ruleGroupOptions, setRuleGroupOptions] = useState<string[]>([]);
  const [viewByRuleType, setViewByRuleType] = useState<string>("All");
  const [ruleTypeOptions, setRuleTypeOptions] = useState<string[]>([]);
  const [viewByRule, setViewByRule] = useState<string>("All");
  const [ruleOptions, setRuleOptions] = useState<string[]>([]);

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
    const controller = new AbortController();
    fetchExceptionTypes(controller.signal)
      .then((codes) => {
        setExceptionTypes(codes);
        if (codes.length === 0) return;
        setDqmType((current) =>
          codes.includes(current) ? current : codes[0]
        );
      })
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSeverityTypes(controller.signal)
      .then((codes) => setSeverityOptions(codes))
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPriorityTypes(controller.signal)
      .then((codes) => setPriorityOptions(codes))
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchExceptionStatus(controller.signal)
      .then((codes) => setExceptionStatusOptions(codes))
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchDMUsers(controller.signal)
      .then((users) => setDmUserOptions(users))
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchRuleGroups(controller.signal)
      .then((names) => setRuleGroupOptions(names))
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!viewByGroup || viewByGroup === "All") {
      setRuleTypeOptions([]);
      setViewByRuleType("All");
      return;
    }
    const controller = new AbortController();
    fetchRuleTypes(viewByGroup, controller.signal)
      .then((names) => {
        setRuleTypeOptions(names);
        setViewByRuleType((current) =>
          names.includes(current) ? current : "All"
        );
      })
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [viewByGroup]);

  useEffect(() => {
    if (!viewByRuleType || viewByRuleType === "All") {
      setRuleOptions([]);
      setViewByRule("All");
      return;
    }
    const controller = new AbortController();
    fetchRules(viewByRuleType, controller.signal)
      .then((rules) => {
        const names = rules
          .map((r) => r.rule_name)
          .filter((n): n is string => !!n);
        setRuleOptions(names);
        setViewByRule((current) =>
          names.includes(current) ? current : "All"
        );
      })
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [viewByRuleType]);

  useEffect(() => {
    return subscribeToEvents((event) => {
      if (event.type === "security_exception.inserted") {
        const payload = (event.payload ?? {}) as {
          asset_id?: string;
          count?: number;
        };
        const aladdinId = payload.asset_id ?? "";
        const count = typeof payload.count === "number" ? payload.count : 0;
        setLastEvent({
          aladdinId,
          count,
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
    fetchAssets(controller.signal, dqmType, severity, priority, viewByRuleType, viewByRule, exceptionStatus, assignToFilter)
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
  }, [refreshTick, dqmType, severity, priority, viewByRuleType, viewByRule, exceptionStatus, assignToFilter]);

  const handleAssignToChange = (index: number, value: string) => {
    setAssets((prev) => {
      if (!prev[index] || prev[index].assignTo === value) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], assignTo: value };
      return next;
    });
  };

  useEffect(() => {
    const inGroupMode = viewMode === "group";
    const inRuleTypeMode = viewMode === "ruleType";
    const usesAsset = !inGroupMode && !inRuleTypeMode;
    if (usesAsset && !selectedAladdinId) {
      setExceptions([]);
      setExceptionsError(null);
      setExceptionsLoading(false);
      return;
    }
    const controller = new AbortController();
    setExceptionsLoading(true);
    setExceptionsError(null);
    const assetArg = usesAsset ? selectedAladdinId : "";
    const ruleGroupArg =
      inGroupMode || inRuleTypeMode ? viewByGroup : undefined;
    const ruleTypeArg = inGroupMode ? undefined : viewByRuleType;
    fetchSecurityExceptions(
      assetArg,
      controller.signal,
      dqmType,
      severity,
      priority,
      ruleTypeArg,
      viewByRule,
      ruleGroupArg,
      exceptionStatus,
      assignToFilter
    )
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
  }, [
    selectedAladdinId,
    refreshTick,
    dqmType,
    severity,
    priority,
    viewByRuleType,
    viewByRule,
    viewMode,
    viewByGroup,
    exceptionStatus,
    assignToFilter,
  ]);

  return (
    <div className="dq-page">
      <Header onExportClick={() => exportAssetsToExcel(visibleAssets)} />

      <div className="dq-body">
        <aside className="dq-sidebar">
          <h3 className="dq-sidebar-title">Type</h3>
          <select
            className="dq-sidebar-select"
            value={dqmType}
            onChange={(e) => setDqmType(e.target.value)}
          >
            <option value="">All</option>
            {exceptionTypes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <h3 className="dq-sidebar-title">Severity</h3>
          <select
            className="dq-sidebar-select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="All">All</option>
            {severityOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <h3 className="dq-sidebar-title">Priority</h3>
          <select
            className="dq-sidebar-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="All">All</option>
            {priorityOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <h3 className="dq-sidebar-title">Assign To</h3>
          <select
            className="dq-sidebar-select"
            value={assignToFilter}
            onChange={(e) => setAssignToFilter(e.target.value)}
          >
            <option value="All">All</option>
            {dmUserOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <h3 className="dq-sidebar-title">Exception Status</h3>
          <select
            className="dq-sidebar-select"
            value={exceptionStatus}
            onChange={(e) => setExceptionStatus(e.target.value)}
          >
            <option value="All">All</option>
            {exceptionStatusOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <button
            className="dq-sidebar-button"
            type="button"
            onClick={() => setViewMode("group")}
          >
            View by Rule Group
          </button>

          <select
            className="dq-sidebar-select"
            value={viewByGroup}
            onChange={(e) => setViewByGroup(e.target.value)}
          >
            <option value="All">All</option>
            {ruleGroupOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <button
            className="dq-sidebar-button"
            type="button"
            onClick={() => setViewMode("ruleType")}
          >
            View by Rule Type
          </button>

          <select
            className="dq-sidebar-select"
            value={viewByRuleType}
            onChange={(e) => setViewByRuleType(e.target.value)}
          >
            <option value="All">All</option>
            {ruleTypeOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
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
            {ruleOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
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
                  assigneeOptions={dmUserOptions}
                  onAssignToChange={handleAssignToChange}
                  blinkingAladdinId={blinkingAladdinId}
                  onVisibleRowsChange={setVisibleAssets}
                />
              )}
            </section>
          )}

          <section className="dq-section">
            <h2 className="dq-section-title">Exceptions</h2>

            {viewMode === "security" && selectedRow !== null && assets[selectedRow] && (
              <div className="dq-section-subtitle dq-asset-title">
                {assets[selectedRow].securityDescription} —{" "}
                {assets[selectedRow].aladdinId}
                {exceptionsLoading
                  ? " (loading…)"
                  : ` (${exceptions.length} exceptions)`}
              </div>
            )}

            {viewMode === "group" && (
              <div className="dq-section-subtitle dq-asset-title">
                Rule Group: {viewByGroup}
                {exceptionsLoading
                  ? " (loading…)"
                  : ` (${exceptions.length} exceptions)`}
              </div>
            )}

            {viewMode === "ruleType" && (
              <div className="dq-section-subtitle dq-asset-title">
                Rule Group: {viewByGroup} / Rule Type: {viewByRuleType}
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
          ? `Asset Id = ${lastEvent.aladdinId}, No of Exceptions = ${lastEvent.count}, Received at ${lastEvent.receivedAt}`
          : ""}
      </div>
    </div>
  );
}
