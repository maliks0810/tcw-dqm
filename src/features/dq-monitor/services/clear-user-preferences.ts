const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/clearUserPreferences`;

// Deletes the operator's saved column layout for the (user, rule
// group, rule catalog) scope, so the grid falls back to its canonical
// default column order. Powers Settings → Reset Column Headers.
//
// POST rather than GET (unlike refreshUserPreferences, which only
// touches an in-process cache): this removes a row from
// USER_PREFERENCES, so it shouldn't sit behind a URL that a browser
// or crawler might replay.
//
// Pass ruleCatalog as "" when the LHS tree is at the group root — the
// backend then targets the row whose RULE_CATALOG_ID IS NULL. Only
// that one scope is cleared; the user's saved layouts for other
// groups and catalogs are untouched.
//
// Returns the number of rows deleted: 1 when a saved layout was
// removed, 0 when there was nothing to remove. Both are success —
// "no saved layout" is the state the caller is asking for.
export async function clearUserPreferences(
  user: string,
  ruleGroup: string,
  ruleCatalog: string,
  signal?: AbortSignal
): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user,
      rule_group: ruleGroup,
      rule_catalog: ruleCatalog,
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(
      `clearUserPreferences failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { cleared?: unknown };
  return typeof body.cleared === "number" ? body.cleared : 0;
}
