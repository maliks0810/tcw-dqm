const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRulesForGroup`;

export type RuleForGroup = {
  rule_name: string;
  catalog_name: string;
  rule_description: string;
};

// Returns one row per active RULE under the given group, projected as
// (rule_name, catalog_name, rule_description). Collapses what the LHS
// tree used to do in N+1 round-trips (fetchRuleCatalogs → per-catalog
// fetchRuleNames) into one call. Backend hits SP_GET_RULES_FOR_GROUP.
export async function fetchRulesForGroup(
  ruleGroup: string,
  signal?: AbortSignal
): Promise<RuleForGroup[]> {
  const params = new URLSearchParams();
  params.set("rule_group", ruleGroup);
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(
      `getRulesForGroup failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getRulesForGroup: expected array response");
  }
  return (raw as Array<Record<string, unknown>>)
    .filter((r) => r != null && typeof r === "object")
    .map((r) => ({
      rule_name: typeof r.rule_name === "string" ? r.rule_name : "",
      catalog_name: typeof r.catalog_name === "string" ? r.catalog_name : "",
      rule_description:
        typeof r.rule_description === "string" ? r.rule_description : "",
    }));
}
