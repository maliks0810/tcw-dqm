import React, { useEffect, useState } from "react";
import { Security } from "@okta/okta-react";
import type { OktaAuth } from "@okta/okta-auth-js";
import { loadEnv } from "../services/environment";
import { createOktaAuth, restoreOriginalUri } from "../services/okta/okta-auth-client";

export default function OktaProvider({ children }: { children: React.ReactNode }) {
  const [oktaAuth, setOktaAuth] = useState<OktaAuth | null>(null);

  useEffect(() => {
    (async () => {
      const env = await loadEnv();
      const client = createOktaAuth(env.okta);
      setOktaAuth(client);
    })().catch((e) => console.error("Okta init failed:", e));
  }, []);

  if (!oktaAuth) return <div style={{ padding: 24 }}>Loading authentication…</div>;

  return (
    <Security oktaAuth={oktaAuth} restoreOriginalUri={restoreOriginalUri}>
      {children}
    </Security>
  );
}