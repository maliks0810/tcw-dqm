const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getExceptionHistDates`;

// LHS tree scope for the dates lookup. Omitted or "All" levels are not
// filtered.
export type ExceptionHistDatesScope = {
  ruleGroup?: string;
  ruleCatalog?: string;
  ruleName?: string;
};

// Returns the ISO YYYY-MM-DD dates, most recent first: the latest live
// EXCEPTION date plus every EXCEPTION_HIST date. Powers the "Exceptions
// Date" dropdown — one entry per calendar day regardless of how many
// BATCH_IDs it holds. With a scope, only days on which that rule group /
// catalog / rule has exceptions are returned.
export async function fetchExceptionHistDates(
  signal?: AbortSignal,
  scope: ExceptionHistDatesScope = {}
): Promise<string[]> {
  const params = new URLSearchParams();
  const { ruleGroup, ruleCatalog, ruleName } = scope;
  if (ruleGroup && ruleGroup !== "All") params.set("rule_group", ruleGroup);
  if (ruleCatalog && ruleCatalog !== "All") params.set("rule_catalog", ruleCatalog);
  if (ruleName && ruleName !== "All") params.set("rule_name", ruleName);
  const query = params.toString();
  const res = await fetch(query ? `${ENDPOINT}?${query}` : ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(
      `getExceptionHistDates failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getExceptionHistDates: expected array response");
  }
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((s) => (s.length >= 10 ? s.slice(0, 10) : s))
    .filter((s) => isoRe.test(s));
}
