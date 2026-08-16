const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getDMRole`;

// Fetches DM_USER.ROLE for the given operator display name and
// returns it as a string ("DM_ADMIN", "IT_SUPPORT", "DM_USER", …).
// DM_ADMIN and IT_SUPPORT both unlock the elevated UI surfaces via
// isPrivilegedRole; anything else — DM_USER, "", unknown user —
// leaves the operator in the least-privileged state (Bulk Assign
// / Bulk Status hidden, per-row Assign To read-only).
//
// The operator name comes from useCurrentDmUser() in DqMonitorPage —
// STANDALONE_APP=true hardcodes "Joann Banks"; STANDALONE_APP=false
// reads the value TIME-Next injects via <CurrentUserProvider>.
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
