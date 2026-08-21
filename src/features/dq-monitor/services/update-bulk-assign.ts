const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateBulkAssign`;

// Bulk-assigns a user to an explicit set of EXCEPTION rows.
//
// exceptionIds are EXCEPTION.EXCEPTION_ID values — the ticked rows in
// the Exceptions grid's bulk-selection column, and the same key the
// per-row updateExceptionAssign endpoint takes. This replaced the
// previous rule_names targeting, which swept in every exception of a
// rule rather than the ones the operator picked.
//
// ruleNames is NOT a target set — it is the distinct set of rules the
// selected rows belong to, derived client-side and sent only so the
// isPermanent path still has rule identity to work with. When
// isPermanent is false (default) the backend writes one
// RULE_ASSIGN_OVERRIDE row per rule in that set so future exceptions of
// those rules inherit the same assignee; when true it updates
// RULE.ASSIGN_TO_ID directly (permanent change to the rule default) and
// skips RULE_ASSIGN_OVERRIDE entirely. Either way EXCEPTION rows are
// updated strictly by exceptionIds. assignTo is resolved server-side
// via DM_USER."USER".
//
// Returns the number of EXCEPTION rows updated.
export async function updateBulkAssign(
  exceptionIds: number[],
  assignTo: string,
  isPermanent = false,
  ruleNames: string[] = []
): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      exception_ids: exceptionIds,
      assign_to: assignTo,
      is_permanent: isPermanent,
      rule_names: ruleNames,
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
