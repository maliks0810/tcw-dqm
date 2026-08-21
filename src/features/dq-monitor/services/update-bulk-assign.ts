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
// isPermanent path has rule identity to work with. It matters ONLY when
// isPermanent is true, where the backend sets RULE.ASSIGN_TO_ID so
// future exceptions of those rules inherit the assignee. When
// isPermanent is false the backend makes no rule-level write at all.
//
// That false branch used to insert a RULE_ASSIGN_OVERRIDE row per rule,
// which silently reassigned every UNTICKED exception of the rule that
// had no assignee of its own: SP_GET_EXCEPTIONS displays
// COALESCE(EXCEPTION.ASSIGN_TO_ID, override.ASSIGN_TO_ID,
// RULE.ASSIGN_TO_ID), so ticking 2 rows of a 3-row rule reported
// "2 assigned" and showed 3.
//
// Either way EXCEPTION rows are updated strictly by exceptionIds.
// assignTo is resolved server-side via DM_USER."USER".
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
