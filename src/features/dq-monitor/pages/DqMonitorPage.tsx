import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import SecurityTable, { ActionValue } from "../components/SecurityTable";
import ExceptionsTable from "../components/ExceptionsTable";
import RuleTreeView from "../components/RuleTreeView";
import type { ExceptionRow, SecurityRow } from "../components/types";
import { fetchAssets } from "../services/get-assets";
import { fetchExceptions } from "../services/get-exceptions";
import { fetchExceptionsHist } from "../services/get-exceptions-hist";
import { fetchExceptionHistDates } from "../services/get-exception-hist-dates";
import { executeSecurityRules } from "../services/execute-rules";
import { fetchExceptionTypes } from "../services/get-exception-types";
import { fetchSeverityTypes } from "../services/get-severity-types";
import { fetchPriorityTypes } from "../services/get-priority-types";
import { fetchExceptionState } from "../services/get-exception-state";
import { fetchExceptionStatus } from "../services/get-exception-status";
import { fetchDMUsers } from "../services/get-dm-users";
import { fetchRuleGroups } from "../services/get-rule-groups";
import { fetchRuleCatalogs } from "../services/get-rule-catalogs";
import { fetchRuleNames, ruleDisplayLabel } from "../services/get-rule-names";
import { subscribeToEvents } from "../services/stream-events";
import {
  exportAssetsToExcel,
  exportExceptionsToExcel,
} from "../../../utils/export-to-excel";
import { updateAssignTo } from "../services/update-assign-to";
import { updateExceptionStatus } from "../services/update-exception-status";
import { updateExceptionComments } from "../services/update-exception-comments";
import { updateExceptionSuppressDate } from "../services/update-exception-suppress-date";
import { updateExceptionAssignTo } from "../services/update-exception-assign-to";
import "../styles/dq-monitor.css";

// Render an ISO YYYY-MM-DD as MM/DD/YYYY for the "DQM Date" dropdown.
// Falls back to the raw string when it doesn't parse.
function formatDqmDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

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

  const [sidebarWidth, setSidebarWidth] = useState<number>(331);
  // Collapse/expand toggle for the whole LHS. Persisted under a
  // dedicated key so a full-page refresh brings the sidebar back to
  // whatever state the user last chose. Width when collapsed is a thin
  // rail (COLLAPSED_WIDTH); expand restores sidebarWidth.
  const COLLAPSED_WIDTH = 32;
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("dqm.sidebar.collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "dqm.sidebar.collapsed",
      sidebarCollapsed ? "1" : "0"
    );
  }, [sidebarCollapsed]);
  const sidebarResizingRef = useRef<boolean>(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  // Captured once on mount: the sidebar's content-area width at startup.
  // Used as the Number-of-Exceptions panel's maxWidth so the panel fills
  // the sidebar on initial load but never grows when the user widens it.
  const [initialSidebarContentWidth, setInitialSidebarContentWidth] = useState<
    number | null
  >(null);
  useLayoutEffect(() => {
    if (!sidebarRef.current || initialSidebarContentWidth !== null) return;
    const cs = window.getComputedStyle(sidebarRef.current);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    setInitialSidebarContentWidth(sidebarRef.current.clientWidth - padL - padR);
  }, [initialSidebarContentWidth]);

  const [assetsHeight, setAssetsHeight] = useState<number | null>(null);
  const assetsResizingRef = useRef<boolean>(false);
  const dqMainRef = useRef<HTMLDivElement | null>(null);

  // Sidebar 30/70 split between "Number of Exceptions" (top) and the View
  // Exceptions tree section (bottom). countHeight is the pixel height of
  // the top panel; null = use the CSS-default 3:7 flex ratio.
  const [countHeight, setCountHeight] = useState<number | null>(null);
  const countResizingRef = useRef<boolean>(false);
  const sidebarSplitRef = useRef<HTMLDivElement | null>(null);

  const startAssetsResize = (e: React.MouseEvent) => {
    e.preventDefault();
    assetsResizingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    sidebarResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const startCountResize = (e: React.MouseEvent) => {
    e.preventDefault();
    countResizingRef.current = true;
    document.body.style.cursor = "row-resize";
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
      if (countResizingRef.current && sidebarSplitRef.current) {
        const rect = sidebarSplitRef.current.getBoundingClientRect();
        const min = 80;
        const max = Math.max(min, rect.height - 80);
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
  // Exceptions grid post-column-filter rows, mirrored up so the header's
  // Export to Excel can hand them to exportExceptionsToExcel.
  const [visibleExceptions, setVisibleExceptions] = useState<ExceptionRow[]>(
    []
  );
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);
  const [exceptionsLimitExceeded, setExceptionsLimitExceeded] = useState(false);

  const [refreshTick, setRefreshTick] = useState(0);
  // Two event flavors reach the footer: per-asset security exceptions
  // (from ExecuteSecurityRules) and full-scope rule runs (from
  // ExecuteRules). They render differently — one carries an Aladdin id,
  // the other a rule name + type — so keep them as a discriminated union
  // rather than jamming a rule identifier into aladdinId.
  type LastEvent =
    | { kind: "security"; aladdinId: string; count: number; receivedAt: string }
    | {
        kind: "rules";
        ruleName: string;
        ruleType: string;
        count: number;
        receivedAt: string;
      };
  const [lastEvent, setLastEvent] = useState<LastEvent | null>(null);
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
  const [exceptionState, setExceptionState] = useState<string>("Pending");
  const [exceptionStateOptions, setExceptionStateOptions] = useState<string[]>([]);
  const [exceptionStatus, setExceptionStatus] = useState<string>("All");
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
  // "DQM Date" back-in-time selector for the Exceptions grid.
  //   dqmDate = ""      → read from the live EXCEPTION table (default).
  //   dqmDate = "YYYY-MM-DD" → read from EXCEPTION_HIST for that day's
  //                            LATEST BATCH_ID within the tree scope.
  // histDates is the sorted-DESC list of ISO dates from SP_GET_EXCEPTION_
  // HIST_DATES (last 60 days). todayIsoDate is the "Current" option's
  // display label (matches the EXCEPTION table's EXCEPTION_DATE).
  const [dqmDate, setDqmDate] = useState<string>("");
  const [histDates, setHistDates] = useState<string[]>([]);
  const todayIsoDate = useMemo<string>(() => {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);
  // Rule groups with FLAG_STATUS_VISIBLE = true (from SP_GET_RULE_GROUPS).
  // Drives the STATUS filter panel + STATUS column in the Exceptions grid.
  const [statusVisibleGroups, setStatusVisibleGroups] = useState<Set<string>>(
    new Set()
  );
  // Rule groups with FLAG_COMMENTS_VISIBLE = true. Drives the trailing
  // editable COMMENTS column in the Exceptions grid.
  const [commentsVisibleGroups, setCommentsVisibleGroups] = useState<
    Set<string>
  >(new Set());
  // Rule groups with FLAG_SUPPRESS_DATE = true. Drives the editable
  // SUPPRESS_DATE column (date input) in the Exceptions grid.
  const [suppressDateVisibleGroups, setSuppressDateVisibleGroups] = useState<
    Set<string>
  >(new Set());
  // Rule groups with FLAG_ASSIGN_TO_VISIBLE = true. Drives the editable
  // ASSIGN TO column (DM_USER dropdown) in the Exceptions grid.
  const [assignToVisibleGroups, setAssignToVisibleGroups] = useState<
    Set<string>
  >(new Set());
  const showStatusPanel =
    viewMode !== "security" && statusVisibleGroups.has(viewByGroup);
  const showCommentsColumn =
    viewMode !== "security" && commentsVisibleGroups.has(viewByGroup);
  const showSuppressDateColumn =
    viewMode !== "security" && suppressDateVisibleGroups.has(viewByGroup);
  const showAssignToColumn =
    viewMode !== "security" && assignToVisibleGroups.has(viewByGroup);
  const DEFAULT_STATUS_FILTER = useMemo(
    () => new Set<string>(["New", "Challenge", "Override"]),
    []
  );
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set<string>(["New", "Challenge", "Override"])
  );
  const [statusComboOpen, setStatusComboOpen] = useState<boolean>(false);
  const statusComboRef = useRef<HTMLDivElement | null>(null);
  const [viewByRuleCatalog, setViewByRuleCatalog] = useState<string>("All");
  const [viewByRule, setViewByRule] = useState<string>("All");
  // Display label for the currently-selected rule (RULE_DESCRIPTION when
  // present, RULE_NAME otherwise) — surfaced in the Exceptions header
  // subtitle when viewMode === "rule". Empty when no specific rule is in
  // scope; the subtitle then omits the "Rule: ..." segment.
  const [viewByRuleLabel, setViewByRuleLabel] = useState<string>("");
  const [ruleOptions, setRuleOptions] = useState<string[]>([]);
  const [ruleNameSearchApplied, setRuleNameSearchApplied] = useState<string>("");
  const [ruleQuery, setRuleQuery] = useState<string>("");
  const [ruleComboOpen, setRuleComboOpen] = useState<boolean>(false);
  const ruleComboRef = useRef<HTMLDivElement | null>(null);

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

  // View by Security is only meaningful inside the Security Master rule
  // group. If the user navigates away (picks a different group / catalog
  // / rule), force the RHS back to the exceptions view so the header
  // toggle can disappear cleanly.
  useEffect(() => {
    if (viewByGroup !== "Security Master" && viewMode === "security") {
      setViewMode("rule");
    }
  }, [viewByGroup, viewMode]);

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
    fetchExceptionState(controller.signal)
      .then((codes) => setExceptionStateOptions(codes))
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
      .then((groups) => {
        setRuleGroupOptions(groups.map((g) => g.name).filter(Boolean));
        setStatusVisibleGroups(
          new Set(
            groups
              .filter((g) => g.flagStatusVisible && g.name)
              .map((g) => g.name)
          )
        );
        setCommentsVisibleGroups(
          new Set(
            groups
              .filter((g) => g.flagCommentsVisible && g.name)
              .map((g) => g.name)
          )
        );
        setSuppressDateVisibleGroups(
          new Set(
            groups
              .filter((g) => g.flagSuppressDate && g.name)
              .map((g) => g.name)
          )
        );
        setAssignToVisibleGroups(
          new Set(
            groups
              .filter((g) => g.flagAssignToVisible && g.name)
              .map((g) => g.name)
          )
        );
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  // Populate the "DQM Date" dropdown once from EXCEPTION_HIST. Silently
  // no-op on AbortError; other failures just leave the list empty
  // (dropdown falls back to the "Current" option only).
  useEffect(() => {
    const controller = new AbortController();
    fetchExceptionHistDates(controller.signal)
      .then((dates) => setHistDates(dates))
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
    if (!statusComboOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        statusComboRef.current &&
        !statusComboRef.current.contains(e.target as Node)
      ) {
        setStatusComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusComboOpen]);

  useEffect(() => {
    if (!viewByRuleCatalog || viewByRuleCatalog === "All") {
      setRuleOptions([]);
      setViewByRule("All");
      setRuleQuery("");
      setRuleNameSearchApplied("");
      return;
    }
    const controller = new AbortController();
    fetchRuleNames(viewByRuleCatalog, controller.signal)
      .then((rules) => {
        const names = rules.map((r) => r.rule_name);
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
          kind: "security",
          aladdinId,
          count,
          receivedAt,
        });
        if (
          event.type === "security_exception.inserted" &&
          aladdinId
        ) {
          setBlinkingAladdinId(aladdinId);
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
      } else if (event.type === "rules.executed") {
        // ExecuteRules fires this once per run — no per-asset detail, just
        // rule scope + total inserted count. Refresh the grids and light
        // the footer so the user knows the run finished.
        const payload = (event.payload ?? {}) as {
          rule_name?: string;
          rule_type?: string;
          count?: number;
        };
        const ruleName = payload.rule_name ?? "";
        const ruleType = payload.rule_type ?? "";
        const count = typeof payload.count === "number" ? payload.count : 0;
        const receivedAt = new Date().toLocaleTimeString();
        setLastEvent({
          kind: "rules",
          ruleName,
          ruleType,
          count,
          receivedAt,
        });
        setFooterBlinking(true);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification("TCW-DQM", {
              body: `Rule = ${ruleName} (${ruleType}), No of Exceptions = ${count}, Received at ${receivedAt}`,
              tag: "tcw-dqm-rules-executed",
            });
          } catch {
            /* ignore — some browsers throw when window is unfocused */
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
    fetchAssets(controller.signal, dqmType, severity, priority, viewByRuleCatalog, viewByRule, exceptionState, assignToFilter, viewByGroup)
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
  }, [refreshTick, dqmType, severity, priority, viewByRuleCatalog, viewByRule, exceptionState, assignToFilter, viewByGroup]);

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
    if (
      !usesAsset &&
      viewByGroup === "All" &&
      viewByRuleCatalog === "All" &&
      viewByRule === "All" &&
      !ruleNameSearchApplied
    ) {
      // Tree 'All' selected — RHS exceptions grid stays empty; the LHS
      // Number of Exceptions panel populates from per-group counts in a
      // separate effect.
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
    // Empty dqmDate → live EXCEPTION table. Non-empty ISO date → the
    // LATEST BATCH_ID for that day from EXCEPTION_HIST, scoped by tree.
    const fetcher = dqmDate
      ? fetchExceptionsHist(
          dqmDate,
          assetArg,
          controller.signal,
          dqmType,
          severity,
          priority,
          ruleCatalogArg,
          viewByRule,
          ruleGroupArg,
          exceptionState,
          assignToFilter,
          ruleNameSearchApplied
        )
      : fetchExceptions(
          assetArg,
          controller.signal,
          dqmType,
          severity,
          priority,
          ruleCatalogArg,
          viewByRule,
          ruleGroupArg,
          exceptionState,
          assignToFilter,
          ruleNameSearchApplied
        );
    fetcher
      .then((rows) => {
        if (rows.length > 2000) {
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
    exceptionState,
    assignToFilter,
    ruleNameSearchApplied,
    treeSelected,
    dqmDate,
  ]);

  // When 'All' is selected on the tree, the Number of Exceptions panel
  // shows one row per rule group. ExceptionRow does not carry rule_group,
  // so we hit GET_EXCEPTIONS once per group (rule_group=<name>) and just
  // count the rows. Refresh on the same triggers as the main exceptions
  // fetch so SSE-driven refreshes and filter changes flow through.
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const inAllMode =
      viewMode !== "security" &&
      treeSelected &&
      viewByGroup === "All" &&
      viewByRuleCatalog === "All" &&
      viewByRule === "All" &&
      !ruleNameSearchApplied;
    if (!inAllMode || ruleGroupOptions.length === 0) {
      setGroupCounts({});
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const entries = await Promise.all(
          ruleGroupOptions.map(async (g) => {
            const rows = await fetchExceptions(
              "",
              controller.signal,
              dqmType,
              severity,
              priority,
              undefined,
              "All",
              g,
              exceptionState,
              assignToFilter,
              ""
            );
            return [g, rows.length] as const;
          })
        );
        if (!cancelled) {
          const next: Record<string, number> = {};
          for (const [g, n] of entries) next[g] = n;
          setGroupCounts(next);
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;

        console.error("groupCounts fetch failed", e);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    viewMode,
    treeSelected,
    viewByGroup,
    viewByRuleCatalog,
    viewByRule,
    ruleNameSearchApplied,
    ruleGroupOptions,
    refreshTick,
    dqmType,
    severity,
    priority,
    exceptionState,
    assignToFilter,
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
            const rules = await fetchRuleNames(typeName);
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

  // Shared filtered slice used by every count that must agree with the
  // grid. The grid itself already filters by statusFilter when the
  // Status panel is shown (see the ExceptionsTable data prop below), so
  // mirror that here: when the panel is on and the user has narrowed
  // the status set, counts must exclude rows outside that set. When the
  // panel is off, no additional filtering — every row loaded counts.
  const statusFilteredExceptions = useMemo<ExceptionRow[]>(() => {
    if (!showStatusPanel) return exceptions;
    return exceptions.filter((r) => statusFilter.has(r.status));
  }, [exceptions, showStatusPanel, statusFilter]);

  // "New: 45  Accept: 3  Suppress: 30 ..." breakdown shown above the
  // Exceptions grid for groups that expose the Status column
  // (RULE_GROUP.FLAG_STATUS_VISIBLE — Security Master today). Counts
  // come from the unfiltered `exceptions` set so users see the full
  // picture regardless of what the Status filter is currently
  // narrowing to — the whole point is to know how many rows sit in
  // each bucket before choosing which to view. Statuses with zero
  // count are omitted; canonical order comes from exceptionStatusOptions.
  const statusBreakdown = useMemo<{ status: string; count: number }[]>(() => {
    if (!showStatusPanel) return [];
    const counts = new Map<string, number>();
    for (const e of exceptions) {
      counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
    }
    return exceptionStatusOptions
      .filter((s) => (counts.get(s) ?? 0) > 0)
      .map((s) => ({ status: s, count: counts.get(s) ?? 0 }));
  }, [showStatusPanel, exceptions, exceptionStatusOptions]);

  // Tree-selection actions extracted here so both the RuleTreeView and
  // the "Number of Exceptions" panel below invoke the same state
  // transitions. Clicking a row in the count panel needs to behave
  // identically to clicking the equivalent node in the tree.
  const selectAllTree = useCallback(() => {
    setViewMode((m) => (m === "security" ? m : "rule"));
    setViewByGroup("All");
    setViewByRuleCatalog("All");
    setViewByRule("All");
    setViewByRuleLabel("");
    setRuleNameSearchApplied("");
    setTreeSelected(true);
  }, []);
  const selectGroupTree = useCallback((g: string) => {
    setViewMode((m) => (m === "security" ? m : "group"));
    setViewByGroup(g);
    setViewByRuleCatalog("All");
    setViewByRule("All");
    setViewByRuleLabel("");
    setRuleNameSearchApplied("");
    setTreeSelected(true);
  }, []);
  const selectTypeTree = useCallback((g: string, t: string) => {
    setViewMode((m) => (m === "security" ? m : "ruleCatalog"));
    setViewByGroup(g);
    setViewByRuleCatalog(t);
    setViewByRule("All");
    setViewByRuleLabel("");
    setRuleNameSearchApplied("");
    setTreeSelected(true);
  }, []);
  const selectRuleTree = useCallback(
    (g: string, t: string, r: string, label: string) => {
      setViewMode((m) => (m === "security" ? m : "rule"));
      setViewByGroup(g);
      setViewByRuleCatalog(t);
      setViewByRule(r);
      setViewByRuleLabel(label);
      setRuleNameSearchApplied("");
      setTreeSelected(true);
    },
    []
  );

  // Given a row's position in the "Number of Exceptions" panel, decide
  // which tree-equivalent selection it should trigger when clicked.
  // Returns null when the row shouldn't be clickable (security mode).
  const countRowAction = useCallback(
    (row: { name: string; count: number }, i: number): (() => void) | null => {
      if (viewMode === "security") return null;
      const inAllScope =
        viewByGroup === "All" &&
        viewByRuleCatalog === "All" &&
        viewByRule === "All" &&
        !ruleNameSearchApplied;
      if (inAllScope) {
        // Rows are rule groups.
        return () => selectGroupTree(row.name);
      }
      if (viewMode === "group") {
        // Row 0 is the group header; rest are rule catalogs under it.
        return i === 0
          ? () => selectGroupTree(row.name)
          : () => selectTypeTree(viewByGroup, row.name);
      }
      if (viewMode === "ruleCatalog") {
        // Row 0 is the catalog header; rest are rules under it.
        return i === 0
          ? () => selectTypeTree(viewByGroup, viewByRuleCatalog)
          : () =>
              selectRuleTree(
                viewByGroup,
                viewByRuleCatalog,
                row.name,
                row.name
              );
      }
      // viewMode === "rule" fallthrough — every row is a rule.
      return () =>
        selectRuleTree(viewByGroup, viewByRuleCatalog, row.name, row.name);
    },
    [
      viewMode,
      viewByGroup,
      viewByRuleCatalog,
      viewByRule,
      ruleNameSearchApplied,
      selectGroupTree,
      selectTypeTree,
      selectRuleTree,
    ]
  );

  // Counts shown in the "Number of Exceptions" grid. Row 1 is the current
  // scope (group / rule type), subsequent rows are the breakdown one level
  // deeper. Derived from statusFilteredExceptions so the panel tracks
  // whatever status subset is currently visible in the bottom grid.
  const exceptionCountRows = useMemo<{ name: string; count: number }[]>(() => {
    if (viewMode === "security") return [];

    if (viewMode === "group") {
      if (!viewByGroup || viewByGroup === "All") return [];
      const rows: { name: string; count: number }[] = [
        { name: viewByGroup, count: statusFilteredExceptions.length },
      ];
      const byType = new Map<string, number>();
      for (const e of statusFilteredExceptions) {
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
        { name: viewByRuleCatalog, count: statusFilteredExceptions.length },
      ];
      const byRule = new Map<string, number>();
      for (const e of statusFilteredExceptions) {
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

    // 'All' selected on the tree (nothing scoped yet) — one row per rule
    // group, populated from the per-group fetch in the groupCounts effect.
    // groupCounts is fetched per-group without status context, so it
    // stays unfiltered here; the panel labels this as an "All" summary
    // and doesn't claim to reflect the status subset.
    if (
      viewByGroup === "All" &&
      viewByRuleCatalog === "All" &&
      viewByRule === "All" &&
      !ruleNameSearchApplied
    ) {
      return ruleGroupOptions
        .map((g) => ({ name: g, count: groupCounts[g] ?? 0 }))
        .sort((a, b) => b.count - a.count);
    }

    // viewMode === "rule" — flat list of rules and their counts.
    const counts = new Map<string, number>();
    for (const e of statusFilteredExceptions) {
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
    viewByRule,
    ruleNameSearchApplied,
    statusFilteredExceptions,
    ruleCatalogByRuleName,
    ruleGroupOptions,
    groupCounts,
  ]);

  return (
    <div className="dq-page">
      <Header
        onExportClick={() =>
          viewMode === "security"
            ? exportAssetsToExcel(visibleAssets)
            : exportExceptionsToExcel(visibleExceptions)
        }
        // DATA QUALITY MONITOR (left) + View by Security toggle + Export
        // to Excel (right) all share the top row. Status breakdown, when
        // present, drops into a middle column left-aligned with the
        // Exceptions grid — breakdownLeftOffset matches the sidebar's
        // outer width (sidebar + gap + resizer + gap) so it lines up
        // with the grid regardless of collapse / user resize.
        modeToggleLabel={
          viewByGroup === "Security Master"
            ? viewMode === "security"
              ? "View Exceptions"
              : "View by Security"
            : undefined
        }
        onModeToggleClick={() => {
          setViewMode((m) => (m === "security" ? "rule" : "security"));
          setTreeSelected(true);
        }}
        breakdown={
          statusBreakdown.length > 0 ? (
            <>
              <span key="__total">
                <strong>Total:</strong>{" "}
                {statusBreakdown.reduce((s, x) => s + x.count, 0)}
              </span>
              <span key="__total-sep" className="dq-header-breakdown-sep">
                {" | "}
              </span>
              {statusBreakdown.map(({ status, count }, i) => {
                // No per-status background on the breakdown line — the
                // grid-row coloring already telegraphs which statuses
                // count as completed, so shading the count text was
                // redundant / distracting.
                return (
                  <React.Fragment key={status}>
                    <span>
                      <strong>{status}:</strong> {count}
                    </span>
                    {i < statusBreakdown.length - 1 && (
                      <span className="dq-header-breakdown-sep">
                        {" | "}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          ) : undefined
        }
        breakdownLeftOffset={
          (sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth) +
          (sidebarCollapsed ? 12 : 30)
        }
      />

      <div className="dq-body">
        <aside
          ref={sidebarRef}
          className={
            "dq-sidebar" + (sidebarCollapsed ? " dq-sidebar-collapsed" : "")
          }
          style={{
            flex: `0 0 ${sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth}px`,
          }}
        >
          {sidebarCollapsed ? (
            <button
              type="button"
              className="dq-sidebar-toggle dq-sidebar-toggle-collapsed"
              aria-label="Expand filters sidebar"
              title="Expand"
              onClick={() => setSidebarCollapsed(false)}
            >
              ▶
            </button>
          ) : (
            <button
              type="button"
              className="dq-sidebar-toggle dq-sidebar-toggle-expanded"
              aria-label="Collapse filters sidebar"
              title="Collapse"
              onClick={() => setSidebarCollapsed(true)}
            >
              ◀
            </button>
          )}
          {/* When collapsed, .dq-sidebar-collapsed CSS hides every child
              except .dq-sidebar-toggle so the inner sidebar state
              (filters, tree, refs) stays mounted and just re-appears on
              expand — no reset, no refetch. */}
          {viewMode === "security" && (
            <>
              <div className="dq-sidebar-row">
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
              </div>

              <div className="dq-sidebar-row">
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
              </div>

              <div className="dq-sidebar-row">
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
              </div>

              <div className="dq-sidebar-row">
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
              </div>

              <div className="dq-sidebar-row">
                <h3 className="dq-sidebar-title">Exception State</h3>
                <select
                  className="dq-sidebar-select"
                  value={exceptionState}
                  onChange={(e) => setExceptionState(e.target.value)}
                >
                  <option value="All">All</option>
                  {exceptionStateOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dq-sidebar-row">
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
              </div>
            </>
          )}

          <div className="dq-sidebar-split" ref={sidebarSplitRef}>
            {viewMode !== "security" && treeSelected && (
              <div
                className="dq-sidebar-count"
                style={
                  countHeight !== null
                    ? { flex: `0 0 ${countHeight}px` }
                    : undefined
                }
              >
                <h3 className="dq-sidebar-title">Number of Exceptions</h3>
                <div
                  className="dq-sidebar-count-scroll"
                  style={
                    initialSidebarContentWidth !== null
                      ? { maxWidth: initialSidebarContentWidth }
                      : undefined
                  }
                >
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
                        const action = countRowAction(row, i);
                        return (
                          <tr
                            key={`${row.name}-${i}`}
                            className={
                              "dq-table-row " +
                              (isHeader
                                ? "dq-count-row-header"
                                : i % 2 === 0
                                ? "dq-table-row-even"
                                : "dq-table-row-odd") +
                              (action ? " dq-count-row-clickable" : "")
                            }
                            // Row click mirrors the tree — same drill-down
                            // as if the user had clicked the equivalent
                            // node under View Exceptions. onKeyDown +
                            // role/tabIndex give keyboard parity.
                            role={action ? "button" : undefined}
                            tabIndex={action ? 0 : undefined}
                            onClick={action ?? undefined}
                            onKeyDown={
                              action
                                ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      action();
                                    }
                                  }
                                : undefined
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
              </div>
            )}

            {viewMode !== "security" && treeSelected && (
              <div
                className="dq-sidebar-vresizer"
                onMouseDown={startCountResize}
                onKeyDown={(e) => {
                  if (!sidebarSplitRef.current) return;
                  const rect = sidebarSplitRef.current.getBoundingClientRect();
                  const min = 80;
                  const max = Math.max(min, rect.height - 80);
                  const step = e.shiftKey ? 40 : 10;
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCountHeight((h) =>
                      Math.max(min, (h ?? rect.height * 0.3) - step)
                    );
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCountHeight((h) =>
                      Math.min(max, (h ?? rect.height * 0.3) + step)
                    );
                  }
                }}
                role="slider"
                aria-orientation="horizontal"
                aria-label="Resize Number of Exceptions"
                aria-valuenow={countHeight ?? 0}
                aria-valuemin={80}
                aria-valuemax={
                  sidebarSplitRef.current
                    ? Math.max(80, sidebarSplitRef.current.clientHeight - 80)
                    : 600
                }
                tabIndex={0}
              />
            )}

            <div className="dq-sidebar-tree-wrap">
              {/* Exceptions Date only makes sense in tree modes (rule
                  group / catalog / rule). In "View by Security" mode
                  the RHS grid is the SecurityTable, which is always
                  driven from the live EXCEPTION table — hiding the
                  date selector avoids implying a control that has no
                  effect on that view. */}
              {viewMode !== "security" && (
                <div className="dq-sidebar-row dq-dqm-date-row">
                  <label
                    className="dq-sidebar-title"
                    htmlFor="dq-dqm-date-select"
                  >
                    Exceptions Date
                  </label>
                  <select
                    id="dq-dqm-date-select"
                    className="dq-sidebar-select"
                    value={dqmDate}
                    onChange={(e) => setDqmDate(e.target.value)}
                  >
                    {/* Empty value = live EXCEPTION table. Display label
                        shows today's ISO date so the user sees the same
                        EXCEPTION_DATE that's in the current EXCEPTION rows. */}
                    <option value="">
                      {formatDqmDate(todayIsoDate)}
                    </option>
                    {histDates
                      .filter((d) => d !== todayIsoDate)
                      .map((d) => (
                        <option key={d} value={d}>
                          {formatDqmDate(d)}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <h3 className="dq-sidebar-title">View Exceptions</h3>

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

          <RuleTreeView
            groups={ruleGroupOptions}
            getTypes={(group) => fetchRuleCatalogs(group)}
            getRules={async (type) => {
              const rules = await fetchRuleNames(type);
              return rules.map((r) => ({
                name: r.rule_name,
                label: ruleDisplayLabel(r),
              }));
            }}
            selection={{
              group: viewByGroup,
              type: viewByRuleCatalog,
              rule: viewByRule,
            }}
            hasSelection={treeSelected}
            onSelectAll={selectAllTree}
            onSelectGroup={selectGroupTree}
            onSelectType={selectTypeTree}
            onSelectRule={selectRuleTree}
          />
            </div>
          </div>

        </aside>

        {!sidebarCollapsed && (
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
        )}

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
              <h2 className="dq-section-title dq-section-title-bold">Assets</h2>
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
                      executeSecurityRules(
                        assetId,
                        idBbGlobal,
                        "Security Master",
                        "GROUP"
                      ).catch((e) => {
                        console.error("executeSecurityRules failed", e);
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

          {(viewMode === "security" || treeSelected) && (
          <section className="dq-section">
            <div className="dq-section-header">
              <h2 className="dq-section-title dq-section-title-bold">Exceptions</h2>

              {viewMode === "security" && selectedRow !== null && assets[selectedRow] && (
                <span className="dq-section-header-subtitle">
                  — {assets[selectedRow].securityDescription} — {assets[selectedRow].aladdinId}
                  {exceptionsLoading
                    ? " (loading…)"
                    : ` (${statusFilteredExceptions.filter((e) => e.state !== "Complete").length} exceptions)`}
                </span>
              )}

              {viewMode === "group" && (
                <span className="dq-section-header-subtitle">
                  — Rule Group: {viewByGroup}
                  {exceptionsLoading
                    ? " (loading…)"
                    : ` (${statusFilteredExceptions.filter((e) => e.state !== "Complete").length} exceptions)`}
                </span>
              )}

              {viewMode === "ruleCatalog" && (
                <span className="dq-section-header-subtitle">
                  — Rule Group: {viewByGroup} / Rule Catalog: {viewByRuleCatalog}
                  {exceptionsLoading
                    ? " (loading…)"
                    : ` (${statusFilteredExceptions.filter((e) => e.state !== "Complete").length} exceptions)`}
                </span>
              )}

              {viewMode === "rule" && viewByRule && viewByRule !== "All" && (
                <span className="dq-section-header-subtitle">
                  — Rule: {viewByRuleLabel || viewByRule}
                  {viewByRuleCatalog && viewByRuleCatalog !== "All"
                    ? ` / Rule Group: ${viewByGroup} / Rule Catalog: ${viewByRuleCatalog}`
                    : viewByGroup && viewByGroup !== "All"
                    ? ` / Rule Group: ${viewByGroup}`
                    : ""}
                  {exceptionsLoading
                    ? " (loading…)"
                    : ` (${statusFilteredExceptions.filter((e) => e.state !== "Complete").length} exceptions)`}
                </span>
              )}
            </div>

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
                More than 2000 exceptions — refine your filters
              </div>
            )}

            {showStatusPanel && (
              <div className="dq-status-filter">
                <label
                  className="dq-status-filter-label"
                  htmlFor="dq-status-combo-trigger"
                  id="dq-status-combo-label"
                >
                  Status
                </label>
                <div
                  className="dq-status-combo"
                  ref={statusComboRef}
                >
                  <button
                    type="button"
                    id="dq-status-combo-trigger"
                    className="dq-status-combo-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={statusComboOpen}
                    aria-labelledby="dq-status-combo-label dq-status-combo-trigger"
                    onClick={() => setStatusComboOpen((v) => !v)}
                  >
                    <span className="dq-status-combo-summary">
                      {statusFilter.size === 0
                        ? "None"
                        : Array.from(statusFilter).join(", ")}
                    </span>
                    <span className="dq-status-combo-caret">▾</span>
                  </button>
                  {statusComboOpen && (
                    <div
                      className="dq-status-combo-popover"
                      role="group"
                      aria-labelledby="dq-status-combo-label"
                    >
                      {exceptionStatusOptions.map((code) => {
                        const checked = statusFilter.has(code);
                        return (
                          <label
                            key={code}
                            className="dq-status-combo-item"
                          >
                            <input
                              type="checkbox"
                              className="dq-status-combo-check"
                              checked={checked}
                              onChange={() => {
                                setStatusFilter((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(code)) next.delete(code);
                                  else next.add(code);
                                  return next;
                                });
                              }}
                            />
                            <span>{code}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <ExceptionsTable
              data={
                showStatusPanel
                  ? exceptions.filter((r) => statusFilter.has(r.status))
                  : exceptions
              }
              showResultDataColumns={viewMode !== "security"}
              // In group mode (e.g. Security Master selected) the grid
              // spans catalogs whose RESULT_DATA differs; surface
              // RULE_NAME + ALADDIN_ID right after Comments so mixed-
              // catalog runs stay readable. Other modes keep the raw
              // projection order.
              priorityRdKeys={
                viewMode === "group" ? ["RULE_NAME", "ALADDIN_ID"] : undefined
              }
              onVisibleRowsChange={setVisibleExceptions}
              statusOptions={
                showStatusPanel ? exceptionStatusOptions : undefined
              }
              onStatusChange={
                showStatusPanel
                  ? (exceptionId, status) =>
                      updateExceptionStatus(exceptionId, status)
                        .then(() => setRefreshTick((n) => n + 1))
                        .catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error("updateExceptionStatus failed", err);
                        })
                  : undefined
              }
              showCommentsColumn={showCommentsColumn}
              onCommentsChange={
                showCommentsColumn
                  ? (exceptionId, comments) =>
                      updateExceptionComments(exceptionId, comments).catch(
                        (err) => {
                          // eslint-disable-next-line no-console
                          console.error(
                            "updateExceptionComments failed",
                            err
                          );
                        }
                      )
                  : undefined
              }
              showSuppressDateColumn={showSuppressDateColumn}
              onSuppressDateChange={
                showSuppressDateColumn
                  ? (exceptionId, suppressDate) => {
                      // Setting a suppress date implies the exception is
                      // being suppressed — flip status to "Suppress" in
                      // the same commit so the two fields stay in sync.
                      // Clearing the date leaves status alone (the user
                      // presumably wants to keep whatever status they had
                      // before enrolling into suppression).
                      const p1 = updateExceptionSuppressDate(
                        exceptionId,
                        suppressDate
                      );
                      const p2 = suppressDate
                        ? updateExceptionStatus(exceptionId, "Suppress")
                        : Promise.resolve(0);
                      return Promise.all([p1, p2])
                        .then(() => setRefreshTick((n) => n + 1))
                        .catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error(
                            "updateExceptionSuppressDate/Status failed",
                            err
                          );
                        });
                    }
                  : undefined
              }
              showAssignToColumn={showAssignToColumn}
              assignToOptions={
                showAssignToColumn ? dmUserOptions : undefined
              }
              onAssignToChange={
                showAssignToColumn
                  ? (exceptionId, assignTo) =>
                      updateExceptionAssignTo(exceptionId, assignTo)
                        .then(() => setRefreshTick((n) => n + 1))
                        .catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error(
                            "updateExceptionAssignTo failed",
                            err
                          );
                        })
                  : undefined
              }
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
          ? lastEvent.kind === "rules"
            ? `Rule = ${lastEvent.ruleName} (${lastEvent.ruleType}), No of Exceptions = ${lastEvent.count}, Received at ${lastEvent.receivedAt}`
            : `Asset Id = ${lastEvent.aladdinId}, No of Exceptions = ${lastEvent.count}, Received at ${lastEvent.receivedAt}`
          : ""}
      </div>
    </div>
  );
}
