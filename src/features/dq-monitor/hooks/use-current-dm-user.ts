import { createContext, useContext } from "react";

// The DM_USER."USER" display name of the operator running the app.
// Every backend SP that takes a user (SP_GET_DM_ROLE,
// SP_GET_RULE_GROUPS_FOR_USER, SP_UPDATE_USER_PREFERENCES,
// SP_GET_USER_PREFERENCES) expects this exact form — matching what
// the DM_USER table stores.
//
// Two resolution paths, controlled by the STANDALONE_APP env flag:
//
//   STANDALONE_APP=true  — standalone dev in the tcw-dqm repo. The
//                          hook returns the hardcoded DEV_USER
//                          ("Joann Banks", a real seeded row in
//                          DM_USER). Skips the context lookup so
//                          local dev works without wiring an auth
//                          provider.
//
//   STANDALONE_APP=false — embedded in TIME-Next (or any host that
//                          knows the operator). The host wraps the
//                          mount point in
//                              <CurrentUserProvider value={userName}>
//                          where userName is TIME-Next's Okta-
//                          resolved display name (e.g.
//                          useUserInfo().name from
//                          @platform/utils). The hook then returns
//                          that injected value. If the host forgets
//                          the provider, the hook falls back to
//                          DEV_USER so the app stays functional
//                          rather than crashing on an empty user.
//
// Note on env-var access: this file uses process.env directly (CRA
// convention). The TIME-Next copy of tcw-dqm rewrites env reads to
// import.meta.env.VITE_* — the same rewrite pattern used across the
// other services (see get-*.ts). Keep the two prefixes in sync in
// the .env files.

const CurrentUserContext = createContext<string>("");
export const CurrentUserProvider = CurrentUserContext.Provider;

// DM_USER.ROLE values that unlock the elevated UI surfaces: Bulk
// Assign / Bulk Status buttons and per-row Assign To editability.
// DM_ADMIN is the primary operator role; IT_SUPPORT and IT_USER
// inherit the same UI privileges but are deliberately excluded
// from being assignment TARGETS (SP_GET_DM_USERS filters both out
// of the dropdown feed). IT_USER is a distinct role from
// IT_SUPPORT so future policy can diverge without a schema change.
// Any other role — DM_USER, NULL, "" — is least-privileged and
// sees the read-only surfaces.
export function isPrivilegedRole(role: string): boolean {
  return (
    role === "DM_ADMIN" || role === "IT_SUPPORT" || role === "IT_USER"
  );
}

const DEV_USER = "Joann Banks";

// Parse the flag once at module load. Defaults to true when the var
// is missing so a fresh clone works without an env file — TIME-Next
// explicitly sets it to false in its build.
const STANDALONE_APP: boolean = (() => {
  const raw = String(process.env.REACT_APP_STANDALONE_APP ?? "")
    .trim()
    .toLowerCase();
  if (raw === "") return true;
  return raw !== "false" && raw !== "0";
})();

export function useCurrentDmUser(): string {
  const injected = useContext(CurrentUserContext);
  if (STANDALONE_APP) return DEV_USER;
  const clean = injected.trim();
  return clean !== "" ? clean : DEV_USER;
}
