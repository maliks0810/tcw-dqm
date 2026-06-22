const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const RULES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRules`;

export type Rule = {
  rule_catalog_id: number;
  rule_catalog_name: string;
  rule_command: string;
  environment: string;
};

export async function fetchRules(
  ruleCatalog?: string,
  signal?: AbortSignal
): Promise<Rule[]> {
  const params = new URLSearchParams();
  if (ruleCatalog && ruleCatalog !== "All") params.set("rule_catalog", ruleCatalog);
  const qs = params.toString();
  const url = qs ? `${RULES_ENDPOINT}?${qs}` : RULES_ENDPOINT;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`getRules failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getRules: expected array response");
  }
  return raw as Rule[];
}
