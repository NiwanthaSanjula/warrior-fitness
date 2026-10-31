import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/auth/AuthProvider";
import { useAuth } from "../src/auth/auth-context";
import { authApi } from "../src/api/auth.api";
import { api } from "../src/api/api";
import { AxiosError, AxiosHeaders } from "axios";
import { admin } from "./helpers/auth";

vi.mock("../src/api/auth.api", () => ({
  authApi: { getCurrentStaff: vi.fn(), login: vi.fn(), logout: vi.fn() },
}));

const restored = { success: true, staff: admin };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

function AuthenticationProbe() {
  const { staff, loading, login, logout } = useAuth();
  const [error, setError] = useState("");
  return (
    <>
      <output aria-label="Session">{loading ? "loading" : staff?.fullName ?? "signed out"}</output>
      <button onClick={() => { void login("admin@example.test", "fictional-test-password").catch(() => setError("Login failed")); }}>Log in</button>
      <button onClick={() => { void logout().catch(() => setError("Logout failed")); }}>Log out</button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function renderSession() {
  return render(<AuthProvider><AuthenticationProbe /></AuthProvider>);
}

async function rejectApiRequest(status: number, url = "/members") {
  return api.get(url, {
    adapter: (config) => Promise.reject(new AxiosError("Fictional authorization response", "ERR_BAD_REQUEST", config, undefined, {
      status, statusText: "Unauthorized", headers: new AxiosHeaders(), config, data: { message: "Fictional response" },
    })),
  });
}

describe("real AuthProvider state with a mocked API boundary", () => {
  beforeEach(() => {
    vi.mocked(authApi.getCurrentStaff).mockReset();
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.logout).mockReset();
  });

  it("restores staff after a successful current-session response", async () => {
    vi.mocked(authApi.getCurrentStaff).mockResolvedValue(restored);
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    expect(authApi.getCurrentStaff).toHaveBeenCalledTimes(1);
  });

  it("becomes signed out after session restoration fails", async () => {
    vi.mocked(authApi.getCurrentStaff).mockRejectedValue(new Error("Fictional unavailable session"));
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent("signed out"));
  });

  it("keeps authentication loading until restoration settles", async () => {
    const pending = deferred<typeof restored>();
    vi.mocked(authApi.getCurrentStaff).mockReturnValue(pending.promise);
    renderSession();
    expect(screen.getByLabelText("Session")).toHaveTextContent("loading");
    await act(async () => { pending.resolve(restored); });
    expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName);
  });

  it("updates staff after successful login", async () => {
    vi.mocked(authApi.getCurrentStaff).mockRejectedValue(new Error("Fictional missing session"));
    vi.mocked(authApi.login).mockResolvedValue(restored);
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent("signed out"));
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    expect(authApi.login).toHaveBeenCalledTimes(1);
  });

  it("retains signed-out state when login fails", async () => {
    vi.mocked(authApi.getCurrentStaff).mockRejectedValue(new Error("Fictional missing session"));
    vi.mocked(authApi.login).mockRejectedValue(new Error("Fictional invalid credentials"));
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent("signed out"));
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Login failed");
    expect(screen.getByLabelText("Session")).toHaveTextContent("signed out");
  });

  it("clears staff only after logout succeeds", async () => {
    const pending = deferred<{ success: boolean; message: string }>();
    vi.mocked(authApi.getCurrentStaff).mockResolvedValue(restored);
    vi.mocked(authApi.logout).mockReturnValue(pending.promise);
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName);
    await act(async () => { pending.resolve({ success: true, message: "Logged out" }); });
    expect(screen.getByLabelText("Session")).toHaveTextContent("signed out");
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });

  it("retains staff if the logout request fails", async () => {
    vi.mocked(authApi.getCurrentStaff).mockResolvedValue(restored);
    vi.mocked(authApi.logout).mockRejectedValue(new Error("Fictional logout failure"));
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Logout failed");
    expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName);
  });

  it("clears authenticated state after an actual Axios interceptor receives a protected 401", async () => {
    vi.mocked(authApi.getCurrentStaff).mockResolvedValue(restored);
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    await act(async () => { await expect(rejectApiRequest(401)).rejects.toHaveProperty("response.status", 401); });
    expect(screen.getByLabelText("Session")).toHaveTextContent("signed out");
  });

  it.each([[403, "/members"], [401, "/auth/login"]] as const)("keeps staff for a %s response from %s", async (status, url) => {
    vi.mocked(authApi.getCurrentStaff).mockResolvedValue(restored);
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    await act(async () => { await expect(rejectApiRequest(status, url)).rejects.toHaveProperty("response.status", status); });
    expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName);
  });

  it("revalidates the session on window focus and removes revoked access", async () => {
    vi.mocked(authApi.getCurrentStaff).mockResolvedValueOnce(restored).mockRejectedValueOnce(
      new AxiosError("Fictional revoked session", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 401, statusText: "Unauthorized", headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() }, data: {},
      })
    );
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    fireEvent.focus(window);
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent("signed out"));
    expect(authApi.getCurrentStaff).toHaveBeenCalledTimes(2);
  });

  it("does not sign out a known session for a transient focus-refresh failure", async () => {
    vi.mocked(authApi.getCurrentStaff).mockResolvedValueOnce(restored).mockRejectedValueOnce(new Error("Fictional offline response"));
    renderSession();
    await waitFor(() => expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName));
    fireEvent.focus(window);
    await waitFor(() => expect(authApi.getCurrentStaff).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Session")).toHaveTextContent(admin.fullName);
  });

  it("does not restore stale staff after a protected 401 overtakes restoration", async () => {
    const pending = deferred<typeof restored>();
    vi.mocked(authApi.getCurrentStaff).mockReturnValue(pending.promise);
    renderSession();
    await act(async () => { await expect(rejectApiRequest(401)).rejects.toHaveProperty("response.status", 401); });
    await act(async () => { pending.resolve(restored); });
    expect(screen.getByLabelText("Session")).toHaveTextContent("signed out");
  });
});
