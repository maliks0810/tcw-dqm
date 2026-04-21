import type { ExceptionRow } from "../components/types";

const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EXCEPTIONS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getSecurityExceptions`;

type ApiException = {
  security_exception_id?: number;
  rule_id?: number;
  aladdin_id?: string;
  run_date?: string;
  run_start?: string;
  result_type_id?: number;
  exception_source_id?: number;
  exception_status_id?: number;
  severity_type_id?: number;
  process_type_id?: number;
  category_type_id?: number;
  assign_to?: string;
  assign_to_date?: string;
  assigned_by?: string;
  resolve_date?: string;
  issue_description?: string;
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

function toExceptionRow(e: ApiException): ExceptionRow {
  return {
    dateTime: formatDateTime(e.run_date),
    priority: e.severity_type_id != null ? String(e.severity_type_id) : "",
    ruleName: e.rule_id != null ? `Rule ${e.rule_id}` : "",
    issue: e.issue_description ?? "",
    aladdin: "",
    vendor: "",
    action: "",
    comments: "",
  };
}

export async function fetchSecurityExceptions(
  aladdinId: string,
  signal?: AbortSignal
): Promise<ExceptionRow[]> {
  const url = `${EXCEPTIONS_ENDPOINT}?aladdin_id=${encodeURIComponent(aladdinId)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(
      `getSecurityExceptions failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as ApiException[];
  if (!Array.isArray(raw)) {
    throw new Error("getSecurityExceptions: expected array response");
  }
  return raw.map(toExceptionRow);
}
