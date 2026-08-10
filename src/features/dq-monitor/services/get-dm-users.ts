const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const DM_USERS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getDMUsers`;

// One row from DM_USER as returned by SP_GET_DM_USERS. role + email
// were added alongside the original user column; the "Unassigned"
// placeholder row has both empty.
export type DMUser = {
  user: string;
  role: string;
  email: string;
};

export async function fetchDMUsers(signal?: AbortSignal): Promise<DMUser[]> {
  const res = await fetch(DM_USERS_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(`getDMUsers failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getDMUsers: expected array response");
  }
  return raw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((r) => ({
      user: typeof r.user === "string" ? r.user : "",
      role: typeof r.role === "string" ? r.role : "",
      email: typeof r.email === "string" ? r.email : "",
    }))
    .filter((u) => u.user !== "");
}
