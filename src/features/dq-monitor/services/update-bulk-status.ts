const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateBulkStatus`;

// Bulk-updates STATUS_ID (plus optional COMMENTS + SUPPRESS_DATE) on an
// explicit set of EXCEPTION rows.
//
// exceptionIds are EXCEPTION.EXCEPTION_ID values — the same primary key
// the per-row updateExceptionStatus endpoint takes, and the key behind
// every checkbox in the Exceptions grid's bulk-selection column. This
// replaced the previous rule_names targeting: a rule name matched every
// exception of that rule, which is not what "apply to the rows I
// ticked" means. The backend flattens the array into a temp table and
// joins EXCEPTION on EXCEPTION_ID, so an empty array must update
// nothing rather than everything — callers never send one.
//
// comments is (string | null):
//   null  → leave the existing COMMENTS untouched (backend passes NULL)
//   ""    → clear COMMENTS
//   any   → set COMMENTS to the given value
// The backend UpdateBulkStatus handler expects a *string (nullable),
// which JSON.stringify(undefined) elides — always send null explicitly.
//
// suppressDate is a plain string:
//   ""            → leave existing SUPPRESS_DATE untouched (there is
//                   no bulk-clear affordance on the panel)
//   "YYYY-MM-DD"  → set SUPPRESS_DATE to this date on every selected
//                   EXCEPTION row. The panel makes this mandatory when
//                   status is Suppress, mirroring the per-row rule.
// The backend NULLIF('','')s empty strings into SQL NULL then
// COALESCE'es with the existing value, so "" round-trips as "no-op".
//
// Returns the number of EXCEPTION rows updated.
export async function updateBulkStatus(
  exceptionIds: number[],
  status: string,
  comments: string | null,
  suppressDate: string
): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      exception_ids: exceptionIds,
      status,
      comments,
      suppress_date: suppressDate,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `updateBulkStatus failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { updated?: number };
  return body.updated ?? 0;
}
