const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateUserPreferences`;

// Upserts the operator's UI preferences (today: column order) into
// USER_PREFERENCES for the (user, rule group, rule catalog) tuple.
// Pass ruleCatalog as "" when the LHS tree is at the group root —
// the backend then stores RULE_CATALOG_ID as NULL.
//
// columnOrder should be the caller's ordered array of visible
// grid column labels — this service stringifies it via JSON.stringify
// so callers never have to remember the wire format.
//
// Return value mirrors the SP's status:
//   0 — no-op (unknown user, group, or explicit catalog name).
//   1 — inserted a new preferences row.
//   2 — updated an existing preferences row.
export async function updateUserPreferences(
  user: string,
  ruleGroup: string,
  ruleCatalog: string,
  columnOrder: string[],
  signal?: AbortSignal
): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user,
      rule_group: ruleGroup,
      rule_catalog: ruleCatalog,
      column_order: JSON.stringify(columnOrder),
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(
      `updateUserPreferences failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { status?: unknown };
  return typeof body.status === "number" ? body.status : 0;
}
