import type { SecurityRow } from "../components/types";

const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const ASSETS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getAssets`;

type ApiAsset = {
  exception_date?: string;
  priority?: string;
  severity?: string;
  type?: string;
  assign_to?: string;
  asset_id?: string;
  figi?: string;
  security_description?: string;
  trader?: string;
  trading_team?: string;
  exception_count?: number;
  bbg_last_refresh?: string;
};

function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toSecurityRow(a: ApiAsset): SecurityRow {
  return {
    dateTime: formatDateTime(a.exception_date),
    priority: a.priority ?? "",
    severity: a.severity ?? "",
    type: a.type ?? "",
    assignTo: a.assign_to ?? "",
    aladdinId: a.asset_id ?? "",
    figi: a.figi ?? "",
    securityDescription: a.security_description ?? "",
    trader: a.trader ?? "",
    tradingTeam: a.trading_team ?? "",
    exceptionCount: a.exception_count ?? 0,
    bbgLastRefresh: a.bbg_last_refresh ?? "",
    triggerBbg: false,
    exceptions: [],
  };
}

export async function fetchAssets(signal?: AbortSignal): Promise<SecurityRow[]> {
  const res = await fetch(ASSETS_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(`getAssets failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as ApiAsset[];
  if (!Array.isArray(raw)) {
    throw new Error("getAssets: expected array response");
  }
  return raw.map(toSecurityRow);
}
