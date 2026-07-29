const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateBulkAssign`;

// Bulk-assigns a user to every EXCEPTION belonging to any of the passed
// rule names. When isPermanent is false (default), the backend also
// writes one RULE_ASSIGN_OVERRIDE row per rule so future exceptions of
// those rules inherit the same assignee. When isPermanent is true, the
// backend updates RULE.ASSIGN_TO_ID directly (permanent change to the
// rule default) and skips RULE_ASSIGN_OVERRIDE entirely. Both parameters
// are resolved server-side via DM_USER."USER" and RULE."RULE_NAME".
// Returns the number of EXCEPTION rows updated.
export async function updateBulkAssign(
  ruleNames: string[],
  assignTo: string,
  isPermanent = false
): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rule_names: ruleNames,
      assign_to: assignTo,
      is_permanent: isPermanent,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `updateBulkAssign failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { updated?: number };
  return body.updated ?? 0;
}
