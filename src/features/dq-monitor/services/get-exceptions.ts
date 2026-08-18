import type { ExceptionRow } from "../components/types";

const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EXCEPTIONS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getExceptions`;

type ApiException = {
  exception_id?: number;
  rule_id?: number;
  rule_name?: string;
  asset_id?: string;
  exception_date?: string;
  exception_time?: string;
  id_bb_global?: string;
  state_id?: number;
  exception_state?: string;
  status_id?: number;
  exception_status?: string;
  comments?: string;
  issue_description?: string;
  result_data?: string;
  suppress_date?: string;
  open_date?: string;
  close_date?: string;
  assign_to_id?: number;
  assign_to?: string;
  result_type_id?: number;
  priority?: string;
  severity?: string;
  exception_type?: string;
  created_date?: string;
  created_by?: string;
  modified_date?: string;
  modified_by?: string;
};

function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Coerces an incoming SUPPRESS_DATE (typically ISO like "2026-07-05" or a
// full RFC3339 timestamp like "2026-07-05T00:00:00Z") to a YYYY-MM-DD
// string suitable for <input type="date">. Empty / invalid → "".
function isoDate(s?: string): string {
  if (!s) return "";
  const trimmed = s.length >= 10 ? s.slice(0, 10) : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function parseResultData(s?: string): Record<string, unknown> | undefined {
  if (!s) return undefined;
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* malformed JSON — fall through and treat as absent */
  }
  return undefined;
}

function toExceptionRow(e: ApiException): ExceptionRow {
  const ruleLabel =
    e.rule_name && e.rule_name.length > 0
      ? e.rule_name
      : e.rule_id != null
      ? String(e.rule_id)
      : "";
  return {
    exceptionId: typeof e.exception_id === "number" ? e.exception_id : 0,
    dateTime: formatDateTime(e.exception_time),
    dateTimeIso: e.exception_time ?? "",
    priority: e.priority ?? "",
    ruleName: ruleLabel,
    issue: e.issue_description ?? "",
    aladdin: e.asset_id ?? "",
    idBbGlobal: e.id_bb_global ?? "",
    vendor: "",
    action: "",
    comments: e.comments ?? "",
    state: e.exception_state ?? "",
    status: e.exception_status ?? "",
    assignTo: e.assign_to ?? "",
    suppressDate: isoDate(e.suppress_date),
    openDate: isoDate(e.open_date),
    closeDate: isoDate(e.close_date),
    resultData: parseResultData(e.result_data),
  };
}

export async function fetchExceptions(
  assetId: string,
  signal?: AbortSignal,
  exceptionType?: string,
  severity?: string,
  priority?: string,
  ruleCatalog?: string,
  ruleName?: string,
  ruleGroup?: string,
  exceptionState?: string,
  assignTo?: string,
  ruleNamePattern?: string,
  // ISO YYYY-MM-DD. Passed as the "?exception_date=" query param.
  // Empty / omitted → server uses today (UTC) as the default. Callers
  // pass the top of the LHS Exception-date dropdown (histDates[0])
  // so the live grid stays correct on holidays / delayed ETL days
  // when EXCEPTION.EXCEPTION_DATE hasn't caught up to today.
  exceptionDate?: string
): Promise<ExceptionRow[]> {
  const params = new URLSearchParams();
  if (assetId) params.set("asset_id", assetId);
  if (exceptionType) params.set("exception_type", exceptionType);
  if (severity && severity !== "All") params.set("severity", severity);
  if (priority && priority !== "All") params.set("priority", priority);
  if (ruleCatalog && ruleCatalog !== "All") params.set("rule_catalog", ruleCatalog);
  if (ruleName && ruleName !== "All") params.set("rule_name", ruleName);
  if (ruleGroup && ruleGroup !== "All") params.set("rule_group", ruleGroup);
  if (exceptionState && exceptionState !== "All")
    params.set("exception_state", exceptionState);
  if (assignTo && assignTo !== "All") params.set("assign_to", assignTo);
  if (ruleNamePattern && ruleNamePattern.trim() !== "") {
    const trimmed = ruleNamePattern.trim();
    const pattern =
      trimmed.includes("%") || trimmed.includes("_")
        ? trimmed
        : `%${trimmed}%`;
    params.set("rule_name_pattern", pattern);
  }
  if (exceptionDate && exceptionDate.trim() !== "") {
    params.set("exception_date", exceptionDate.trim());
  }
  const qs = params.toString();
  const url = qs ? `${EXCEPTIONS_ENDPOINT}?${qs}` : EXCEPTIONS_ENDPOINT;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`getExceptions failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as ApiException[];
  if (!Array.isArray(raw)) {
    throw new Error("getExceptions: expected array response");
  }
  const sorted = raw.slice().sort((a, b) => {
    const ta = a.exception_time ? new Date(a.exception_time).getTime() : 0;
    const tb = b.exception_time ? new Date(b.exception_time).getTime() : 0;
    return tb - ta;
  });
  return sorted.map(toExceptionRow);
}
