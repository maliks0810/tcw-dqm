import React from "react";
import { useAuth } from "../contexts/auth-context";

export function UserBadge() {
  const { user, logout, loading } = useAuth();

  if (loading) return null;
  if (!user) return null;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span>👤 {user.userId}</span>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}