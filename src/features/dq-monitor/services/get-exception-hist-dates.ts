const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getExceptionHistDates`;

// Returns the ISO YYYY-MM-DD dates (last 60 days, most recent first) that
// have any EXCEPTION_HIST activity. Powers the "DQM Date" dropdown — one
// entry per calendar day regardless of how many BATCH_IDs it holds.
export async function fetchExceptionHistDates(
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(ENDPOINT, { signal });
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
