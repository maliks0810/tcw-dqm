import { OktaAuth, toRelativeUrl } from "@okta/okta-auth-js";
import type { OktaEnvConfig } from "../environment";

export function createOktaAuth(cfg: OktaEnvConfig) {
  return new OktaAuth({
    issuer: cfg.issuer,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    scopes: cfg.scopes,
    pkce: true,
  });
}

export function restoreOriginalUri(_oktaAuth: OktaAuth, originalUri?: string) {
  const baseUrl = window.location.origin;
  const url = toRelativeUrl(originalUri || "/", baseUrl);
  window.location.replace(url); // ✅ ends at "/" (Home)
}