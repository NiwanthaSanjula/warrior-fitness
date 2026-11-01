
import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router";
import type { ReactNode } from "react";

import gymLogo from "../assets/LOGO.png";
import { useAuth } from "../auth/auth-context";
import { canMutate, canUseFrontDesk, hasPermissions, type Permission } from "../auth/permissions";
import { equipmentLoginReturn } from "../utils/equipment";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gym-bg">
      <img src={gymLogo} alt="" className="h-20 w-16 object-contain motion-safe:animate-pulse" />

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

export function FrontDeskRoute({ children }: { children: ReactNode }) {
  const { staff } = useAuth();
  return canUseFrontDesk(staff) ? children : <Navigate to="/dashboard" replace />;
}

export function MutationRoute({ children }: { children: ReactNode }) {
  const { staff } = useAuth();
  return canMutate(staff) ? children : <Navigate to="/dashboard" replace />;
}
