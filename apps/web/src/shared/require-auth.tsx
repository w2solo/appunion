import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../shared/auth";

export function RequireAuth({
  children,
  admin,
  superAdmin,
}: {
  children: ReactNode;
  admin?: boolean;
  superAdmin?: boolean;
}) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <p className="p-8 text-muted">加载中…</p>;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  if (superAdmin && !user.superAdmin) return <Navigate to="/403" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/403" replace />;
  return children;
}
