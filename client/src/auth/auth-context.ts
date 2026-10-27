
import { createContext, useContext } from "react";

export type StaffRole = "ADMIN" | "RECEPTIONIST";

export interface AuthStaff {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
}

export interface AuthContextValue {
  staff: AuthStaff | null;
  loading: boolean;

  login: (
    email: string,
    password: string
  ) => Promise<void>;

  logout: () => Promise<void>;
}

export const AuthContext =
  createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }

  return context;
}
