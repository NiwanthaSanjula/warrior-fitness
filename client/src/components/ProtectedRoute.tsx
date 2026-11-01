
import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router";
import type { ReactNode } from "react";

import { Dumbbell } from "lucide-react";
import { useAuth } from "../auth/auth-context";
import { hasPermissions, type Permission } from "../auth/permissions";
import { equipmentLoginReturn } from "../utils/equipment";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gym-bg">
      <Dumbbell
        size={42}
        className="animate-pulse text-gym-orange"
      />

      <p className="text-sm font-semibold tracking-widest text-gym-muted">
        LOADING WARRIOR FITNESS...
      </p>
    </div>
  );
}

// Allow only authenticated staff
export function ProtectedRoute() {
  const { staff, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!staff) {
    return <Navigate to="/login" replace state={/^\/equipment(?:\/|$)/.test(location.pathname) ? { equipmentReturnTo: location.pathname } : undefined} />;
  }

  return <Outlet />;
}

// Login page is only for unauthenticated users
export function PublicOnlyRoute() {
  const { staff, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (staff) {
    return <Navigate to={equipmentLoginReturn(location.state)} replace />;
  }

  return <Outlet />;
}

// Admin-only frontend route
export function AdminOnlyRoute() {
  const { staff } = useAuth();

  if (staff?.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function PermissionRoute({ permissions, children }: { permissions: Permission[]; children?: ReactNode }) {
  const { staff } = useAuth();
  return hasPermissions(staff, ...permissions) ? children ?? <Outlet /> : <Navigate to="/dashboard" replace />;
}
