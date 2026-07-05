const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateExceptionComments`;

// Updates EXCEPTION.COMMENTS (free-form varchar(2048)) for one row keyed by
// exception_id. Blank string clears the cell. Returns the number of rows
// updated (0 if the row didn't match).
export async function updateExceptionComments(
  exceptionId: number,
  comments: string
): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exception_id: exceptionId, comments }),
  });
  if (!res.ok) {
    throw new Error(
      `updateExceptionComments failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { updated?: number };
  return body.updated ?? 0;
}
