import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OktaProvider from "./contexts/okta-provider";
import LoginPage from "./features/auth/pages/LoginPage";
import LoginCallbackPage from "./features/auth/pages/LoginCallback";
import { ProtectedRoute } from "./features/auth/components/ProtectedRoute";
import Home from "./features/home/pages/Home";
import DqMonitorPage from "./features/dq-monitor/pages/DqMonitorPage";
import { USE_OKTA } from "./services/auth-mode";

export default function App() {
  if (!USE_OKTA) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DqMonitorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <OktaProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/callback" element={<LoginCallbackPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DqMonitorPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </OktaProvider>
  );
}
