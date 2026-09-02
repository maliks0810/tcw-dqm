const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getExceptionCountsByGroup`;

export type GroupCount = {
  ruleGroup: string;
  count: number;
};

// Returns one {ruleGroup, count} row per RULE_GROUP with matching
// EXCEPTION rows. Aggregation-only, so this stays one round-trip
// regardless of how many groups the operator is authorized for.
// Collapses the count panel's earlier N-call fetchExceptions fanout.
// Filter shape mirrors what the panel used to pass — status filter is
// intentionally NOT applied (see DqMonitorPage groupCounts effect).
// Empty-string args map to the backend's "no filter" branch.
// exceptionDate is required and scopes the counts to a single day, the
// same way fetchExceptions does. The SP equality-matches it, so omitting
// it doesn't widen the result — the backend rejects the request outright.
// Callers must resolve the date (latest from the LHS dropdown) rather
// than letting the server assume today, which is wrong on holidays and
// weekends when the newest EXCEPTION rows predate today.
export async function fetchExceptionCountsByGroup(
  filters: {
    exceptionType?: string;
    severity?: string;
    priority?: string;
    exceptionState?: string;
    assignTo?: string;
  },
  exceptionDate: string,
  // Count EXCEPTION_HIST (that day's latest batch per group) instead of
  // EXCEPTION. Set it whenever the grid is showing a historical date,
  // so the panel and the grid read the same table. EXCEPTION only holds
  // recent days, so counting it for an archived date returned 0 for
  // every group while the grid beside it showed rows.
  useHist = false,
  signal?: AbortSignal
): Promise<GroupCount[]> {
  // "All" is the dropdowns' no-filter sentinel — strip it exactly like
  // fetchExceptions / fetchAssets do. The backend SP only special-cases
  // the literal 'All' for exception_state and assign_to; severity /
  // priority / exception_type would be compared against a type named
  // "All" and match nothing, zeroing every group count.
  const params = new URLSearchParams();
  params.set("exception_date", exceptionDate);
  if (useHist) params.set("use_hist", "true");
  if (filters.exceptionType && filters.exceptionType !== "All")
    params.set("exception_type", filters.exceptionType);
  if (filters.severity && filters.severity !== "All")
    params.set("severity", filters.severity);
  if (filters.priority && filters.priority !== "All")
    params.set("priority", filters.priority);
  if (filters.exceptionState && filters.exceptionState !== "All")
    params.set("exception_state", filters.exceptionState);
  if (filters.assignTo && filters.assignTo !== "All")
    params.set("assign_to", filters.assignTo);
  const url = params.toString()
    ? `${ENDPOINT}?${params.toString()}`
    : ENDPOINT;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(
      `getExceptionCountsByGroup failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getExceptionCountsByGroup: expected array response");
  }
  return (raw as Array<Record<string, unknown>>)
    .filter((r) => r != null && typeof r === "object")
    .map((r) => ({
      ruleGroup: typeof r.rule_group === "string" ? r.rule_group : "",
      count: typeof r.count === "number" ? r.count : 0,
    }));
}
