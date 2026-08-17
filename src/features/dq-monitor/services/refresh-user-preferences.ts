const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/refreshUserPreferences`;

// Forces the backend to re-read USER_PREFERENCES from Snowflake for
// the (user, rule_group, rule_catalog) tuple and rewrite its
// process-local cache slot with the fresh value. Called right after
// updateUserPreferences succeeds in the Save Column Order flow so
// the just-persisted layout is what subsequent getUserPreferences
// calls (all cache reads) return — without waiting for the
// cache-miss path to catch up.
//
// GET-shaped (mirrors /getUserPreferences) even though it mutates
// in-process cache state — the underlying DB stays read-only, so
// the endpoint remains safe to retry and cache-bust from browsers
// / debug tooling.
//
// Pass ruleCatalog as "" when the LHS tree is at the group root —
// the SP treats "" the same as NULL and matches the row where
// RULE_CATALOG_ID IS NULL.
//
// Returns the column-order string the backend cached (opaque to
// this service — a JSON array on the wire today, "" when no
// saved layout exists for the scope). Errors bubble up; the
// caller in DqMonitorPage logs and swallows them because a refresh
// failure shouldn't block the save-succeeded UX.
export async function refreshUserPreferences(
  user: string,
  ruleGroup: string,
  ruleCatalog: string,
  signal?: AbortSignal
): Promise<string> {
  const params = new URLSearchParams();
  params.set("user", user);
  params.set("rule_group", ruleGroup);
  if (ruleCatalog && ruleCatalog.trim() !== "") {
    params.set("rule_catalog", ruleCatalog.trim());
  }
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(
      `refreshUserPreferences failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { column_order?: unknown };
  return typeof body.column_order === "string" ? body.column_order : "";
}
