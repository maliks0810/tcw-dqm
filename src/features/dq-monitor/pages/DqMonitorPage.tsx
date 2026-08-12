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
import { fetchDMRole } from "../services/get-dm-role";
import { fetchRuleGroupsForUser } from "../services/get-rule-groups-for-user";
import { fetchRuleCatalogs } from "../services/get-rule-catalogs";
import { fetchRuleNames, ruleDisplayLabel } from "../services/get-rule-names";
import { fetchRulesForGroup } from "../services/get-rules-for-group";
import { fetchExceptionCountsByGroup } from "../services/get-exception-counts-by-group";
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
import { updateBulkAssign } from "../services/update-bulk-assign";
import { updateBulkStatus } from "../services/update-bulk-status";
import "../styles/dq-monitor.css";

// Cap on how many EXCEPTION rows we render in the grid at once. Bigger
// result sets short-circuit into the "refine your filters" hint so the
// browser doesn't lock up rendering thousands of rows. Configured via
// REACT_APP_EXCEPTION_LIMIT in the .env* files with a safe 5000
// fallback for the pathological case where the env var is missing or
// non-numeric — same default we ship in every env file.
const EXCEPTION_LIMIT: number = (() => {
  const raw = process.env.REACT_APP_EXCEPTION_LIMIT;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5000;
})();

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

  // Optimistic patch: after a successful per-row update (STATUS / ASSIGN
  // TO / COMMENTS / SUPPRESS DATE), merge the fields we know changed
  // straight into local state — no SP_GET_EXCEPTIONS refetch, no
  // full-grid rebuild. Derived fields the SP computes server-side
  // (OPEN_DATE / CLOSE_DATE ratchets) are replicated here so the grid
  // matches what the backend will show on the next natural refetch.
  // On backend failure the callers fall back to setRefreshTick so any
  // drift reconciles from source of truth.
  const patchExceptionRow = useCallback(
    (exceptionId: number, patch: Partial<ExceptionRow>) => {
      setExceptions((prev) =>
        prev.map((r) =>
          r.exceptionId === exceptionId ? { ...r, ...patch } : r
        )
      );
    },
    []
  );

  // Today's date in ISO YYYY-MM-DD (UTC), matching how the backend
  // stamps OPEN_DATE / CLOSE_DATE inside SP_UPDATE_EXCEPTION_STATUS
  // (CURRENT_DATE at UTC via CONVERT_TIMEZONE). Small helper because
  // both derivations below (open / close) need the same value.
  const isoTodayUtc = (): string => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
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
  // Empty string = "no filter" — the exceptions fetcher omits the
  // URL param when this is falsy, so the backend SP treats it as
  // NULL. Only View by Security mode renders the Type dropdown, and
  // fetchExceptionTypes below only fires when that mode is first
  // entered — so in View Exceptions mode this stays empty and the
  // exceptions fetch never applies a bogus type filter.
  const [dqmType, setDqmType] = useState<string>("");
  const [exceptionTypes, setExceptionTypes] = useState<string[]>([]);
  const [priority, setPriority] = useState<string>("All");
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [assignToFilter, setAssignToFilter] = useState<string>("All");
  const [dmUserOptions, setDmUserOptions] = useState<string[]>([]);
  // Current operator's DM_USER.USER value. Hard-coded pre-Okta —
  // once integration lands, replace with whatever the auth context's
  // getUser() exposes. Powers the getDMRole call below.
  const currentDmUser = "Joann Banks";
  // dmRole gates the Bulk Assign / Bulk Status buttons (only visible
  // to DM_ADMIN) and the per-row Assign To column's editability (also
  // DM_ADMIN only). Empty string is the least-privileged default —
  // hides the buttons and locks Assign To — used until the fetch
  // returns and if the operator's user isn't in DM_USER.
  const [dmRole, setDmRole] = useState<string>("");
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
  // histDates is populated by SP_GET_EXCEPTION_HIST_DATES, which now
  // unions MAX(EXCEPTION.EXCEPTION_DATE) with distinct
  // EXCEPTION_HIST.EXCEPTION_DATE — so index 0 is the current live
  // date (top of the dropdown label, submits value="" to fetch from
  // the live EXCEPTION table), and the rest are prior HIST dates.
  // No client-side UTC calculation — the labels come straight from
  // what the two tables actually contain.
  const [dqmDate, setDqmDate] = useState<string>("");
  const [histDates, setHistDates] = useState<string[]>([]);
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
  // Status filter starts empty and gets seeded with EVERY status
  // returned by SP_GET_EXCEPTION_STATUS as soon as that fetch lands
  // (see the seed effect right below the fetchExceptionStatus
  // callsite). Empty here means "not yet seeded" rather than "hide
  // all" — the statusFilteredExceptions memo below guards on
  // statusFilter.size === 0 to avoid a first-render flash where the
  // grid would appear empty for the ~200ms until options arrive.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set<string>()
  );
  // Set true once the "seed statusFilter from exceptionStatusOptions"
  // effect has run so it never re-fires after the user has customized
  // the filter (e.g., deliberately unticked everything).
  const statusFilterSeededRef = useRef<boolean>(false);
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

  // Bulk processing panel state. Panel opens when the user clicks Bulk
  // Assign (only visible under viewByGroup === "Security Master" and
  // viewMode !== "security"); the rule dropdown is multi-select via a
  // checkbox combo (same pattern as .dq-status-combo above).
  const [bulkPanelOpen, setBulkPanelOpen] = useState<boolean>(false);
  // Bulk Status is the sibling of Bulk Assign — same gating rules,
  // same "toggle a panel via the header button" pattern. Same
  // multi-select rule combo as Bulk Assign; single-select STATUS
  // dropdown driven by exceptionStatusOptions; free-text COMMENTS
  // sized to match the grid's Comments column; Update Status button.
  const [bulkStatusPanelOpen, setBulkStatusPanelOpen] =
    useState<boolean>(false);
  const [bulkStatusSelectedRules, setBulkStatusSelectedRules] = useState<
    Set<string>
  >(() => new Set<string>());
  const [bulkStatusRuleComboOpen, setBulkStatusRuleComboOpen] =
    useState<boolean>(false);
  const bulkStatusRuleComboRef = useRef<HTMLDivElement | null>(null);
  const [bulkStatusSelected, setBulkStatusSelected] = useState<string>("");
  // Suppress Date follows the exact same commit rules as the grid's
  // SuppressDateCell (see ExceptionsTable): min = today, max = today
  // + 2 years, empty means "leave the field alone" — bulk has no
  // clear affordance, so an empty submit is a no-op on this column.
  const [bulkStatusSuppressDate, setBulkStatusSuppressDate] =
    useState<string>("");
  const [bulkStatusComments, setBulkStatusComments] = useState<string>("");
  // "Clear Comments" checkbox — when true, submit sends comments=""
  // regardless of the text-box value; when false + blank textbox,
  // submit sends comments=null so existing comments stay intact.
  const [bulkStatusClearComments, setBulkStatusClearComments] =
    useState<boolean>(false);
  const [bulkStatusSubmitting, setBulkStatusSubmitting] =
    useState<boolean>(false);
  const [bulkStatusMessage, setBulkStatusMessage] = useState<string>("");
  const [bulkSelectedRules, setBulkSelectedRules] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [bulkRuleComboOpen, setBulkRuleComboOpen] = useState<boolean>(false);
  const bulkRuleComboRef = useRef<HTMLDivElement | null>(null);
  // Second Bulk Assign dropdown: DM_USER pick. Single-select — reuses
  // dmUserOptions already fetched for the per-row Assign To cell.
  const [bulkSelectedUser, setBulkSelectedUser] = useState<string>("");
  // Is Permanent (checkbox next to Assign). When true the backend
  // writes RULE.ASSIGN_TO_ID directly instead of RULE_ASSIGN_OVERRIDE,
  // so the change becomes the rule's default assignee rather than a
  // soft override.
  const [bulkIsPermanent, setBulkIsPermanent] = useState<boolean>(false);
  const [bulkSubmitting, setBulkSubmitting] = useState<boolean>(false);
  const [bulkMessage, setBulkMessage] = useState<string>("");

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

  // View by Security is only meaningful inside the Security Master or
  // Security Master Benchmark rule groups. If the user navigates away
  // (picks a different group / catalog / rule), force the RHS back to
  // the exceptions view so the header toggle can disappear cleanly.
  const viewBySecurityAllowedGroup =
    viewByGroup === "Security Master" ||
    viewByGroup === "Security Master Benchmark";
  useEffect(() => {
    if (!viewBySecurityAllowedGroup && viewMode === "security") {
      setViewMode("rule");
    }
  }, [viewBySecurityAllowedGroup, viewMode]);

  const selectedAladdinId =
    selectedRow !== null ? assets[selectedRow]?.aladdinId ?? "" : "";

  const selectedAladdinRef = useRef<string>("");
  useEffect(() => {
    selectedAladdinRef.current = selectedAladdinId;
  }, [selectedAladdinId]);

  // The four filter dropdowns below (Type / Severity / Priority /
  // Exception State) only render inside `viewMode === "security"` —
  // no point paying for their SPs on mount when the user is in View
  // Exceptions. Each fetch is guarded to fire on first entry to
  // security mode and short-circuits once its options array is
  // populated, so switching between modes doesn't re-fetch.
  useEffect(() => {
    if (viewMode !== "security") return;
    if (exceptionTypes.length > 0) return;
    const controller = new AbortController();
    fetchExceptionTypes(controller.signal)
      .then((codes) => {
        setExceptionTypes(codes);
        if (codes.length === 0) return;
        setDqmType((current) =>
          current && codes.includes(current) ? current : codes[0]
        );
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [viewMode, exceptionTypes.length]);

  useEffect(() => {
    if (viewMode !== "security") return;
    if (severityOptions.length > 0) return;
    const controller = new AbortController();
    fetchSeverityTypes(controller.signal)
      .then((codes) => setSeverityOptions(codes))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [viewMode, severityOptions.length]);

  useEffect(() => {
    if (viewMode !== "security") return;
    if (priorityOptions.length > 0) return;
    const controller = new AbortController();
    fetchPriorityTypes(controller.signal)
      .then((codes) => setPriorityOptions(codes))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [viewMode, priorityOptions.length]);

  useEffect(() => {
    if (viewMode !== "security") return;
    if (exceptionStateOptions.length > 0) return;
    const controller = new AbortController();
    fetchExceptionState(controller.signal)
      .then((codes) => setExceptionStateOptions(codes))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [viewMode, exceptionStateOptions.length]);

  useEffect(() => {
    const controller = new AbortController();
    fetchExceptionStatus(controller.signal)
      .then((codes) => setExceptionStatusOptions(codes))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  // Seed the status filter with EVERY status the backend returned,
  // one time only. Runs the first time exceptionStatusOptions
  // becomes non-empty; the seededRef gate prevents this from ever
  // wiping a user's later customization (e.g., unticking rows).
  useEffect(() => {
    if (statusFilterSeededRef.current) return;
    if (exceptionStatusOptions.length === 0) return;
    setStatusFilter(new Set(exceptionStatusOptions));
    statusFilterSeededRef.current = true;
  }, [exceptionStatusOptions]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDMUsers(controller.signal)
      // getDMUsers now returns {user, role, email} tuples; the
      // per-row Assign To dropdown, the assignee filter, and the
      // Bulk Assign panel all only need the display name. Strip to
      // string[] here so every downstream consumer stays untouched.
      // (Role / email are still available on the wire when someone
      // needs them — see get-dm-users.ts's DMUser type.)
      .then((users) => setDmUserOptions(users.map((u) => u.user)))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  // Fetch the current operator's DM role once on mount. Empty string
  // (unknown user / fetch failure) leaves the UI in the least-
  // privileged state — Bulk Assign / Bulk Status buttons stay hidden
  // and the per-row Assign To column stays read-only.
  useEffect(() => {
    const controller = new AbortController();
    fetchDMRole(currentDmUser, controller.signal)
      .then((role) => setDmRole(role))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setDmRole("");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Hard-coded pre-Okta. Once Okta integration lands, replace this
    // constant with the resolved operator identity (DM_USER."USER"
    // that maps to the Okta email in RULE_GROUP_AUTHORIZATION.ACCESS_
    // LIST). Backend rejects an empty user with 400, so the tree
    // stays gated even if this string is ever cleared.
    const currentUser = "Joann Banks";
    fetchRuleGroupsForUser(currentUser, controller.signal)
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
    // Assets grid is only rendered inside View by Security mode —
    // don't pay for SP_GET_ASSETS (a 10-way JOIN over EXCEPTION) in
    // View Exceptions mode where nothing consumes the result.
    // Refetches on mode-switch back to security since viewMode is a
    // dep of this effect.
    if (viewMode !== "security") return;
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
  }, [viewMode, refreshTick, dqmType, severity, priority, viewByRuleCatalog, viewByRule, exceptionState, assignToFilter, viewByGroup]);

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
        if (rows.length > EXCEPTION_LIMIT) {
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
        // Single aggregation call replaces the earlier per-group
        // fetchExceptions fanout — server groups by RULE_GROUP.NAME
        // and returns counts in one round-trip. Status filter is
        // intentionally not passed (see the "unfiltered summary"
        // comment above).
        const rows = await fetchExceptionCountsByGroup(
          {
            exceptionType: dqmType,
            severity,
            priority,
            exceptionState,
            assignTo: assignToFilter,
          },
          controller.signal
        );
        if (!cancelled) {
          const next: Record<string, number> = {};
          // Seed authorized groups to 0 so a group with zero rows
          // still shows in the panel (SP returns nothing for empty
          // groups since it aggregates over EXCEPTION).
          for (const g of ruleGroupOptions) next[g] = 0;
          for (const { ruleGroup, count } of rows) {
            if (ruleGroup) next[ruleGroup] = count;
          }
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
  // RULE_NAME → RULE_DESCRIPTION. Merged into (never replaced) as
  // fetchRuleNames runs across the app — both the count-panel catalog
  // effect below and the tree's getRules callback contribute. Powers
  // the hover tooltip on the "Number of Exceptions" panel rows so the
  // user sees the description for a rule without expanding the tree.
  // Missing key → count-panel row falls back to showing the identifier
  // as its own tooltip (matches the tree-leaf fallback).
  const [ruleDescByName, setRuleDescByName] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    if (viewMode !== "group" || !viewByGroup || viewByGroup === "All") {
      // Intentionally NOT clearing ruleCatalogByRuleName here — it's
      // a merge-not-replace cache now, so a prior group's entries
      // stay hot when the user drills into 'All' or a different
      // group and comes back. Fresh entries just merge in on the
      // next resolution below.
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Single call replaces the earlier fetchRuleCatalogs(group)
        // + N × fetchRuleNames(catalog) fanout. Backend runs one
        // three-way JOIN and returns every active rule under the
        // group with its catalog + description in one round-trip.
        const rules = await fetchRulesForGroup(viewByGroup);
        const map: Record<string, string> = {};
        const descMap: Record<string, string> = {};
        for (const r of rules) {
          if (r.rule_name) {
            map[r.rule_name] = r.catalog_name || "Unknown";
            const desc = (r.rule_description ?? "").trim();
            if (desc !== "") descMap[r.rule_name] = desc;
          }
        }
        if (!cancelled) {
          // Merge, don't replace — entries fetched for a prior
          // group stay live so re-selecting an old group is
          // instant. Same policy applies to ruleDescByName which
          // is fed from multiple call sites.
          setRuleCatalogByRuleName((prev) => ({ ...prev, ...map }));
          setRuleDescByName((prev) => ({ ...prev, ...descMap }));
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;

        console.error("rules-for-group lookup failed", e);
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
    // Empty statusFilter means the seed effect hasn't run yet
    // (options haven't landed) — pass rows through so the grid
    // doesn't flash empty for the ~200 ms window before seeding.
    // Once seeded, an empty set is a legitimate user choice ("hide
    // all") which we honor.
    if (statusFilter.size === 0 && !statusFilterSeededRef.current) {
      return exceptions;
    }
    return exceptions.filter((r) => statusFilter.has(r.status));
  }, [exceptions, showStatusPanel, statusFilter]);

  // Rows fed to <ExceptionsTable>. Starts from statusFilteredExceptions
  // (Status panel filter, if any) and then narrows further to the rules
  // ticked in an open Bulk panel. Closing the panel — or unticking every
  // rule — removes the narrowing automatically, so the grid reverts to
  // whatever the LHS tree / Status panel already had.
  //
  // Bulk Assign and Bulk Status are separate panels but both drive off
  // the same "rule name → filter" pattern, so both feed in here. If
  // both panels are open at once (uncommon — usually one is toggled at
  // a time) the union wins: any rule ticked in either panel keeps its
  // rows visible.
  const tableExceptions = useMemo<ExceptionRow[]>(() => {
    const bulkRules = new Set<string>();
    if (bulkPanelOpen) {
      bulkSelectedRules.forEach((r) => bulkRules.add(r));
    }
    if (bulkStatusPanelOpen) {
      bulkStatusSelectedRules.forEach((r) => bulkRules.add(r));
    }
    if (bulkRules.size === 0) return statusFilteredExceptions;
    return statusFilteredExceptions.filter((r) => bulkRules.has(r.ruleName));
  }, [
    statusFilteredExceptions,
    bulkPanelOpen,
    bulkSelectedRules,
    bulkStatusPanelOpen,
    bulkStatusSelectedRules,
  ]);

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

  // Bulk Assign / Bulk Status are meaningful inside the Security
  // Master, Security Master Benchmark, and TOD SOD rule groups, in
  // the exception view (not the "View by Security" grid), AND against
  // the current-day EXCEPTION table — historical EXCEPTION_HIST days
  // must stay read-only (see ExceptionsTable readOnly wiring). On
  // top of all that, both buttons are DM_ADMIN-only: operators with
  // any other role (or unknown) never see them regardless of scope.
  // Any failing criterion hides both buttons and forces both panels
  // closed.
  const showBulkAssign =
    dmRole === "DM_ADMIN" &&
    (viewByGroup === "Security Master" ||
      viewByGroup === "Security Master Benchmark" ||
      viewByGroup === "TOD SOD") &&
    viewMode !== "security" &&
    dqmDate === "";
  useEffect(() => {
    if (!showBulkAssign && bulkPanelOpen) setBulkPanelOpen(false);
  }, [showBulkAssign, bulkPanelOpen]);
  useEffect(() => {
    if (!showBulkAssign && bulkStatusPanelOpen) setBulkStatusPanelOpen(false);
  }, [showBulkAssign, bulkStatusPanelOpen]);

  // Rule dropdown options for the Bulk processing panel. Follows the
  // tree selection:
  //   - a specific rule selected     → just that rule
  //   - a catalog selected (no rule) → every rule under that catalog
  //   - only the group selected      → every rule across every catalog
  //                                    in Security Master
  // ruleCatalogByRuleName is populated by the effect below (originally
  // used for the count panel) and covers the group-only case.
  const bulkRuleOptions = useMemo<string[]>(() => {
    if (!showBulkAssign) return [];
    if (viewByRule && viewByRule !== "All") return [viewByRule];
    if (viewByRuleCatalog && viewByRuleCatalog !== "All") return ruleOptions;
    return Object.keys(ruleCatalogByRuleName).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [
    showBulkAssign,
    viewByRule,
    viewByRuleCatalog,
    ruleOptions,
    ruleCatalogByRuleName,
  ]);
  // Drop any previously-selected rules that no longer appear in the
  // current option list (e.g. tree selection changed to a narrower
  // catalog / rule). Preserves the user's other selections.
  useEffect(() => {
    setBulkSelectedRules((prev) => {
      const allowed = new Set(bulkRuleOptions);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((r) => {
        if (allowed.has(r)) next.add(r);
        else changed = true;
      });
      if (!changed) return prev;
      return next;
    });
  }, [bulkRuleOptions]);

  // Close the rule combo popover on outside-click. Same pattern as the
  // Status filter combo above (see statusComboRef).
  useEffect(() => {
    if (!bulkRuleComboOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        bulkRuleComboRef.current &&
        !bulkRuleComboRef.current.contains(e.target as Node)
      ) {
        setBulkRuleComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bulkRuleComboOpen]);

  // Sibling outside-click handler for the Bulk Status rule combo.
  useEffect(() => {
    if (!bulkStatusRuleComboOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        bulkStatusRuleComboRef.current &&
        !bulkStatusRuleComboRef.current.contains(e.target as Node)
      ) {
        setBulkStatusRuleComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bulkStatusRuleComboOpen]);

  // Drop any Bulk Status rule selections that fall out of scope when
  // the tree selection narrows. Mirrors the equivalent effect for
  // Bulk Assign a few lines below its bulkRuleOptions memo.
  useEffect(() => {
    setBulkStatusSelectedRules((prev) => {
      const allowed = new Set(bulkRuleOptions);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((r) => {
        if (allowed.has(r)) next.add(r);
        else changed = true;
      });
      if (!changed) return prev;
      return next;
    });
  }, [bulkRuleOptions]);

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
        onBulkStatusClick={
          showBulkAssign
            ? () => setBulkStatusPanelOpen((v) => !v)
            : undefined
        }
        bulkStatusLabel={
          bulkStatusPanelOpen ? "Hide Bulk Status" : "Bulk Status"
        }
        onBulkAssignClick={
          showBulkAssign ? () => setBulkPanelOpen((v) => !v) : undefined
        }
        bulkAssignLabel={bulkPanelOpen ? "Hide Bulk Assign" : "Bulk Assign"}
        // DATA QUALITY MONITOR (left) + Bulk Assign + View by Security
        // toggle + Export to Excel (right) all share the top row.
        // Status breakdown, when present, drops into a middle column
        // left-aligned with the Exceptions grid — breakdownLeftOffset
        // matches the sidebar's outer width (sidebar + gap + resizer +
        // gap) so it lines up with the grid regardless of collapse /
        // user resize.
        modeToggleLabel={
          viewBySecurityAllowedGroup
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
                            <td title={ruleDescByName[row.name] ?? row.name}>
                              {row.name}
                            </td>
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
                    {/* histDates[0] is MAX(EXCEPTION.EXCEPTION_DATE)
                        from the backend union — the "current" label
                        the operator sees at the top of the dropdown.
                        Submitting value="" still routes to the live
                        EXCEPTION table via fetchExceptions (no date
                        param), which the SP defaults to today. When
                        EXCEPTION is empty (no live rows), the top
                        entry falls back to "Current" so the option
                        isn't blank. */}
                    <option value="">
                      {histDates.length > 0
                        ? formatDqmDate(histDates[0])
                        : "Current"}
                    </option>
                    {histDates.slice(1).map((d) => (
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
              // Piggyback: whenever the tree fetches rules for a
              // catalog, capture their descriptions into
              // ruleDescByName so the count-panel hover has data
              // even for catalogs the group-mode effect above
              // hasn't scanned (rule-mode / rule-catalog-mode).
              const descMap: Record<string, string> = {};
              for (const r of rules) {
                const desc = (r.rule_description ?? "").trim();
                if (r.rule_name && desc !== "") {
                  descMap[r.rule_name] = desc;
                }
              }
              if (Object.keys(descMap).length > 0) {
                setRuleDescByName((prev) => ({ ...prev, ...descMap }));
              }
              return rules.map((r) => ({
                name: r.rule_name,
                label: r.rule_name,
                title: ruleDisplayLabel(r),
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
                More than {EXCEPTION_LIMIT} exceptions — refine your filters
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

            {bulkPanelOpen && showBulkAssign && (
              <div className="dq-bulk-panel">
                <div className="dq-bulk-panel-header">
                  <h3 className="dq-bulk-panel-title">Bulk Assign</h3>
                  <button
                    type="button"
                    className="dq-bulk-panel-close"
                    onClick={() => setBulkPanelOpen(false)}
                    aria-label="Close bulk processing panel"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="dq-bulk-panel-body">
                  <div className="dq-bulk-panel-field">
                    <span
                      className="dq-bulk-panel-label"
                      id="dq-bulk-rule-combo-label"
                    >
                      Rules:
                    </span>
                    <div
                      className="dq-bulk-rule-combo"
                      ref={bulkRuleComboRef}
                    >
                      <button
                        type="button"
                        className="dq-bulk-rule-combo-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={bulkRuleComboOpen}
                        aria-labelledby="dq-bulk-rule-combo-label"
                        disabled={bulkRuleOptions.length === 0}
                        onClick={() => setBulkRuleComboOpen((v) => !v)}
                      >
                        <span className="dq-bulk-rule-combo-summary">
                          {bulkRuleOptions.length === 0
                            ? "No rules available"
                            : bulkSelectedRules.size === 0
                            ? "None"
                            : bulkSelectedRules.size === 1
                            ? Array.from(bulkSelectedRules)[0]
                            : `${bulkSelectedRules.size} rules selected`}
                        </span>
                        <span className="dq-bulk-rule-combo-caret">▾</span>
                      </button>
                      {bulkRuleComboOpen && bulkRuleOptions.length > 0 && (
                        <div
                          className="dq-bulk-rule-combo-popover"
                          role="group"
                          aria-labelledby="dq-bulk-rule-combo-label"
                        >
                          <div className="dq-bulk-rule-combo-actions">
                            <button
                              type="button"
                              className="dq-bulk-rule-combo-action"
                              onClick={() =>
                                setBulkSelectedRules(
                                  new Set(bulkRuleOptions)
                                )
                              }
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              className="dq-bulk-rule-combo-action"
                              onClick={() =>
                                setBulkSelectedRules(new Set())
                              }
                            >
                              Clear
                            </button>
                          </div>
                          <div className="dq-bulk-rule-combo-list">
                            {bulkRuleOptions.map((rule) => {
                              const checked = bulkSelectedRules.has(rule);
                              return (
                                <label
                                  key={rule}
                                  className="dq-bulk-rule-combo-item"
                                >
                                  <input
                                    type="checkbox"
                                    className="dq-bulk-rule-combo-check"
                                    checked={checked}
                                    onChange={() => {
                                      setBulkSelectedRules((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(rule)) next.delete(rule);
                                        else next.add(rule);
                                        return next;
                                      });
                                    }}
                                  />
                                  <span>{rule}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="dq-bulk-panel-field">
                    <label
                      className="dq-bulk-panel-label"
                      htmlFor="dq-bulk-user-select"
                    >
                      Assign to:
                    </label>
                    <select
                      id="dq-bulk-user-select"
                      className="dq-bulk-panel-select"
                      value={bulkSelectedUser}
                      onChange={(e) => setBulkSelectedUser(e.target.value)}
                    >
                      <option value="">Select user…</option>
                      {dmUserOptions
                        // Backend getDMUsers returns a literal
                        // "Unassigned" entry; mirror the ExceptionsTable
                        // per-row select which also filters it out — the
                        // Bulk Assign flow always resolves to a real user.
                        .filter(
                          (u) => u.trim().toLowerCase() !== "unassigned"
                        )
                        .map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                    </select>
                  </div>
                  <label
                    className="dq-bulk-panel-permanent"
                    htmlFor="dq-bulk-is-permanent"
                  >
                    <input
                      id="dq-bulk-is-permanent"
                      type="checkbox"
                      checked={bulkIsPermanent}
                      onChange={(e) => setBulkIsPermanent(e.target.checked)}
                    />
                    Is Permanent
                  </label>
                  <button
                    type="button"
                    className="dq-bulk-panel-assign-btn"
                    disabled={
                      bulkSubmitting ||
                      bulkSelectedRules.size === 0 ||
                      bulkSelectedUser === ""
                    }
                    onClick={() => {
                      if (
                        bulkSubmitting ||
                        bulkSelectedRules.size === 0 ||
                        bulkSelectedUser === ""
                      ) {
                        return;
                      }
                      const rules = Array.from(bulkSelectedRules);
                      const isPermanent = bulkIsPermanent;
                      setBulkSubmitting(true);
                      setBulkMessage("");
                      updateBulkAssign(rules, bulkSelectedUser, isPermanent)
                        .then((updated) => {
                          setBulkMessage(
                            `${
                              isPermanent ? "Permanently assigned" : "Assigned"
                            } ${rules.length} rule${
                              rules.length === 1 ? "" : "s"
                            } to ${bulkSelectedUser} (${updated} exception${
                              updated === 1 ? "" : "s"
                            } updated).`
                          );
                          // Deliberately NOT clearing bulkSelectedRules
                          // so the grid stays narrowed to the rules
                          // the user just acted on — they can inspect
                          // the result without hunting for the same
                          // rows again. The tree-scope prune-effect
                          // (bulkRuleOptions dep) will drop these
                          // selections whenever the user picks a
                          // different node on the LHS tree or the
                          // Number of Exceptions panel, so scope
                          // changes still reset the filter naturally.
                          setBulkSelectedUser("");
                          setBulkIsPermanent(false);
                          setRefreshTick((n) => n + 1);
                        })
                        .catch((err: unknown) => {
                          const msg =
                            err instanceof Error ? err.message : "unknown error";
                          setBulkMessage(`Bulk assign failed: ${msg}`);
                        })
                        .finally(() => setBulkSubmitting(false));
                    }}
                  >
                    {bulkSubmitting ? "Assigning…" : "Assign"}
                  </button>
                  {bulkMessage && (
                    <span
                      className="dq-bulk-panel-message"
                      role="status"
                      aria-live="polite"
                    >
                      {bulkMessage}
                    </span>
                  )}
                </div>
              </div>
            )}

            {bulkStatusPanelOpen && showBulkAssign && (
              <div className="dq-bulk-panel">
                <div className="dq-bulk-panel-header">
                  <h3 className="dq-bulk-panel-title">Bulk Status</h3>
                  <button
                    type="button"
                    className="dq-bulk-panel-close"
                    onClick={() => setBulkStatusPanelOpen(false)}
                    aria-label="Close bulk status panel"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="dq-bulk-panel-body dq-bulk-panel-body--stacked">
                  <div className="dq-bulk-panel-field">
                    <span
                      className="dq-bulk-panel-label"
                      id="dq-bulk-status-rule-combo-label"
                    >
                      Rules:
                    </span>
                    <div
                      className="dq-bulk-rule-combo"
                      ref={bulkStatusRuleComboRef}
                    >
                      <button
                        type="button"
                        className="dq-bulk-rule-combo-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={bulkStatusRuleComboOpen}
                        aria-labelledby="dq-bulk-status-rule-combo-label"
                        disabled={bulkRuleOptions.length === 0}
                        onClick={() => setBulkStatusRuleComboOpen((v) => !v)}
                      >
                        <span className="dq-bulk-rule-combo-summary">
                          {bulkRuleOptions.length === 0
                            ? "No rules available"
                            : bulkStatusSelectedRules.size === 0
                            ? "None"
                            : bulkStatusSelectedRules.size === 1
                            ? Array.from(bulkStatusSelectedRules)[0]
                            : `${bulkStatusSelectedRules.size} rules selected`}
                        </span>
                        <span className="dq-bulk-rule-combo-caret">▾</span>
                      </button>
                      {bulkStatusRuleComboOpen &&
                        bulkRuleOptions.length > 0 && (
                          <div
                            className="dq-bulk-rule-combo-popover"
                            role="group"
                            aria-labelledby="dq-bulk-status-rule-combo-label"
                          >
                            <div className="dq-bulk-rule-combo-actions">
                              <button
                                type="button"
                                className="dq-bulk-rule-combo-action"
                                onClick={() =>
                                  setBulkStatusSelectedRules(
                                    new Set(bulkRuleOptions)
                                  )
                                }
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                className="dq-bulk-rule-combo-action"
                                onClick={() =>
                                  setBulkStatusSelectedRules(new Set())
                                }
                              >
                                Clear
                              </button>
                            </div>
                            <div className="dq-bulk-rule-combo-list">
                              {bulkRuleOptions.map((rule) => {
                                const checked =
                                  bulkStatusSelectedRules.has(rule);
                                return (
                                  <label
                                    key={rule}
                                    className="dq-bulk-rule-combo-item"
                                  >
                                    <input
                                      type="checkbox"
                                      className="dq-bulk-rule-combo-check"
                                      checked={checked}
                                      onChange={() => {
                                        setBulkStatusSelectedRules((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(rule))
                                            next.delete(rule);
                                          else next.add(rule);
                                          return next;
                                        });
                                      }}
                                    />
                                    <span>{rule}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                  {/* Status + Suppress Date share a row via
                      .dq-bulk-panel-inline-row inside the stacked
                      column layout — visually one horizontal group,
                      structurally two flex items so labels + controls
                      stay independent. */}
                  <div className="dq-bulk-panel-inline-row">
                    <div className="dq-bulk-panel-field">
                      <label
                        className="dq-bulk-panel-label"
                        htmlFor="dq-bulk-status-select"
                      >
                        Status:
                      </label>
                      <select
                        id="dq-bulk-status-select"
                        className="dq-bulk-panel-select"
                        value={bulkStatusSelected}
                        onChange={(e) => setBulkStatusSelected(e.target.value)}
                      >
                        <option value="">Select status…</option>
                        {exceptionStatusOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="dq-bulk-panel-field">
                      <label
                        className="dq-bulk-panel-label"
                        htmlFor="dq-bulk-status-suppress-date"
                      >
                        Suppress Date:
                      </label>
                      {/* Same min/max rules as the grid's
                          SuppressDateCell — today .. today+2 years —
                          so the native picker greys out out-of-range
                          dates identically. */}
                      <input
                        id="dq-bulk-status-suppress-date"
                        type="date"
                        className="dq-bulk-panel-suppress-date"
                        value={bulkStatusSuppressDate}
                        // Backend SP_EXPIRE_SUPPRESS_DATES compares
                        // SUPPRESS_DATE < CURRENT_DATE in UTC. If we
                        // computed min in the operator's local time,
                        // late-in-day picks (evening PST → next UTC
                        // day already) would land as "already expired"
                        // and the row would flip back to New on the
                        // next grid refresh. Use UTC so the picker's
                        // floor matches the SP's comparison exactly.
                        min={(() => {
                          const t = new Date();
                          return `${t.getUTCFullYear()}-${String(
                            t.getUTCMonth() + 1
                          ).padStart(2, "0")}-${String(
                            t.getUTCDate()
                          ).padStart(2, "0")}`;
                        })()}
                        max={(() => {
                          const t = new Date();
                          t.setUTCFullYear(t.getUTCFullYear() + 2);
                          return `${t.getUTCFullYear()}-${String(
                            t.getUTCMonth() + 1
                          ).padStart(2, "0")}-${String(
                            t.getUTCDate()
                          ).padStart(2, "0")}`;
                        })()}
                        onChange={(e) =>
                          setBulkStatusSuppressDate(e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="dq-bulk-panel-field">
                    <label
                      className="dq-bulk-panel-label"
                      htmlFor="dq-bulk-status-comments"
                    >
                      Comments:
                    </label>
                    {/* Same 320px canvas as the Exceptions grid's
                        Comments column (INITIAL_WIDTHS.comments in
                        ExceptionsTable) so the two feel like the same
                        widget rendered in two places. Disabled when
                        "Clear Comments" is ticked — the text-box
                        content is ignored in that mode; submit sends
                        an explicit empty string to wipe COMMENTS on
                        every matched row. */}
                    <input
                      id="dq-bulk-status-comments"
                      type="text"
                      className="dq-bulk-panel-comments"
                      maxLength={2048}
                      disabled={bulkStatusClearComments}
                      value={
                        bulkStatusClearComments ? "" : bulkStatusComments
                      }
                      onChange={(e) => setBulkStatusComments(e.target.value)}
                    />
                    <label
                      className="dq-bulk-panel-clear-comments"
                      htmlFor="dq-bulk-status-clear-comments"
                    >
                      <input
                        id="dq-bulk-status-clear-comments"
                        type="checkbox"
                        checked={bulkStatusClearComments}
                        onChange={(e) =>
                          setBulkStatusClearComments(e.target.checked)
                        }
                      />
                      Clear Comments
                    </label>
                  </div>
                  <button
                    type="button"
                    className="dq-bulk-panel-assign-btn"
                    disabled={
                      bulkStatusSubmitting ||
                      bulkStatusSelectedRules.size === 0 ||
                      // Nothing to do: no status change AND no comment
                      // change (blank textbox without Clear ticked).
                      // Comment-only updates without status ARE
                      // allowed; only both-blank is a no-op.
                      (bulkStatusSelected === "" &&
                        bulkStatusComments === "" &&
                        !bulkStatusClearComments) ||
                      // Mirror the per-row grid rule (see
                      // ExceptionsTable status <select> onChange):
                      // cannot move to Suppress without a date. Block
                      // the button so the user notices the missing
                      // input before clicking.
                      (bulkStatusSelected === "Suppress" &&
                        bulkStatusSuppressDate === "") ||
                      // Any transition away from "New" (Accept /
                      // Override / Hold / Suppress / Research /
                      // Challenge / …) must carry a comment. The
                      // typed comment counts; Clear-Comments (which
                      // wipes existing comments) explicitly does not.
                      // Server-side SP_UPDATE_BULK_STATUS enforces
                      // the same rule.
                      (bulkStatusSelected !== "" &&
                        bulkStatusSelected !== "New" &&
                        (bulkStatusClearComments ||
                          bulkStatusComments.trim() === ""))
                    }
                    onClick={() => {
                      if (
                        bulkStatusSubmitting ||
                        bulkStatusSelectedRules.size === 0
                      ) {
                        return;
                      }
                      if (
                        bulkStatusSelected === "" &&
                        bulkStatusComments === "" &&
                        !bulkStatusClearComments
                      ) {
                        return;
                      }
                      if (
                        bulkStatusSelected === "Suppress" &&
                        bulkStatusSuppressDate === ""
                      ) {
                        setBulkStatusMessage(
                          "Please enter a Suppress Date before setting the status to Suppress."
                        );
                        return;
                      }
                      // Split into two friendly messages: Clear-
                      // Comments explicitly wipes the audit trail on
                      // rows the operator is about to close, which is
                      // a different mistake from just forgetting to
                      // type a comment. Server-side SP_UPDATE_BULK_
                      // STATUS returns 0 rows (or the handler 400s if
                      // it reached that path) — this catches the
                      // click before it leaves the browser.
                      if (
                        bulkStatusSelected !== "" &&
                        bulkStatusSelected !== "New" &&
                        bulkStatusClearComments
                      ) {
                        setBulkStatusMessage(
                          `Comments cannot be cleared when setting the status to "${bulkStatusSelected}". Uncheck "Clear Comments" and enter a comment.`
                        );
                        return;
                      }
                      if (
                        bulkStatusSelected !== "" &&
                        bulkStatusSelected !== "New" &&
                        bulkStatusComments.trim() === ""
                      ) {
                        setBulkStatusMessage(
                          "Please enter a comment before changing the status."
                        );
                        return;
                      }
                      const rules = Array.from(bulkStatusSelectedRules);
                      const status = bulkStatusSelected;
                      // Comment resolution:
                      //   Clear ticked            → "" (backend wipes
                      //                              COMMENTS on every
                      //                              matched row)
                      //   Clear off + blank text  → null (backend
                      //                              leaves existing
                      //                              COMMENTS alone)
                      //   Clear off + typed text  → the typed value
                      const comments: string | null =
                        bulkStatusClearComments
                          ? ""
                          : bulkStatusComments === ""
                          ? null
                          : bulkStatusComments;
                      // Empty suppress-date string round-trips as "no
                      // change" — the backend NULLIF('','')s it then
                      // COALESCE'es to preserve the existing value.
                      const suppressDate = bulkStatusSuppressDate;
                      setBulkStatusSubmitting(true);
                      setBulkStatusMessage("");
                      updateBulkStatus(rules, status, comments, suppressDate)
                        .then((updated) => {
                          // Describe exactly what changed — status,
                          // comments, or both — rather than a fixed
                          // "Set status …" phrase.
                          const parts: string[] = [];
                          if (status !== "") {
                            parts.push(`set status "${status}"`);
                          }
                          if (bulkStatusClearComments) {
                            parts.push("cleared comments");
                          } else if (bulkStatusComments !== "") {
                            parts.push("updated comments");
                          }
                          const desc =
                            parts.length > 0
                              ? parts.join(" and ")
                              : "made no changes";
                          setBulkStatusMessage(
                            `Bulk ${desc} on ${rules.length} rule${
                              rules.length === 1 ? "" : "s"
                            } (${updated} exception${
                              updated === 1 ? "" : "s"
                            } updated).`
                          );
                          // Deliberately NOT clearing
                          // bulkStatusSelectedRules — the grid stays
                          // narrowed to the rules the user just acted
                          // on so they can inspect the result. Scope
                          // changes on the LHS tree / Number of
                          // Exceptions panel will drop these
                          // selections via the bulkRuleOptions
                          // prune-effect (same policy as Bulk Assign).
                          setBulkStatusSelected("");
                          setBulkStatusSuppressDate("");
                          setBulkStatusComments("");
                          setBulkStatusClearComments(false);
                          setRefreshTick((n) => n + 1);
                        })
                        .catch((err: unknown) => {
                          const msg =
                            err instanceof Error
                              ? err.message
                              : "unknown error";
                          setBulkStatusMessage(
                            `Bulk status update failed: ${msg}`
                          );
                        })
                        .finally(() => setBulkStatusSubmitting(false));
                    }}
                  >
                    {bulkStatusSubmitting
                      ? "Updating…"
                      : "Update Status/Comments"}
                  </button>
                  {bulkStatusMessage && (
                    <span
                      className="dq-bulk-panel-message"
                      role="status"
                      aria-live="polite"
                    >
                      {bulkStatusMessage}
                    </span>
                  )}
                </div>
              </div>
            )}

            <ExceptionsTable
              data={tableExceptions}
              showResultDataColumns={viewMode !== "security"}
              // RULE_NAME always sits immediately right of Comments,
              // regardless of where it appears in the RESULT_DATA JSON
              // key order — otherwise a rule-authored key order that
              // buried RULE_NAME deep in the row makes the grid hard
              // to scan. All other rd:* columns keep their natural
              // JSON storage order (see canonicalKeys in
              // ExceptionsTable).
              priorityRdKeys={["RULE_NAME"]}
              // Any non-empty dqmDate means the grid is showing
              // EXCEPTION_HIST for a prior day. Historical rows must
              // stay read-only — mutating them would rewrite an
              // already-archived snapshot.
              readOnly={dqmDate !== ""}
              // Open Date / Close Date columns render at the far
              // right of the grid only for the Security-Master-family
              // rule groups. Every other group keeps the grid focused
              // on triage widgets + RESULT_DATA and doesn't surface
              // the lifecycle dates.
              showLifecycleColumns={
                viewByGroup === "Security Master" ||
                viewByGroup === "Security Benchmark Master"
              }
              onVisibleRowsChange={setVisibleExceptions}
              statusOptions={
                showStatusPanel ? exceptionStatusOptions : undefined
              }
              onStatusChange={
                showStatusPanel
                  ? (exceptionId, status, comments, suppressDate) =>
                      updateExceptionStatus(
                        exceptionId,
                        status,
                        comments,
                        suppressDate
                      )
                        .then(() => {
                          // Optimistic patch — no full-grid refetch.
                          // Replicates SP_UPDATE_EXCEPTION_STATUS's
                          // derived-column logic client-side:
                          //   SUPPRESS_DATE — kept when new status is
                          //     Suppress, blanked otherwise.
                          //   OPEN_DATE — ratchets to today when
                          //     transitioning INTO 'New'; else preserved.
                          //   CLOSE_DATE — set to today for
                          //     'Accept' / 'Research'; cleared for
                          //     'New' / 'Suppress' / 'Challenge'; else
                          //     preserved (Override, Hold, Complete
                          //     etc. keep their prior CLOSE_DATE).
                          setExceptions((prev) =>
                            prev.map((r) => {
                              if (r.exceptionId !== exceptionId) return r;
                              const today = isoTodayUtc();
                              const nextSuppress =
                                status === "Suppress" ? suppressDate : "";
                              const nextOpen =
                                status === "New" ? today : r.openDate;
                              let nextClose = r.closeDate;
                              if (
                                status === "Accept" ||
                                status === "Research"
                              ) {
                                nextClose = today;
                              } else if (
                                status === "New" ||
                                status === "Suppress" ||
                                status === "Challenge"
                              ) {
                                nextClose = "";
                              }
                              return {
                                ...r,
                                status,
                                comments,
                                suppressDate: nextSuppress,
                                openDate: nextOpen,
                                closeDate: nextClose,
                              };
                            })
                          );
                        })
                        .catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error("updateExceptionStatus failed", err);
                          // Reconcile: any locally-guessed derived
                          // field could be stale, so pull authoritative
                          // state on failure.
                          setRefreshTick((n) => n + 1);
                        })
                  : undefined
              }
              showCommentsColumn={showCommentsColumn}
              onCommentsChange={
                showCommentsColumn
                  ? (exceptionId, comments) =>
                      updateExceptionComments(exceptionId, comments)
                        .then(() => {
                          // Optimistic patch — comment updates don't
                          // touch derived columns server-side.
                          patchExceptionRow(exceptionId, { comments });
                        })
                        .catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error(
                            "updateExceptionComments failed",
                            err
                          );
                          setRefreshTick((n) => n + 1);
                        })
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
                        .then(() => {
                          // Optimistic patch — no full refetch. When
                          // a suppress date is set the row also flips
                          // to Suppress (which clears CLOSE_DATE per
                          // SP_UPDATE_EXCEPTION_STATUS's CASE);
                          // clearing the date leaves status alone.
                          if (suppressDate) {
                            patchExceptionRow(exceptionId, {
                              suppressDate,
                              status: "Suppress",
                              closeDate: "",
                            });
                          } else {
                            patchExceptionRow(exceptionId, {
                              suppressDate,
                            });
                          }
                        })
                        .catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error(
                            "updateExceptionSuppressDate/Status failed",
                            err
                          );
                          setRefreshTick((n) => n + 1);
                        });
                    }
                  : undefined
              }
              showAssignToColumn={showAssignToColumn}
              // Only DM_ADMIN operators can reassign; every other
              // role sees the current assignee as read-only text.
              // The column itself still renders — the widget just
              // downgrades to a plain <td>.
              assignToReadOnly={dmRole !== "DM_ADMIN"}
              assignToOptions={
                showAssignToColumn ? dmUserOptions : undefined
              }
              onAssignToChange={
                showAssignToColumn
                  ? (exceptionId, assignTo) =>
                      updateExceptionAssignTo(exceptionId, assignTo)
                        .then(() => {
                          // Optimistic patch — assign-to updates don't
                          // touch derived columns server-side.
                          patchExceptionRow(exceptionId, { assignTo });
                        })
                        .catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error(
                            "updateExceptionAssignTo failed",
                            err
                          );
                          setRefreshTick((n) => n + 1);
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
