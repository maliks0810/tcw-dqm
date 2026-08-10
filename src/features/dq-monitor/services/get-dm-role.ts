const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getDMRole`;

// Fetches DM_USER.ROLE for the given operator display name and
// returns it as a string ("DM_ADMIN", "DM_USER", …). Unknown user
// resolves to "" which the caller treats as the least-privileged
// default — Bulk Assign / Bulk Status stay hidden and per-row
// Assign To stays read-only.
//
// The operator name is currently hard-coded to "Joann Banks" in
// DqMonitorPage. Once Okta integration lands, replace that call
// site with whatever getUser() returns from the Okta auth context.
export async function fetchDMRole(
  user: string,
  signal?: AbortSignal
): Promise<string> {
  const url = `${ENDPOINT}?user=${encodeURIComponent(user)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`getDMRole failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { role?: unknown };
  return typeof body.role === "string" ? body.role : "";
}
