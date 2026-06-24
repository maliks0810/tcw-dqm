const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EXECUTE_RULES_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/executeRules`;

export async function executeRules(
  assetId: string,
  idBbGlobal?: string,
  signal?: AbortSignal
): Promise<void> {
  const params = new URLSearchParams();
  params.set("asset_id", assetId);
  if (idBbGlobal) params.set("id_bb_global", idBbGlobal);

  const res = await fetch(`${EXECUTE_RULES_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    throw new Error(`executeRules failed: ${res.status} ${res.statusText}`);
  }
}
