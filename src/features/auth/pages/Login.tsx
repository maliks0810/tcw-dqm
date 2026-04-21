import React from "react";
import { useAuth } from "../../../contexts/auth-context";

export default function LoginPage() {
  const { login, loading } = useAuth();

  return (
    <div style={{ padding: 24 }}>
      <h2>Login</h2>
      <p>Please login using Okta.</p>
      <button onClick={() => login()} disabled={loading}>
        OKTA Login
      </button>
    </div>
  );
}