import React, { useEffect, useState } from "react";
import { useOktaAuth } from "@okta/okta-react";
import { USE_OKTA } from "../../../services/auth-mode";

type HeaderProps = {
  onExportClick?: () => void;
  modeToggleLabel?: string;
  onModeToggleClick?: () => void;
  onBulkStatusClick?: () => void;
  bulkStatusLabel?: string;
  onBulkAssignClick?: () => void;
  bulkAssignLabel?: string;
  breakdown?: React.ReactNode;
  breakdownLeftOffset?: number;
};

export default function Header({
  onExportClick,
  modeToggleLabel,
  onModeToggleClick,
  onBulkStatusClick,
  bulkStatusLabel,
  onBulkAssignClick,
  bulkAssignLabel,
  breakdown,
  breakdownLeftOffset,
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

  // When a breakdown row is supplied, force the left column to occupy
  // exactly `breakdownLeftOffset` pixels so the breakdown starts at the
  // horizontal position where the Exceptions grid begins (sidebar width
  // + resizer + gaps computed by the caller). Right column keeps its
  // buttons flush right via .dq-header-right's justify-self: end.
  const headerStyle: React.CSSProperties | undefined =
    breakdown != null && breakdownLeftOffset != null
      ? { gridTemplateColumns: `${breakdownLeftOffset}px auto 1fr` }
      : undefined;

  return (
    <div className="dq-header" style={headerStyle}>
      <div className="dq-header-left">
        {USE_OKTA && <div className="dq-header-brand">TCW</div>}
        <h1 className="dq-header-title">DATA QUALITY MONITOR</h1>
      </div>

      {breakdown != null && (
        <div className="dq-header-breakdown">{breakdown}</div>
      )}

      <div className="dq-header-right">
        {onBulkStatusClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onBulkStatusClick}
          >
            {bulkStatusLabel ?? "Bulk Status"}
          </button>
        )}
        {onBulkAssignClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onBulkAssignClick}
          >
            {bulkAssignLabel ?? "Bulk Assign"}
          </button>
        )}
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
