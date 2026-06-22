const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const RULE_NAMES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRuleNames`;

// fetchRuleNames returns the individual RULE_NAMEs (from the RULE table)
// that belong to the given catalog. GET_RULES now returns one row per
// catalog, so the tree-view leaf level uses this endpoint to enumerate
// the rules underneath each catalog.
export async function fetchRuleNames(
  ruleCatalog: string,
  signal?: AbortSignal
): Promise<string[]> {
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
  return raw as string[];
}
