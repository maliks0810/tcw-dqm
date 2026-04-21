
import React, { useEffect, useState } from "react";
import { useOktaAuth } from "@okta/okta-react";

export default function Home() {
  const { oktaAuth, authState } = useOktaAuth();
  const [user, setUser] = useState<string>("");

  useEffect(() => {
    if (!authState?.isAuthenticated) return;

    (async () => {
      const userInfo = await oktaAuth.getUser();
      setUser(
        userInfo.preferred_username ||
        userInfo.email ||
        "Unknown User"
      );
    })();
  }, [authState?.isAuthenticated, oktaAuth]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Home</h2>
      <p>✅ Login successful</p>
      <p>👤 Welcome, <b>{user}</b></p>

      <button onClick={() => oktaAuth.signOut()}>
        Logout
      </button>
    </div>
  );
}