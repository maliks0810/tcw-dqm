import type { RuleGroupInfo } from "./get-rule-groups";

const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const RULE_GROUPS_FOR_USER_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/getRuleGroupsForUser`;

type ApiRuleGroup = {
  name?: string;
  flag_status_visible?: boolean;
  flag_comments_visible?: boolean;
  flag_suppress_date?: boolean;
  flag_assign_to_visible?: boolean;
};

// Returns the subset of RULE_GROUP rows the given operator is
// authorized to see, via RULE_GROUP_AUTHORIZATION.ACCESS_LIST on the
// backend. Same response shape as fetchRuleGroups so callers can
// swap between the two without reshaping. Unknown user / no email /
// no auth row → empty array (least-privileged tree).
//
// user is required; the LHS tree resolves it via useCurrentDmUser()
// in DqMonitorPage — STANDALONE_APP=true hardcodes "Joann Banks",
// STANDALONE_APP=false uses the name TIME-Next injects via
// <CurrentUserProvider>.
export async function fetchRuleGroupsForUser(
  user: string,
  signal?: AbortSignal
): Promise<RuleGroupInfo[]> {
  const params = new URLSearchParams();
  params.set("user", user);
  const res = await fetch(
    `${RULE_GROUPS_FOR_USER_ENDPOINT}?${params.toString()}`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(
      `getRuleGroupsForUser failed: ${res.status} ${res.statusText}`
    );
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("getRuleGroupsForUser: expected array response");
  }
  return (raw as ApiRuleGroup[])
    .filter((g): g is ApiRuleGroup => g != null && typeof g === "object")
    .map((g) => ({
      name: typeof g.name === "string" ? g.name : "",
      flagStatusVisible: g.flag_status_visible === true,
      flagCommentsVisible: g.flag_comments_visible === true,
      flagSuppressDate: g.flag_suppress_date === true,
      flagAssignToVisible: g.flag_assign_to_visible === true,
    }));
}
