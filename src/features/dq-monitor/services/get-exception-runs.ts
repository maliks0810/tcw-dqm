import type { ExceptionHistDatesScope } from "./get-exception-hist-dates";

const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getExceptionRuns`;

// One rule run in a rule group / catalog / rule scope. batchId is null
// for the live EXCEPTION run and the EXCEPTION_HIST BATCH_ID otherwise.
// exceptionTime is the latest EXCEPTION_TIME among the run's rows (ISO,
// "" when unknown).
export type ExceptionRun = {
  exceptionDate: string;
  batchId: number | null;
  exceptionTime: string;
};

type ApiExceptionRun = {
  exception_date?: unknown;
  batch_id?: unknown;
  exception_time?: unknown;
};

// Returns every run for the scope, most recent first: the live run (if
// the scope has live rows) and then each archived batch. Powers the
// "Exceptions Date" dropdown once a scope is picked on the LHS tree.
export async function fetchExceptionRuns(
  signal?: AbortSignal,
  scope: ExceptionHistDatesScope = {}
): Promise<ExceptionRun[]> {
  const params = new URLSearchParams();
  const { ruleGroup, ruleCatalog, ruleName } = scope;
  if (ruleGroup && ruleGroup !== "All") params.set("rule_group", ruleGroup);
  if (ruleCatalog && ruleCatalog !== "All") params.set("rule_catalog", ruleCatalog);
  if (ruleName && ruleName !== "All") params.set("rule_name", ruleName);
  const query = params.toString();
  const res = await fetch(query ? `${ENDPOINT}?${query}` : ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(`getExceptionRuns failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getExceptionRuns: expected array response");
  }
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const runs: ExceptionRun[] = [];
  for (const item of raw as ApiExceptionRun[]) {
    if (typeof item?.exception_date !== "string") continue;
    const date = item.exception_date.slice(0, 10);
    if (!isoRe.test(date)) continue;
    runs.push({
      exceptionDate: date,
      batchId: typeof item.batch_id === "number" ? item.batch_id : null,
      exceptionTime:
        typeof item.exception_time === "string" ? item.exception_time : "",
    });
  }
  return runs;
}
