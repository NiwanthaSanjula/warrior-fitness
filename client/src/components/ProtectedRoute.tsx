
import {
  Navigate,
  Outlet,
} from "react-router";

import { Dumbbell } from "lucide-react";
import { useAuth } from "../auth/auth-context";

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

  if (loading) {
    return <LoadingScreen />;
  }

  if (!staff) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Login page is only for unauthenticated users
export function PublicOnlyRoute() {
  const { staff, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (staff) {
    return <Navigate to="/dashboard" replace />;
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
