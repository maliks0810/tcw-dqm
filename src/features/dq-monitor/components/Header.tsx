import React, { useEffect, useState } from "react";
import { useOktaAuth } from "@okta/okta-react";
import {
  SWAGGER_ENABLED,
  SWAGGER_URL,
  USE_OKTA,
} from "../../../services/auth-mode";

type HeaderProps = {
  onExportClick?: () => void;
  modeToggleLabel?: string;
  onModeToggleClick?: () => void;
};

export default function Header({
  onExportClick,
  modeToggleLabel,
  onModeToggleClick,
}: HeaderProps = {}) {
  const oktaCtx = useOktaAuth();
  const oktaAuth = oktaCtx?.oktaAuth;
  const authState = oktaCtx?.authState;
  const [user, setUser] = useState<string>(USE_OKTA ? "" : "Local User");

  useEffect(() => {
    if (!USE_OKTA) return;
    if (!authState?.isAuthenticated || !oktaAuth) return;

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
    if (!USE_OKTA || !oktaAuth) return;
    await oktaAuth.signOut({
      postLogoutRedirectUri: `${window.location.origin}/login`,
    });
  };

  return (
    <div className="dq-header">
      <div className="dq-header-left">
        {USE_OKTA && <div className="dq-header-brand">TCW</div>}
      </div>

      <div className="dq-header-title-wrap">
        <h1 className="dq-header-title">DATA QUALITY MONITOR</h1>
      </div>

      <div className="dq-header-right">
        {modeToggleLabel && onModeToggleClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onModeToggleClick}
          >
            {modeToggleLabel}
          </button>
        )}
        {onExportClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onExportClick}
          >
            Export to Excel
          </button>
        )}
        {SWAGGER_ENABLED && (
          <a
            className="dq-export-btn"
            href={SWAGGER_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Swagger
          </a>
        )}
        {USE_OKTA && (
          <>
            <div className="dq-user">👤 {user}</div>
            <button className="dq-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </>
        )}
      </div>
    </div>
  );
}
