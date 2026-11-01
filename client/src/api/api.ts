
import axios from "axios";
import { resolveApiBaseUrl } from "./api-url";

export const api = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, import.meta.env.PROD),
  timeout: 10000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => { unauthorizedListeners.delete(listener); };
}

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // /me belongs to AuthProvider's revision-checked restoration. A stale
    // anonymous refresh must not invalidate a newer successful demo/staff login.
    if (axios.isAxiosError(error) && error.response?.status === 401 &&
      !["/auth/login", "/auth/demo-login", "/auth/me"].includes(error.config?.url ?? "")) {
      for (const listener of unauthorizedListeners) listener();
    }
    return Promise.reject(error);
  }
);

interface ApiErrorResponse {
  success?: boolean;
  message?: string;
}

export function getApiErrorMessage(
  error: unknown
): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.code === "ECONNABORTED") {
      return "Request timed out. Please try again.";
    }

    if (!error.response) {
      return "Unable to connect to the server.";
    }
  }

  return "Something went wrong. Please try again.";
}
