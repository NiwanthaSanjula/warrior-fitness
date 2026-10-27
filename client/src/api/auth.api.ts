
import { api } from "./api";

import type { AuthStaff } from "../auth/auth-context";

interface AuthResponse {
  success: boolean;
  staff: AuthStaff;
  message?: string;
}

interface LogoutResponse {
  success: boolean;
  message: string;
}

export const authApi = {
  // Staff login
  async login(email: string, password: string) {
    const response = await api.post<AuthResponse>(
      "/auth/login",
      {
        email,
        password,
      }
    );

    return response.data;
  },

  // Get authenticated staff
  async getCurrentStaff() {
    const response = await api.get<AuthResponse>(
      "/auth/me"
    );

    return response.data;
  },

  // Staff logout
  async logout() {
    const response = await api.post<LogoutResponse>(
      "/auth/logout"
    );

    return response.data;
  },
};
