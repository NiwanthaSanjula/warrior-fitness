
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { authApi } from "../api/auth.api";

import {
  AuthContext,
  type AuthStaff,
} from "./auth-context";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [staff, setStaff] = useState<AuthStaff | null>(
    null
  );

  const [loading, setLoading] = useState(true);

  // Restore session when the application loads
  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await authApi.getCurrentStaff();

        if (active) {
          setStaff(response.staff);
        }
      } catch {
        if (active) {
          setStaff(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  // Staff login
  async function login(
    email: string,
    password: string
  ): Promise<void> {
    const response = await authApi.login(
      email,
      password
    );

    setStaff(response.staff);
  }

  // Staff logout
  async function logout(): Promise<void> {
    await authApi.logout();

    setStaff(null);
  }

  return (
    <AuthContext.Provider
      value={{
        staff,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
