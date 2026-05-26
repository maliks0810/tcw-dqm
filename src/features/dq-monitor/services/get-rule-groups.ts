const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const RULE_GROUPS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRuleGroups`;

export async function fetchRuleGroups(
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(RULE_GROUPS_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(`getRuleGroups failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getRuleGroups: expected array response");
  }
  return raw.filter((v): v is string => typeof v === "string");
}
