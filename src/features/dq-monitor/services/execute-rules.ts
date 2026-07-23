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

// Body shape POSTed to /executeRules. Mirrors models.ExecuteRulesRequest
// on the Go side. is_refresh defaults to 'Y' server-side when omitted.
export type ExecuteRulesRequest = {
  rule_name?: string;
  rule_type?: RuleFilterType;
  is_refresh?: "Y" | "N";
  params?: Record<string, string>;
};

// Every response from /executeRules — 200, 404, 500 — carries this
// shape. Mirrors models.ExecuteRulesResponse on the Go side.
// exception_status duplicates the HTTP status so callers that only
// inspect the body still see the outcome.
export type ExecuteRulesResponse = {
  exception_count: number;
  exception_message?: string;
  exception_status: number;
};

// /executeRules archives today's EXCEPTION rows for the scoped catalogs
// into EXCEPTION_HIST, then re-inserts whatever the catalog sources
// return — no asset_id / id_bb_global scoping. Use executeSecurityRules
// for the per-asset incremental flow.
//
// Sends the ExecuteRulesRequest as a JSON POST body (backend also
// accepts the legacy query-string form for GET compatibility, but we
// prefer the typed body). Returns the parsed ExecuteRulesResponse
// verbatim regardless of HTTP status — callers can branch on
// exception_status. Only throws on a network failure or an
// unparseable response body.
export async function executeRules(
  ruleName?: string,
  ruleType?: RuleFilterType,
  signal?: AbortSignal
): Promise<ExecuteRulesResponse> {
  const body: ExecuteRulesRequest = {};
  if (ruleName && ruleName !== "All") {
    body.rule_name = ruleName;
    if (ruleType) body.rule_type = ruleType;
  }
  const res = await fetch(EXECUTE_RULES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  // Body always JSON of shape ExecuteRulesResponse — parse regardless
  // of res.ok because the backend encodes error text into
  // exception_message. If the body parse fails (proxy interference,
  // 502/504 gateway page), synthesize a response so callers still get
  // a typed value.
  try {
    return (await res.json()) as ExecuteRulesResponse;
  } catch {
    return {
      exception_count: 0,
      exception_message: `executeRules failed: ${res.status} ${res.statusText}`,
      exception_status: res.status,
    };
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
