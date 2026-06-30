const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const RULE_NAMES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRuleNames`;

export type RuleName = {
  rule_name: string;
  rule_description: string;
};

// fetchRuleNames returns RULE.RULE_NAME + RULE_DESCRIPTION pairs for the
// given catalog. The tree view renders rule_description when non-empty
// (falls back to rule_name) and the Exceptions header subtitle uses the
// same label when a specific rule is selected.
export async function fetchRuleNames(
  ruleCatalog: string,
  signal?: AbortSignal
): Promise<RuleName[]> {
  const params = new URLSearchParams();
  params.set("rule_catalog", ruleCatalog);
  const url = `${RULE_NAMES_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`getRuleNames failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getRuleNames: expected array response");
  }
  return raw as RuleName[];
}

// Picks the friendlier label for a rule — description when non-empty,
// otherwise the rule name. Shared by the tree leaf renderer and the
// Exceptions header subtitle. Defensive: if both are missing / blank
// (shouldn't happen if the backend response is well-formed) returns
// the literal "(unnamed rule)" so leaves never render as empty buttons.
export function ruleDisplayLabel(r: RuleName): string {
  const desc = (r.rule_description ?? "").trim();
  if (desc !== "") return desc;
  const name = (r.rule_name ?? "").trim();
  if (name !== "") return name;
  return "(unnamed rule)";
}
