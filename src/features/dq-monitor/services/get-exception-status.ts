const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EXCEPTION_STATUS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getExceptionStatus`;

export async function fetchExceptionStatus(
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(EXCEPTION_STATUS_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(
      `getExceptionStatus failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getExceptionStatus: expected array response");
  }
  return raw.filter((v): v is string => typeof v === "string");
}
