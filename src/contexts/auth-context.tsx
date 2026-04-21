import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Security } from "@okta/okta-react";
import type { OktaAuth } from "@okta/okta-auth-js";
import { createOktaAuth, restoreOriginalUri } from "../services/okta/okta-auth-client";
import { loadEnv } from "../services/environment";

type AuthUser = {
  userId: string;
  rawClaims?: Record<string, unknown>;
};

type AuthContextValue = {
  oktaAuth: OktaAuth | null;
  user: AuthUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [oktaAuth, setOktaAuth] = useState<OktaAuth | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [identityField, setIdentityField] = useState<string>("preferred_username");

  useEffect(() => {
    (async () => {
      const env = await loadEnv();
      setIdentityField(env.okta.identityFieldInToken || "preferred_username");

      const client = createOktaAuth(env.okta);
      setOktaAuth(client);

      // initial user resolve
      const authenticated = await client.isAuthenticated();
      if (authenticated) {
        const userInfo = await client.getUser();
        const claims = await client.tokenManager.get("idToken");
        const claimMap = (claims as any)?.claims || {};
        const userId =
          (claimMap?.[env.okta.identityFieldInToken || "preferred_username"] as string) ||
          (userInfo as any)?.preferred_username ||
          (userInfo as any)?.email ||
          "Unknown user";

        setUser({ userId, rawClaims: claimMap });
      }

      setLoading(false);

      // keep in sync
      const handler = async () => {
        const authed = await client.isAuthenticated();
        if (!authed) {
          setUser(null);
          return;
        }
        const idTok = await client.tokenManager.get("idToken");
        const claimMap = (idTok as any)?.claims || {};
        const userId =
          (claimMap?.[env.okta.identityFieldInToken || "preferred_username"] as string) ||
          "Unknown user";
        setUser({ userId, rawClaims: claimMap });
      };

      client.authStateManager.subscribe(handler);
      client.start();

      return () => {
        client.authStateManager.unsubscribe(handler);
        client.stop();
      };
    })().catch((e) => {
      console.error("Auth init failed:", e);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      oktaAuth,
      user,
      loading,
      login: async () => {
        if (!oktaAuth) return;
        await oktaAuth.signInWithRedirect();
      },
      logout: async () => {
        if (!oktaAuth) return;
        await oktaAuth.signOut();
      },
    }),
    [oktaAuth, user, loading]
  );

  if (!oktaAuth) {
    // while loading oktaAuth, just render children (or a loader)
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  return (
    <Security oktaAuth={oktaAuth} restoreOriginalUri={restoreOriginalUri}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </Security>
  );
}