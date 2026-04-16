import React, { useEffect, useState } from "react";
import { useOktaAuth } from "@okta/okta-react";

export default function Header() {
  const { oktaAuth, authState } = useOktaAuth();
  const [user, setUser] = useState<string>("");

  useEffect(() => {
    if (!authState?.isAuthenticated) return;

    (async () => {
      const userInfo = await oktaAuth.getUser();
      setUser(
        (userInfo as any)?.preferred_username ||
          (userInfo as any)?.email ||
          "Unknown User"
      );
    })();
  }, [authState?.isAuthenticated, oktaAuth]);

  const handleLogout = async () => {
    await oktaAuth.signOut({
      postLogoutRedirectUri: `${window.location.origin}/login`,
    });
  };

  return (
    <div className="dq-header">
      <div className="dq-header-left">
        <div className="dq-header-brand">TCW</div>
        <div className="dq-header-title-wrap">
          <h1 className="dq-header-title">DATA MANAGEMENT DATA QUALITY MONITOR</h1>
          <div className="dq-header-date">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
      </div>

      <div className="dq-header-right">
        <div className="dq-user">👤 {user}</div>
        <button className="dq-logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}