const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EXCEPTION_TYPES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getExceptionTypes`;

export async function fetchExceptionTypes(
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(EXCEPTION_TYPES_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(
      `getExceptionTypes failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as string[];
  if (!Array.isArray(raw)) {
    throw new Error("getExceptionTypes: expected array response");
  }
  return raw.filter((c): c is string => typeof c === "string" && c.length > 0);
}
