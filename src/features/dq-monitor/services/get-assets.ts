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
  all_complete?: boolean;
};

// Renders as "08/19/26, 06:06 AM" — zero-padded throughout so the
// column stays visually aligned, 12-hour with an explicit meridiem.
// Built by hand rather than via toLocaleString: recent ICU emits a
// narrow no-break space (U+202F) before AM/PM, which looks right but
// isn't the plain space the format calls for, and the exact output
// would then drift with the browser's ICU version.
function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p2 = (n: number) => String(n).padStart(2, "0");
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return (
    `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${p2(d.getFullYear() % 100)}, ` +
    `${p2(h12)}:${p2(d.getMinutes())} ${h24 < 12 ? "AM" : "PM"}`
  );
}

function toSecurityRow(a: ApiAsset): SecurityRow {
  return {
    dateTime: formatDateTime(a.exception_date),
    dateTimeIso: a.exception_date ?? "",
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
    allComplete: !!a.all_complete,
    exceptions: [],
  };
}

export async function fetchAssets(
  signal?: AbortSignal,
  exceptionType?: string,
  severity?: string,
  priority?: string,
  ruleCatalog?: string,
  ruleName?: string,
  exceptionState?: string,
  assignTo?: string,
  ruleGroup?: string
): Promise<SecurityRow[]> {
  const params = new URLSearchParams();
  if (exceptionType) params.set("exception_type", exceptionType);
  if (severity && severity !== "All") params.set("severity", severity);
  if (priority && priority !== "All") params.set("priority", priority);
  if (ruleCatalog && ruleCatalog !== "All") params.set("rule_catalog", ruleCatalog);
  if (ruleName && ruleName !== "All") params.set("rule_name", ruleName);
  if (exceptionState && exceptionState !== "All")
    params.set("exception_state", exceptionState);
  if (assignTo && assignTo !== "All") params.set("assign_to", assignTo);
  if (ruleGroup && ruleGroup !== "All") params.set("rule_group", ruleGroup);
  const qs = params.toString();
  const url = qs ? `${ASSETS_ENDPOINT}?${qs}` : ASSETS_ENDPOINT;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`getAssets failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as ApiAsset[];
  if (!Array.isArray(raw)) {
    throw new Error("getAssets: expected array response");
  }
  const sorted = raw.slice().sort((a, b) => {
    const ta = a.exception_date ? new Date(a.exception_date).getTime() : 0;
    const tb = b.exception_date ? new Date(b.exception_date).getTime() : 0;
    return tb - ta;
  });
  return sorted.map(toSecurityRow);
}
