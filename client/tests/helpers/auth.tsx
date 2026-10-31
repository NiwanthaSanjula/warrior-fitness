import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { AuthContext, type AuthContextValue, type AuthStaff, type StaffRole } from "../../src/auth/auth-context";
import { PERMISSIONS, RECEPTIONIST_PERMISSIONS } from "../../../server/src/modules/auth/permissions";

export const admin: AuthStaff = {
  id: "000000000000000000000001",
  fullName: "Example Admin",
  email: "admin@example.test",
  role: "ADMIN",
  permissions: [...PERMISSIONS],
};

export const receptionist: AuthStaff = {
  id: "000000000000000000000002",
  fullName: "Example Receptionist",
  email: "reception@example.test",
  role: "RECEPTIONIST",
  permissions: [...RECEPTIONIST_PERMISSIONS],
};

export function authState(role: StaffRole | null, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    staff: role === null ? null : { ...(role === "ADMIN" ? admin : receptionist) },
    loading: false,
    login: vi.fn<AuthContextValue["login"]>().mockResolvedValue(undefined),
    logout: vi.fn<AuthContextValue["logout"]>().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function renderWithAuth(ui: ReactElement, value: AuthContextValue, path = "/dashboard") {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthContext.Provider>
  );
}
