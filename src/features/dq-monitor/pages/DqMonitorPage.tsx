import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import SecurityTable, { ActionValue } from "../components/SecurityTable";
import ExceptionsTable from "../components/ExceptionsTable";
import RuleTreeView from "../components/RuleTreeView";
import type { ExceptionRow, SecurityRow } from "../components/types";
import { fetchAssets } from "../services/get-assets";
import { fetchExceptions } from "../services/get-exceptions";
import { executeRules } from "../services/execute-rules";
import { fetchExceptionTypes } from "../services/get-exception-types";
import { fetchSeverityTypes } from "../services/get-severity-types";
import { fetchPriorityTypes } from "../services/get-priority-types";
import { fetchExceptionStatus } from "../services/get-exception-status";
import { fetchDMUsers } from "../services/get-dm-users";
import { fetchRuleGroups } from "../services/get-rule-groups";
import { fetchRuleCatalogs } from "../services/get-rule-catalogs";
import { fetchRules } from "../services/get-rules";
import { subscribeToEvents } from "../services/stream-events";
import { exportAssetsToExcel } from "../../../utils/export-to-excel";
import { updateAssignTo } from "../services/update-assign-to";
import "../styles/dq-monitor.css";

export default function DqMonitorPage() {
  const [assets, setAssets] = useState<SecurityRow[]>([]);
  const [visibleAssets, setVisibleAssets] = useState<SecurityRow[]>([]);
  // Last per-asset action label, lifted up here so it survives the
  // SecurityTable unmount/remount that happens when loading flips during
  // SSE-triggered refetches.
  const [actionByAsset, setActionByAsset] = useState<Record<string, ActionValue>>(
    {}
  );
  const setActionShown = useCallback(
    (assetId: string, value: ActionValue) => {
      setActionByAsset((prev) => ({ ...prev, [assetId]: value }));
    },
    []
  );
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState<number>(240);
  const sidebarResizingRef = useRef<boolean>(false);

  const [assetsHeight, setAssetsHeight] = useState<number | null>(null);
  const assetsResizingRef = useRef<boolean>(false);
  const dqMainRef = useRef<HTMLDivElement | null>(null);

  const [countHeight, setCountHeight] = useState<number | null>(null);
  const countResizingRef = useRef<boolean>(false);

  const startAssetsResize = (e: React.MouseEvent) => {
    e.preventDefault();
    assetsResizingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const startCountResize = (e: React.MouseEvent) => {
    e.preventDefault();
    countResizingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    sidebarResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (sidebarResizingRef.current) {
        const min = 180;
        const max = Math.max(min, Math.floor(window.innerWidth * 0.6));
        setSidebarWidth(Math.min(max, Math.max(min, e.clientX - 16)));
        return;
      }
      if (assetsResizingRef.current && dqMainRef.current) {
        const rect = dqMainRef.current.getBoundingClientRect();
        const min = 120;
        const max = Math.max(min, rect.height - 120);
        setAssetsHeight(
          Math.min(max, Math.max(min, e.clientY - rect.top))
        );
      }
      if (countResizingRef.current && dqMainRef.current) {
        const rect = dqMainRef.current.getBoundingClientRect();
        const min = 80;
        const max = Math.max(min, rect.height - 120);
        setCountHeight(
          Math.min(max, Math.max(min, e.clientY - rect.top))
        );
      }
    };
    const onUp = () => {
      if (sidebarResizingRef.current) {
        sidebarResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
      if (assetsResizingRef.current) {
        assetsResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
      if (countResizingRef.current) {
        countResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);
  const [exceptionsLimitExceeded, setExceptionsLimitExceeded] = useState(false);

  const [refreshTick, setRefreshTick] = useState(0);
  const [lastEvent, setLastEvent] = useState<{
    aladdinId: string;
    count: number;
    receivedAt: string;
  } | null>(null);
  const [blinkingAladdinId, setBlinkingAladdinId] = useState<string | null>(
    null
  );
  const [footerBlinking, setFooterBlinking] = useState<boolean>(false);

  const [severity, setSeverity] = useState<string>("All");
  const [severityOptions, setSeverityOptions] = useState<string[]>([]);
  const [dqmType, setDqmType] = useState<string>("Security Setup");
  const [exceptionTypes, setExceptionTypes] = useState<string[]>([]);
  const [priority, setPriority] = useState<string>("All");
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [assignToFilter, setAssignToFilter] = useState<string>("All");
  const [dmUserOptions, setDmUserOptions] = useState<string[]>([]);
  const [exceptionStatus, setExceptionStatus] = useState<string>("Pending");
  const [exceptionStatusOptions, setExceptionStatusOptions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<
    "security" | "group" | "ruleCatalog" | "rule"
  >("rule");
  // Tracks whether the user has picked anything in the rule tree yet. When
  // false, we render an empty right side instead of firing a broad exceptions
  // fetch — i.e. the initial blank state.
  const [treeSelected, setTreeSelected] = useState<boolean>(false);
  const [viewByGroup, setViewByGroup] = useState<string>("All");
  const [ruleGroupOptions, setRuleGroupOptions] = useState<string[]>([]);
  const [viewByRuleCatalog, setViewByRuleCatalog] = useState<string>("All");
  const [viewByRule, setViewByRule] = useState<string>("All");
  const [ruleOptions, setRuleOptions] = useState<string[]>([]);
  const [ruleNameSearchApplied, setRuleNameSearchApplied] = useState<string>("");
  const [ruleQuery, setRuleQuery] = useState<string>("");
  const [ruleComboOpen, setRuleComboOpen] = useState<boolean>(false);
  const ruleComboRef = useRef<HTMLDivElement | null>(null);

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

  // Ask once for OS-level notification permission so SSE events can also
  // surface in the Windows Action Center, not just the footer.
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        /* user dismissed prompt — fall back to footer-only */
      });
    }
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
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSeverityTypes(controller.signal)
      .then((codes) => setSeverityOptions(codes))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPriorityTypes(controller.signal)
      .then((codes) => setPriorityOptions(codes))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchExceptionStatus(controller.signal)
      .then((codes) => setExceptionStatusOptions(codes))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchDMUsers(controller.signal)
      .then((users) => setDmUserOptions(users))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchRuleGroups(controller.signal)
      .then((names) => setRuleGroupOptions(names))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  const filteredRuleOptions = (() => {
    if (!ruleQuery) return ruleOptions;
    const needle = ruleQuery.toLowerCase();
    return ruleOptions.filter((name) => name.toLowerCase().includes(needle));
  })();

  const commitRuleQuery = useCallback(() => {
    const trimmed = ruleQuery.trim();
    const exact = ruleOptions.find(
      (n) => n.toLowerCase() === trimmed.toLowerCase()
    );
    if (trimmed === "" || trimmed.toLowerCase() === "all") {
      setViewByRule("All");
      setRuleNameSearchApplied("");
      setRuleQuery("All");
    } else if (exact) {
      setViewByRule(exact);
      setRuleNameSearchApplied("");
      setRuleQuery(exact);
    } else {
      setViewByRule("All");
      setRuleNameSearchApplied(`%${trimmed}%`);
    }
    setRuleComboOpen(false);
    setTreeSelected(true);
  }, [ruleQuery, ruleOptions]);

  const pickRuleFromCombo = (name: string) => {
    if (name === "All") {
      setRuleQuery("All");
      setViewByRule("All");
    } else {
      setRuleQuery(name);
      setViewByRule(name);
    }
    setRuleNameSearchApplied("");
    setRuleComboOpen(false);
    setTreeSelected(true);
  };

  useEffect(() => {
    if (!ruleComboOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        ruleComboRef.current &&
        !ruleComboRef.current.contains(e.target as Node)
      ) {
        commitRuleQuery();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ruleComboOpen, commitRuleQuery]);

  useEffect(() => {
    if (!viewByRuleCatalog || viewByRuleCatalog === "All") {
      setRuleOptions([]);
      setViewByRule("All");
      setRuleQuery("");
      setRuleNameSearchApplied("");
      return;
    }
    const controller = new AbortController();
    fetchRules(viewByRuleCatalog, controller.signal)
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
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [viewByRuleCatalog]);

  useEffect(() => {
    return subscribeToEvents((event) => {
      if (
        event.type === "security_exception.inserted" ||
        event.type === "security_exception.updated"
      ) {
        const payload = (event.payload ?? {}) as {
          asset_id?: string;
          count?: number;
        };
        const aladdinId = payload.asset_id ?? "";
        const count = typeof payload.count === "number" ? payload.count : 0;
        const receivedAt = new Date().toLocaleTimeString();
        setLastEvent({
          aladdinId,
          count,
          receivedAt,
        });
        if (
          event.type === "security_exception.inserted" &&
          aladdinId
        ) {
          setBlinkingAladdinId(aladdinId);
          if (document.hidden) startTitleBlink();
        }
        setFooterBlinking(true);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification("TCW-DQM", {
              body: `Asset Id = ${aladdinId}, No of Exceptions = ${count}, Received at ${receivedAt}`,
              tag: "tcw-dqm-exception",
            });
          } catch {
            /* some browsers throw when window is unfocused — ignore */
          }
        }
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
    fetchAssets(controller.signal, dqmType, severity, priority, viewByRuleCatalog, viewByRule, exceptionStatus, assignToFilter)
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
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick, dqmType, severity, priority, viewByRuleCatalog, viewByRule, exceptionStatus, assignToFilter]);

  const handleAssignToChange = (index: number, value: string) => {
    const target = assets[index];
    if (!target) return;
    const assetId = target.aladdinId;
    if (!assetId) return;
    if (target.assignTo === value) return;
    setAssets((prev) => {
      if (!prev[index]) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], assignTo: value };
      return next;
    });

    console.log("updateAssignTo →", { assetId, value });
    updateAssignTo(assetId, value).catch((e) => {
   
      console.error("updateAssignTo failed", e);
    });
  };

  useEffect(() => {
    const inGroupMode = viewMode === "group";
    const inRuleCatalogMode = viewMode === "ruleCatalog";
    const inRuleMode = viewMode === "rule";
    const usesAsset = viewMode === "security";
    if (usesAsset && !selectedAladdinId) {
      setExceptions([]);
      setExceptionsError(null);
      setExceptionsLoading(false);
      setExceptionsLimitExceeded(false);
      return;
    }
    if (!usesAsset && !treeSelected) {
      // Initial blank state — user hasn't picked anything in the rule tree
      // or typed a pattern. Skip the broad fetch.
      setExceptions([]);
      setExceptionsError(null);
      setExceptionsLoading(false);
      setExceptionsLimitExceeded(false);
      return;
    }
    const controller = new AbortController();
    setExceptionsLoading(true);
    setExceptionsError(null);
    setExceptionsLimitExceeded(false);
    const assetArg = usesAsset ? selectedAladdinId : "";
    const ruleGroupArg =
      inGroupMode || inRuleCatalogMode || inRuleMode ? viewByGroup : undefined;
    const ruleCatalogArg = inGroupMode ? undefined : viewByRuleCatalog;
    fetchExceptions(
      assetArg,
      controller.signal,
      dqmType,
      severity,
      priority,
      ruleCatalogArg,
      viewByRule,
      ruleGroupArg,
      exceptionStatus,
      assignToFilter,
      ruleNameSearchApplied
    )
      .then((rows) => {
        if (rows.length > 1000) {
          setExceptions([]);
          setExceptionsLimitExceeded(true);
        } else {
          setExceptions(rows);
          setExceptionsLimitExceeded(false);
        }
        setExceptionsLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
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
    viewByRuleCatalog,
    viewByRule,
    viewMode,
    viewByGroup,
    exceptionStatus,
    assignToFilter,
    ruleNameSearchApplied,
    treeSelected,
  ]);

  // When in group mode, we break the count down by rule type — but the
  // ExceptionRow only carries ruleName, so we need a ruleName -> ruleCatalog
  // lookup, built by walking the rule types in the selected group.
  const [ruleCatalogByRuleName, setRuleCatalogByRuleName] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    if (viewMode !== "group" || !viewByGroup || viewByGroup === "All") {
      setRuleCatalogByRuleName({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const types = await fetchRuleCatalogs(viewByGroup);
        const map: Record<string, string> = {};
        await Promise.all(
          types.map(async (typeName) => {
            const rules = await fetchRules(typeName);
            for (const r of rules) {
              if (r.rule_name) map[r.rule_name] = typeName;
            }
          })
        );
        if (!cancelled) setRuleCatalogByRuleName(map);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        
        console.error("rule-type lookup failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, viewByGroup]);

  // Counts shown in the "Number of Exceptions" grid. Row 1 is the current
  // scope (group / rule type), subsequent rows are the breakdown one level
  // deeper. Derived from the currently-loaded exceptions so it stays in
  // sync with the bottom grid.
  const exceptionCountRows = useMemo<{ name: string; count: number }[]>(() => {
    if (viewMode === "security") return [];

    if (viewMode === "group") {
      if (!viewByGroup || viewByGroup === "All") return [];
      const rows: { name: string; count: number }[] = [
        { name: viewByGroup, count: exceptions.length },
      ];
      const byType = new Map<string, number>();
      for (const e of exceptions) {
        const t = ruleCatalogByRuleName[e.ruleName] ?? "Unknown";
        byType.set(t, (byType.get(t) ?? 0) + 1);
      }
      for (const [name, count] of Array.from(byType.entries()).sort(
        (a, b) => b[1] - a[1]
      )) {
        rows.push({ name, count });
      }
      return rows;
    }

    if (viewMode === "ruleCatalog") {
      if (!viewByRuleCatalog || viewByRuleCatalog === "All") return [];
      const rows: { name: string; count: number }[] = [
        { name: viewByRuleCatalog, count: exceptions.length },
      ];
      const byRule = new Map<string, number>();
      for (const e of exceptions) {
        const name = e.ruleName || "(unnamed)";
        byRule.set(name, (byRule.get(name) ?? 0) + 1);
      }
      for (const [name, count] of Array.from(byRule.entries()).sort(
        (a, b) => b[1] - a[1]
      )) {
        rows.push({ name, count });
      }
      return rows;
    }

    // viewMode === "rule" — flat list of rules and their counts.
    const counts = new Map<string, number>();
    for (const e of exceptions) {
      const name = e.ruleName || "(unnamed)";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [
    viewMode,
    viewByGroup,
    viewByRuleCatalog,
    exceptions,
    ruleCatalogByRuleName,
  ]);

  return (
    <div className="dq-page">
      <Header onExportClick={() => exportAssetsToExcel(visibleAssets)} />

      <div className="dq-body">
        <aside
          className="dq-sidebar"
          style={{ flex: `0 0 ${sidebarWidth}px` }}
        >
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

          <h3 className="dq-sidebar-title">View Exceptions</h3>
          <RuleTreeView
            groups={ruleGroupOptions}
            getTypes={(group) => fetchRuleCatalogs(group)}
            getRules={async (type) => {
              const rules = await fetchRules(type);
              return rules
                .map((r) => r.rule_name)
                .filter((n): n is string => !!n);
            }}
            selection={{
              group: viewByGroup,
              type: viewByRuleCatalog,
              rule: viewByRule,
            }}
            hasSelection={treeSelected}
            onSelectAll={() => {
              setViewMode("rule");
              setViewByGroup("All");
              setViewByRuleCatalog("All");
              setViewByRule("All");
              setRuleNameSearchApplied("");
              setTreeSelected(true);
            }}
            onSelectGroup={(g) => {
              setViewMode("group");
              setViewByGroup(g);
              setViewByRuleCatalog("All");
              setViewByRule("All");
              setRuleNameSearchApplied("");
              setTreeSelected(true);
            }}
            onSelectType={(g, t) => {
              setViewMode("ruleCatalog");
              setViewByGroup(g);
              setViewByRuleCatalog(t);
              setViewByRule("All");
              setRuleNameSearchApplied("");
              setTreeSelected(true);
            }}
            onSelectRule={(g, t, r) => {
              setViewMode("rule");
              setViewByGroup(g);
              setViewByRuleCatalog(t);
              setViewByRule(r);
              setRuleNameSearchApplied("");
              setTreeSelected(true);
            }}
          />

          <button
            className="dq-sidebar-button"
            type="button"
            onClick={() => setViewMode("rule")}
          >
            View by Rule Pattern
          </button>

          <div className="dq-combo" ref={ruleComboRef}>
            <input
              className="dq-sidebar-select"
              type="text"
              placeholder="Pick a rule or type a pattern (% wildcard)"
              value={ruleQuery}
              onChange={(e) => {
                setRuleQuery(e.target.value);
                setRuleComboOpen(true);
              }}
              onFocus={() => setRuleComboOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRuleQuery();
                } else if (e.key === "Escape") {
                  setRuleQuery("");
                  setViewByRule("All");
                  setRuleNameSearchApplied("");
                  setRuleComboOpen(false);
                }
              }}
            />
            {ruleComboOpen && (
              <div className="dq-combo-popover">
                <button
                  type="button"
                  className="dq-combo-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickRuleFromCombo("All");
                  }}
                >
                  All
                </button>
                {filteredRuleOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="dq-combo-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickRuleFromCombo(name);
                    }}
                  >
                    {name}
                  </button>
                ))}
                {filteredRuleOptions.length === 0 && ruleQuery && (
                  <div className="dq-combo-empty">
                    No rules — will search as pattern
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            className="dq-sidebar-button"
            type="button"
            onClick={() => setViewMode("security")}
          >
            View by Security
          </button>
        </aside>

        <div
          className="dq-sidebar-resizer"
          onMouseDown={startSidebarResize}
          onKeyDown={(e) => {
            const min = 180;
            const max = Math.max(min, Math.floor(window.innerWidth * 0.6));
            const step = e.shiftKey ? 40 : 10;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setSidebarWidth((w) => Math.max(min, w - step));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setSidebarWidth((w) => Math.min(max, w + step));
            }
          }}
          role="slider"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={sidebarWidth}
          aria-valuemin={180}
          aria-valuemax={Math.floor(
            typeof window !== "undefined" ? window.innerWidth * 0.6 : 800
          )}
          tabIndex={0}
        />

        <div className="dq-main" ref={dqMainRef}>
          {viewMode === "security" && (
            <section
              className="dq-section"
              style={
                assetsHeight !== null
                  ? { flex: `0 0 ${assetsHeight}px` }
                  : undefined
              }
            >
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
                  actionByAsset={actionByAsset}
                  onActionShownChange={setActionShown}
                  onAction={(action, assetId, idBbGlobal) => {
                    if (action === "runRules") {
                      if (
                        !window.confirm(
                          `Are you sure you want to run the rules again for Asset Id = ${assetId}`
                        )
                      ) {
                        return;
                      }
                      executeRules("Intraday", assetId, idBbGlobal).catch((e) => {
               
                        console.error("executeRules failed", e);
                      });
                      return;
                    }
                    if (action === "loadTdc") {
                      window.alert(`Load TDC is not implemented yet`);
                      return;
                    }
                    if (action === "loadAnalytics") {
                      window.alert(`Load Analytics is not implemented yet`);
                      return;
                    }
                    if (action === "notifyTod") {
                      window.alert(`Notify TOD is not implemented yet`);
                      return;
                    }
                  }}
                />
              )}
            </section>
          )}

          {viewMode === "security" && (
            <div
              className="dq-main-resizer"
              onMouseDown={startAssetsResize}
              onKeyDown={(e) => {
                if (!dqMainRef.current) return;
                const rect = dqMainRef.current.getBoundingClientRect();
                const min = 120;
                const max = Math.max(min, rect.height - 120);
                const step = e.shiftKey ? 40 : 10;
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAssetsHeight((h) =>
                    Math.max(min, (h ?? rect.height / 2) - step)
                  );
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAssetsHeight((h) =>
                    Math.min(max, (h ?? rect.height / 2) + step)
                  );
                }
              }}
              role="slider"
              aria-orientation="horizontal"
              aria-label="Resize assets grid"
              aria-valuenow={assetsHeight ?? 0}
              aria-valuemin={120}
              aria-valuemax={
                dqMainRef.current
                  ? Math.max(120, dqMainRef.current.clientHeight - 120)
                  : 1000
              }
              tabIndex={0}
            />
          )}

          {viewMode !== "security" && treeSelected && (
            <section
              className="dq-section dq-exception-count"
              style={
                countHeight !== null
                  ? { flex: `0 0 ${countHeight}px` }
                  : undefined
              }
            >
              <h2 className="dq-section-title dq-section-title-bold">Number of Exceptions</h2>
              <div className="dq-table-container">
                <table className="dq-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptionCountRows.map((row, i) => {
                      const isHeader =
                        i === 0 &&
                        (viewMode === "group" || viewMode === "ruleCatalog");
                      return (
                        <tr
                          key={`${row.name}-${i}`}
                          className={
                            "dq-table-row " +
                            (isHeader
                              ? "dq-count-row-header"
                              : i % 2 === 0
                              ? "dq-table-row-even"
                              : "dq-table-row-odd")
                          }
                        >
                          <td>{row.name}</td>
                          <td>{row.count}</td>
                        </tr>
                      );
                    })}
                    {exceptionCountRows.length === 0 && (
                      <tr className="dq-table-row dq-table-row-even">
                        <td colSpan={2}>
                          <em>(no matching rules)</em>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {viewMode !== "security" && treeSelected && (
            <div
              className="dq-main-resizer"
              onMouseDown={startCountResize}
              onKeyDown={(e) => {
                if (!dqMainRef.current) return;
                const rect = dqMainRef.current.getBoundingClientRect();
                const min = 80;
                const max = Math.max(min, rect.height - 120);
                const step = e.shiftKey ? 40 : 10;
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCountHeight((h) =>
                    Math.max(min, (h ?? rect.height / 2) - step)
                  );
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCountHeight((h) =>
                    Math.min(max, (h ?? rect.height / 2) + step)
                  );
                }
              }}
              role="slider"
              aria-orientation="horizontal"
              aria-label="Resize Number of Exceptions"
              aria-valuenow={countHeight ?? 0}
              aria-valuemin={80}
              aria-valuemax={
                dqMainRef.current
                  ? Math.max(80, dqMainRef.current.clientHeight - 120)
                  : 800
              }
              tabIndex={0}
            />
          )}

          {(viewMode === "security" || treeSelected) && (
          <section className="dq-section">
            <h2 className="dq-section-title dq-section-title-bold">Exceptions</h2>

            {viewMode === "security" && selectedRow !== null && assets[selectedRow] && (
              <div className="dq-section-subtitle dq-asset-title">
                {assets[selectedRow].securityDescription} —{" "}
                {assets[selectedRow].aladdinId}
                {exceptionsLoading
                  ? " (loading…)"
                  : ` (${exceptions.filter((e) => e.status !== "Complete").length} exceptions)`}
              </div>
            )}

            {viewMode === "group" && (
              <div className="dq-section-subtitle dq-asset-title">
                Rule Group: {viewByGroup}
                {exceptionsLoading
                  ? " (loading…)"
                  : ` (${exceptions.filter((e) => e.status !== "Complete").length} exceptions)`}
              </div>
            )}

            {viewMode === "ruleCatalog" && (
              <div className="dq-section-subtitle dq-asset-title">
                Rule Group: {viewByGroup} / Rule Catalog: {viewByRuleCatalog}
                {exceptionsLoading
                  ? " (loading…)"
                  : ` (${exceptions.filter((e) => e.status !== "Complete").length} exceptions)`}
              </div>
            )}

            {exceptionsError && (
              <div className="dq-section-subtitle" style={{ color: "crimson" }}>
                Failed to load exceptions: {exceptionsError}
              </div>
            )}

            {exceptionsLimitExceeded && (
              <div
                className="dq-section-subtitle"
                style={{ color: "crimson", fontWeight: 700 }}
              >
                More than 1000 exceptions — refine your filters
              </div>
            )}

            <ExceptionsTable
              data={exceptions}
              showResultDataColumns={viewMode !== "security"}
            />
          </section>
          )}
        </div>
      </div>

      <div
        className={
          "dq-status-bar" + (footerBlinking ? " dq-status-bar-blinking" : "")
        }
        role="button"
        tabIndex={0}
        onClick={() => setFooterBlinking(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFooterBlinking(false);
          }
        }}
      >
        {lastEvent
          ? `Asset Id = ${lastEvent.aladdinId}, No of Exceptions = ${lastEvent.count}, Received at ${lastEvent.receivedAt}`
          : ""}
      </div>
    </div>
  );
}
