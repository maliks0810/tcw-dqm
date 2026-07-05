const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateExceptionStatus`;

// Updates EXCEPTION.STATUS_ID for one row keyed by exception_id. status
// is the EXCEPTION_STATUS.NAME value (e.g. "New", "Accept"). Returns the
// number of rows updated (0 if the row or status name didn't resolve).
export async function updateExceptionStatus(
  exceptionId: number,
  status: string
): Promise<number> {
  const params = new URLSearchParams();
  params.set("exception_id", String(exceptionId));
  params.set("status", status);
  const res = await fetch(`${ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(
      `updateExceptionStatus failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { updated?: number };
  return body.updated ?? 0;
}
