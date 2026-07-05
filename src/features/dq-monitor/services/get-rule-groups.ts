const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const RULE_GROUPS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRuleGroups`;

export type RuleGroupInfo = {
  name: string;
  flagStatusVisible: boolean;
  flagCommentsVisible: boolean;
};

type ApiRuleGroup = {
  name?: string;
  flag_status_visible?: boolean;
  flag_comments_visible?: boolean;
};

export async function fetchRuleGroups(
  signal?: AbortSignal
): Promise<RuleGroupInfo[]> {
  const res = await fetch(RULE_GROUPS_ENDPOINT, { signal });
  if (!res.ok) {
    throw new Error(`getRuleGroups failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getRuleGroups: expected array response");
  }
  return (raw as ApiRuleGroup[])
    .filter((g): g is ApiRuleGroup => g != null && typeof g === "object")
    .map((g) => ({
      name: typeof g.name === "string" ? g.name : "",
      flagStatusVisible: g.flag_status_visible === true,
      flagCommentsVisible: g.flag_comments_visible === true,
    }));
}
