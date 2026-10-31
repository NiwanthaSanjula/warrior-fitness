import type { ReactNode } from "react";
import { useAuth } from "../auth/auth-context";
import { hasPermissions, type Permission } from "../auth/permissions";

export default function PermissionGate({ permissions, children }: { permissions: Permission[]; children: ReactNode }) {
  const { staff } = useAuth();
  return hasPermissions(staff, ...permissions) ? children : null;
}
