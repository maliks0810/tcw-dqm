const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const SECURITY_GROUPS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getSecurityGroups`;

// Distinct SECURITY_GROUP values from SECURITY_CURRENT_VW, ordered
// alphabetically. Backend hits SP_GET_SECURITY_GROUPS, which already
// drops blank / NULL groups, so every entry here is selectable.
//
// Feeds the Security Group dropdown on the Bulk Assign panel.
export async function fetchSecurityGroups(
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(SECURITY_GROUPS_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(
      `getSecurityGroups failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getSecurityGroups: expected array response");
  }
  // Defensive: the endpoint returns plain strings, but a null slipping
  // through would render an empty <option> the operator cannot tell
  // apart from a real one.
  return raw
    .map((v) => (typeof v === "string" ? v : String(v ?? "")))
    .filter((v) => v.trim() !== "");
}
