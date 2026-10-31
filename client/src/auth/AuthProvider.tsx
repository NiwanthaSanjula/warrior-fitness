
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { authApi } from "../api/auth.api";
import { onUnauthorized } from "../api/api";
import { isAxiosError } from "axios";

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
  const authRevision = useRef(0);

  // Restore session when the application loads
  useEffect(() => {
    let active = true;
    const unsubscribe = onUnauthorized(() => {
      authRevision.current++;
      setStaff(null);
      setLoading(false);
    });

    async function restoreSession(revalidate = false) {
      const revision = authRevision.current;
      try {
        const response = await authApi.getCurrentStaff();

        if (active && revision === authRevision.current) {
          setStaff(response.staff);
        }
      } catch (error: unknown) {
        if (active && revision === authRevision.current &&
          (!revalidate || (isAxiosError(error) && error.response?.status === 401))) {
          setStaff(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void restoreSession();
    const refreshOnFocus = () => { void restoreSession(true); };
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  // Staff login
  async function login(
    email: string,
    password: string
  ): Promise<void> {
    const revision = ++authRevision.current;
    const response = await authApi.login(
      email,
      password
    );

    if (revision === authRevision.current) setStaff(response.staff);
  }

  // Staff logout
  async function logout(): Promise<void> {
    const revision = ++authRevision.current;
    await authApi.logout();

    if (revision === authRevision.current) setStaff(null);
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
