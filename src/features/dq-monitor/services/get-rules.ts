const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const RULES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRules`;

export type Rule = {
  rule_catalog_id: number;
  rule_catalog_name: string;
  rule_command: string;
  environment: string;
};

// rule_type controls how rule_name is interpreted on the server:
//   "CATALOG" / "RULE" → rule_name matches RULE_CATALOG.NAME
//   "GROUP"            → rule_name matches RULE_GROUP.NAME (returns all
//                        catalogs belonging to that group)
// Omitting both ruleName and ruleType returns every catalog.
export type RuleFilterType = "CATALOG" | "GROUP" | "RULE";

export async function fetchRules(
  ruleName?: string,
  ruleType?: RuleFilterType,
  signal?: AbortSignal
): Promise<Rule[]> {
  const params = new URLSearchParams();
  if (ruleName && ruleName !== "All") {
    params.set("rule_name", ruleName);
    if (ruleType) params.set("rule_type", ruleType);
  }
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
