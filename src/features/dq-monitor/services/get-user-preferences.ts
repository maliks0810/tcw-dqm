const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getUserPreferences`;

// Loads the operator's saved column layout for the (user, rule group,
// rule catalog) tuple. Pass ruleCatalog as "" when the LHS tree is at
// the group root — the backend matches the row with RULE_CATALOG_ID
// IS NULL (group-scoped layout).
//
// Returns:
//   string[] — the ordered array of column labels the operator last
//              saved for this scope (parsed from the JSON-encoded
//              column_order the backend returns).
//   null    — no saved layout for this scope. Caller falls back to
//              the canonical default order.
//
// A malformed / non-array payload is treated the same as "no saved
// layout" so a corrupt DB value can't wedge the grid.
export async function fetchUserPreferences(
  user: string,
  ruleGroup: string,
  ruleCatalog: string,
  signal?: AbortSignal
): Promise<string[] | null> {
  const params = new URLSearchParams();
  params.set("user", user);
  params.set("rule_group", ruleGroup);
  if (ruleCatalog) params.set("rule_catalog", ruleCatalog);
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(
      `getUserPreferences failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { column_order?: unknown };
  const raw =
    typeof body.column_order === "string" ? body.column_order : "";
  if (raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item === "string") out.push(item);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
