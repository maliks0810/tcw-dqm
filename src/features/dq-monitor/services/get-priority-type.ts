const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const PRIORITY_TYPE_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getPriorityType`;

export async function fetchPriorityTypes(
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(PRIORITY_TYPE_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(
      `getPriorityType failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getPriorityType: expected array response");
  }
  return raw.filter((v): v is string => typeof v === "string");
}
