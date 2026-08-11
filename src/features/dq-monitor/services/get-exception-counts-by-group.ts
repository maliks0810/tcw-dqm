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
export async function fetchExceptionCountsByGroup(
  filters: {
    exceptionType?: string;
    severity?: string;
    priority?: string;
    exceptionState?: string;
    assignTo?: string;
  },
  signal?: AbortSignal
): Promise<GroupCount[]> {
  const params = new URLSearchParams();
  if (filters.exceptionType) params.set("exception_type", filters.exceptionType);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.exceptionState)
    params.set("exception_state", filters.exceptionState);
  if (filters.assignTo) params.set("assign_to", filters.assignTo);
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
