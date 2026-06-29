const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EXECUTE_RULES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/executeRules`;
const EXECUTE_SECURITY_RULES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/executeSecurityRules`;

// rule_name + rule_type scope which catalogs the backend will run, using the
// same semantics as /getRules: "CATALOG" | "RULE" match RULE_CATALOG.NAME,
// "GROUP" matches RULE_GROUP.NAME, omit / empty runs every catalog.
export type RuleFilterType = "CATALOG" | "GROUP" | "RULE";

function buildParams(
  assetId: string,
  idBbGlobal?: string,
  ruleName?: string,
  ruleType?: RuleFilterType
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("asset_id", assetId);
  if (idBbGlobal) params.set("id_bb_global", idBbGlobal);
  if (ruleName && ruleName !== "All") {
    params.set("rule_name", ruleName);
    if (ruleType) params.set("rule_type", ruleType);
  }
  return params;
}

export async function executeRules(
  assetId: string,
  idBbGlobal?: string,
  ruleName?: string,
  ruleType?: RuleFilterType,
  signal?: AbortSignal
): Promise<void> {
  const params = buildParams(assetId, idBbGlobal, ruleName, ruleType);
  const res = await fetch(`${EXECUTE_RULES_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    throw new Error(`executeRules failed: ${res.status} ${res.statusText}`);
  }
}

// Hits /executeSecurityRules — same query-param contract as executeRules,
// but routes through the dedicated security-rule entry point on the backend
// so the security flow can diverge from the generic ExecuteRules pipeline
// later without breaking other callers.
export async function executeSecurityRules(
  assetId: string,
  idBbGlobal?: string,
  ruleName?: string,
  ruleType?: RuleFilterType,
  signal?: AbortSignal
): Promise<void> {
  const params = buildParams(assetId, idBbGlobal, ruleName, ruleType);
  const res = await fetch(
    `${EXECUTE_SECURITY_RULES_ENDPOINT}?${params.toString()}`,
    {
      method: "GET",
      signal,
    }
  );
  if (!res.ok) {
    throw new Error(
      `executeSecurityRules failed: ${res.status} ${res.statusText}`
    );
  }
}
