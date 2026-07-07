const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateExceptionAssignTo`;

// Updates EXCEPTION.ASSIGN_TO_ID for a single row keyed by exception_id
// (distinct from the Assets grid's per-asset updateAssignTo). Empty
// string clears the assignment. Returns the number of rows updated.
export async function updateExceptionAssignTo(
  exceptionId: number,
  assignTo: string
): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exception_id: exceptionId, assign_to: assignTo }),
  });
  if (!res.ok) {
    throw new Error(
      `updateExceptionAssignTo failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { updated?: number };
  return body.updated ?? 0;
}
