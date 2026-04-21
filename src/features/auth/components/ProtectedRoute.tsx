import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useOktaAuth } from "@okta/okta-react";
import { USE_OKTA } from "../../../services/auth-mode";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const oktaCtx = useOktaAuth();
  const authState = oktaCtx?.authState;
  const location = useLocation();

  if (!USE_OKTA) {
    return <>{children}</>;
  }

  if (!authState || authState?.isPending) {
    return <div style={{ padding: 24 }}>Checking authentication…</div>;
  }

  if (!authState.isAuthenticated) {
    // 🔐 redirect to login page
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
