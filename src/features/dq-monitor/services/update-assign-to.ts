const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const UPDATE_ASSIGN_TO_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/updateAssignTo`;

export async function updateAssignTo(
  assetId: string,
  assignTo: string
): Promise<number> {
  const params = new URLSearchParams();
  params.set("asset_id", assetId);
  params.set("assign_to", assignTo);
  const url = `${UPDATE_ASSIGN_TO_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `updateAssignTo failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { updated?: number };
  return body.updated ?? 0;
}
